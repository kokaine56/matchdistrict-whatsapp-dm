import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { createHmac, timingSafeEqual } from 'crypto';
import { fileURLToPath } from 'url';

import {
  requireAuth,
  verifyAdminPassword,
  createSessionToken,
  COOKIE_NAME
} from './auth.js';
import { loadConfig, saveConfig } from './config.js';
import { runCampaign, getRecipientsSummary, CSV_FILE } from './campaign.js';
import { getCurrentMonthKey, getMonthSentCount } from './tracker.js';
import { sendConfiguredAutoReply, sendTextMessage } from './whatsapp.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set('trust proxy', true);
const port = process.env.PORT || 3000;

// Directories
const PUBLIC_DIR = path.resolve(__dirname, '../public');
const UPLOADS_DIR = path.resolve(__dirname, '../uploads');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Multer storage for uploaded media (publicly served for Meta Cloud API)
const imageStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const cleanBase = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    cb(null, `img_${Date.now()}_${cleanBase}${ext}`);
  }
});
const uploadImage = multer({ storage: imageStorage });

// Multer storage for recipients.csv
const csvStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.dirname(CSV_FILE)),
  filename: (req, file, cb) => cb(null, 'recipients.csv')
});
const uploadCsv = multer({ storage: csvStorage });

// Middleware
app.use(express.json({
  verify: (req, res, buffer) => { req.rawBody = Buffer.from(buffer); }
}));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Static Assets
// IMPORTANT: /uploads must stay public so Meta servers can fetch template header images & media
app.use('/uploads', express.static(UPLOADS_DIR));
app.use('/css', express.static(path.join(PUBLIC_DIR, 'css')));
app.use('/js', express.static(path.join(PUBLIC_DIR, 'js')));

// ==========================================
// 3. PUBLIC META WEBHOOK ROUTES (NO AUTH)
// ==========================================

// Webhook Verification (GET /webhook)
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const verifyToken = process.env.WEBHOOK_VERIFY_TOKEN;

  if (verifyToken && mode === 'subscribe' && typeof token === 'string' && token.trim() === verifyToken.trim() && challenge !== undefined) {
    return res.status(200).type('text/plain').send(String(challenge));
  }

  return res.sendStatus(403);
});

// In-memory bounded deduplication for Meta retries. Status transitions are distinct events.
const processedEventIds = new Set();
function markEventProcessed(id) {
  if (processedEventIds.has(id)) return false;
  processedEventIds.add(id);
  if (processedEventIds.size > 5000) processedEventIds.delete(processedEventIds.values().next().value);
  return true;
}

function hasValidMetaSignature(req) {
  const secret = process.env.META_APP_SECRET;
  const signature = req.get('x-hub-signature-256');
  if (!secret || !signature || !req.rawBody || !/^sha256=[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = `sha256=${createHmac('sha256', secret).update(req.rawBody).digest('hex')}`;
  const suppliedBytes = Buffer.from(signature, 'utf8');
  const expectedBytes = Buffer.from(expected, 'utf8');
  return suppliedBytes.length === expectedBytes.length && timingSafeEqual(suppliedBytes, expectedBytes);
}

// Webhook Receiver (POST /webhook)
// Handles incoming user messages & interactive button taps
app.post('/webhook', (req, res) => {
  if (!hasValidMetaSignature(req)) return res.sendStatus(401);
  // Acknowledge promptly; processing continues after the response.
  res.sendStatus(200);

  const body = req.body;
  if (!body || body.object !== 'whatsapp_business_account') {
    return;
  }

  void (async () => { try {
    const config = await loadConfig();
    const autoReplyConfig = config.autoReply || {};
    const entries = body.entry || [];

    for (const entry of entries) {
      const changes = entry.changes || [];
      for (const change of changes) {
        const value = change.value || {};
        for (const status of value.statuses || []) {
          const eventId = `status:${status.id}:${status.status}:${status.timestamp || ''}`;
          if (!markEventProcessed(eventId)) continue;
          // Log only provider message ID and state; recipient data and credentials stay private.
          console.log(`[Webhook Status] message=${String(status.id || '').slice(0, 80)} status=${String(status.status || 'unknown').slice(0, 20)}`);
          if (status.status === 'failed') {
            const codes = (status.errors || []).map(error => error.code).filter(Number.isFinite);
            console.warn(`[Webhook Status Failed] message=${String(status.id || '').slice(0, 80)} codes=${codes.join(',') || 'unspecified'}`);
          }
        }

        const messages = value.messages;

        if (Array.isArray(messages) && messages.length > 0) {
          for (const msg of messages) {
            if (msg.id && !markEventProcessed(`message:${msg.id}`)) continue;

            const senderPhone = msg.from;
            console.log(`[Webhook Message] Received type=${String(msg.type || 'unknown').slice(0, 20)}`);

            // 1. Check if user tapped an interactive reply button or quick-reply button
            let tappedButtonId = null;
            let tappedButtonText = null;

            if (msg.type === 'interactive' && msg.interactive?.button_reply) {
              tappedButtonId = msg.interactive.button_reply.id;
              tappedButtonText = msg.interactive.button_reply.title;
            } else if (msg.type === 'button' && msg.button) {
              tappedButtonId = msg.button.payload;
              tappedButtonText = msg.button.text;
            }

            // If a button was tapped, check if there's a configured follow-up reply for that button
            let handledAsButtonTap = false;
            if (tappedButtonId || tappedButtonText) {
              const configuredButtons = autoReplyConfig.buttons || [];
              const matchedBtn = configuredButtons.find(b =>
                (tappedButtonId && b.id === tappedButtonId) ||
                (tappedButtonText && b.title?.toLowerCase() === tappedButtonText.toLowerCase())
              );

              if (matchedBtn && matchedBtn.reply) {
                handledAsButtonTap = true;
                console.log('[Webhook] Configured button reply matched. Sending follow-up reply.');
                try {
                  // Follow-up reply to button tap (does NOT count toward 800 cap)
                  await sendTextMessage({
                    to: senderPhone,
                    text: matchedBtn.reply
                  });
                  console.log('[Webhook] Follow-up reply sent.');
                } catch (err) {
                  console.error('[Webhook Button Reply Error] Could not send configured button reply.');
                }
              }
            }

            // 2. If not handled as button tap, send standard configured auto-reply
            if (!handledAsButtonTap) {
              console.log('[Webhook] Sending configured auto-reply.');
              try {
                // Auto-reply to user response (does NOT count toward 800 cap)
                await sendConfiguredAutoReply({
                  to: senderPhone,
                  autoReplyConfig
                });
                console.log('[Webhook] Auto-reply sent.');
              } catch (err) {
                console.error('[Webhook Auto-Reply Error] Could not send configured auto-reply.');
              }
            }
          }
        }
      }
    }
  } catch (err) {
    console.error('[Webhook Processing Error] Event processing failed.');
  } })();
});


// ==========================================
// 1. AUTHENTICATION ROUTES
// ==========================================

// Serve Login Page
app.get('/login', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'login.html'));
});

// Process Login Form
app.post('/login', (req, res) => {
  const { password } = req.body;

  if (verifyAdminPassword(password)) {
    const token = createSessionToken();
    res.cookie(COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });
    return res.redirect('/');
  }

  return res.redirect('/login?error=invalid');
});

// Process Logout
app.post('/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME);
  return res.redirect('/login');
});

// ==========================================
// 2. PROTECTED ADMIN DASHBOARD & API
// ==========================================

// Dashboard Home (Protected)
app.get('/', requireAuth, (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// Webhook setup values are only available to an authenticated dashboard session.
app.get('/api/webhook-setup', requireAuth, (req, res) => {
  let baseUrl = process.env.PUBLIC_BASE_URL;
  if (baseUrl) {
    try { baseUrl = new URL(baseUrl).origin; }
    catch { return res.status(500).json({ error: 'PUBLIC_BASE_URL must be a valid public URL' }); }
  } else {
    const forwardedHost = req.get('x-forwarded-host')?.split(',')[0]?.trim();
    const host = forwardedHost || req.get('host');
    const forwardedProto = req.get('x-forwarded-proto')?.split(',')[0]?.trim();
    const protocol = forwardedProto || req.protocol;
    if (!host) return res.status(400).json({ error: 'Could not detect the public host' });
    baseUrl = `${protocol}://${host}`;
  }
  let hostname = '';
  try { hostname = new URL(baseUrl).hostname.toLowerCase(); } catch { /* URL validated above */ }
  res.json({
    callbackUrl: `${baseUrl.replace(/\/$/, '')}/webhook`,
    verifyToken: process.env.WEBHOOK_VERIFY_TOKEN || '',
    isLocalhost: hostname === 'localhost' || hostname === '127.0.0.1'
  });
});

// Get Config
app.get('/api/config', requireAuth, async (req, res) => {
  try {
    const config = await loadConfig();
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update Config
app.post('/api/config', requireAuth, async (req, res) => {
  try {
    const current = await loadConfig();
    const updated = {
      campaign: { ...current.campaign, ...(req.body.campaign || {}) },
      autoReply: { ...current.autoReply, ...(req.body.autoReply || {}) }
    };
    await saveConfig(updated);
    res.json({ status: 'ok', config: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get Monthly Stats & Limit
app.get('/api/stats', requireAuth, async (req, res) => {
  try {
    const monthKey = getCurrentMonthKey();
    const count = await getMonthSentCount(monthKey);
    const limit = parseInt(process.env.MONTHLY_LIMIT || '800', 10);
    res.json({
      monthKey,
      monthSentCount: count,
      monthlyLimit: limit,
      remaining: Math.max(0, limit - count)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get Recipients Summary
app.get('/api/recipients', requireAuth, async (req, res) => {
  try {
    const summary = await getRecipientsSummary();
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Upload Recipients CSV
app.post('/api/upload-recipients', requireAuth, uploadCsv.single('file'), async (req, res) => {
  try {
    const summary = await getRecipientsSummary();
    res.json({ status: 'ok', summary });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Upload Public Header or Reply Image
app.post('/api/upload-image', requireAuth, uploadImage.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image file uploaded' });
  }

  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.get('host');
  const publicUrl = `${protocol}://${host}/uploads/${req.file.filename}`;

  return res.json({
    status: 'ok',
    filename: req.file.filename,
    url: publicUrl
  });
});

// Execute Campaign Send
app.post('/api/send-campaign', requireAuth, async (req, res) => {
  try {
    const override = req.body?.campaign || null;
    const result = await runCampaign(override);
    res.json(result);
  } catch (err) {
    console.error('[Send Campaign Error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Legacy POST /send-campaign endpoint (also protected)
app.post('/send-campaign', requireAuth, async (req, res) => {
  try {
    const templateName = req.body?.template;
    const override = templateName ? { template: templateName } : null;
    const result = await runCampaign(override);
    res.json(result);
  } catch (err) {
    console.error('[Send Campaign Error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Start Server
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  app.listen(port, '0.0.0.0', () => {
    console.log(`WhatsApp Outreach & Admin Console running at http://0.0.0.0:${port}`);
  });
}

export { app, hasValidMetaSignature };
