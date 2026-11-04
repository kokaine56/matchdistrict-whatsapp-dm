import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import multer from 'multer';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { createHmac, timingSafeEqual, randomUUID } from 'crypto';
import { fileURLToPath } from 'url';

import {
  requireAuth,
  verifyAdminPassword,
  createSessionToken,
  COOKIE_NAME
} from './auth.js';
import { loadConfig, saveConfig } from './config.js';
import { runCampaign, getRecipientsSummary, addRecipientsToCsv, updateRecipientOptIn, updateAllRecipientOptIn, normalizeRecipientsCsv, readRecipientsFromCsv, CSV_FILE } from './campaign.js';
import { getCurrentMonthKey, getMonthlyLimit, getMonthSentCount, isAlreadySentThisMonth, normalizePhone, recordSuccessfulSend, recordFailedSend } from './tracker.js';
import { addLog, db, DATABASE_PATH, getRecentLogs, logEvents, recordOutboundMessage, updateLogForMessageStatus } from './database.js';
import { getApprovedMessageTemplates, getAllMessageTemplates, getMessageTemplateDefinition, createMessageTemplate, sendTemplateMessage, sendConfiguredAutoReply, sendTextMessage } from './whatsapp.js';

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
const uploadDb = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

// Meta verification is intentionally handled before any middleware.
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const verifyToken = process.env.WEBHOOK_VERIFY_TOKEN;

  if (
    verifyToken &&
    mode === 'subscribe' &&
    typeof token === 'string' &&
    token.trim() === verifyToken.trim() &&
    challenge !== undefined
  ) {
    return res.status(200).type('text/plain').send(String(challenge));
  }

  return res.sendStatus(403);
});

// Middleware
app.use('/webhook', express.json({
  limit: '3mb',
  verify: (req, res, buf) => { req.rawBody = buf; }
}));
app.use(express.json({
  limit: '3mb',
  type: req => req.path.replace(/\/+$/, '') !== '/webhook'
}));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use((err, req, res, next) => {
  if (req.path.replace(/\/+$/, '') === '/webhook') {
    const size = req.rawBody?.length || 0;
    addLog({ action: 'webhook', details: `Incoming POST /webhook · event type: malformed JSON · size: ${size} bytes` });
    if (!getMetaAppSecret()) addLog({ action: 'webhook', details: 'META_APP_SECRET not set' });
    return res.sendStatus(200);
  }
  return next(err);
});

// Static Assets
// IMPORTANT: /uploads must stay public so Meta servers can fetch template header images & media
app.use('/uploads', express.static(UPLOADS_DIR));
app.use('/css', express.static(path.join(PUBLIC_DIR, 'css')));
app.use('/js', express.static(path.join(PUBLIC_DIR, 'js')));

// ==========================================
// 3. PUBLIC META WEBHOOK ROUTES (NO AUTH)
// ==========================================

// In-memory bounded deduplication for Meta retries. Status transitions are distinct events.
const processedEventIds = new Set();
function markEventProcessed(id) {
  if (processedEventIds.has(id)) return false;
  processedEventIds.add(id);
  if (processedEventIds.size > 5000) processedEventIds.delete(processedEventIds.values().next().value);
  return true;
}

function fullSendError(err) {
  return `Meta error ${err.metaCode ?? 'unknown'}: ${err.message}${err.errorDataDetails ? `\nerror_data.details: ${err.errorDataDetails}` : ''}\nJSON payload sent: ${JSON.stringify(err.payload || {})}`;
}

function getMetaAppSecret() {
  let secret = String(process.env.META_APP_SECRET || '').trim();
  while ((secret.startsWith('"') && secret.endsWith('"')) || (secret.startsWith("'") && secret.endsWith("'"))) {
    secret = secret.slice(1, -1).trim();
  }
  if (!secret || /^(your[_ -]?.*|<.*>|\{.*\}|replace[_ -]?.*|placeholder|change.?me|meta_app_secret)$/i.test(secret)) return '';
  return secret;
}

function verifyMetaSignature(req, secret) {
  const received = String(req.get('x-hub-signature-256') || '');
  const computed = `sha256=${createHmac('sha256', secret).update(req.rawBody).digest('hex')}`;
  const receivedBytes = Buffer.from(received, 'utf8');
  const computedBytes = Buffer.from(computed, 'utf8');
  const sameLength = receivedBytes.length === computedBytes.length;
  return { valid: sameLength && timingSafeEqual(receivedBytes, computedBytes), received, computed, sameLength };
}

function hasValidMetaSignature(req) {
  const secret = getMetaAppSecret();
  if (!secret || !Buffer.isBuffer(req.rawBody)) return false;
  return verifyMetaSignature(req, secret).valid;
}

// Webhook Receiver (POST /webhook)
// Handles incoming user messages & interactive button taps
app.post('/webhook', (req, res) => {
  const body = req.body;
  const eventTypes = [];
  for (const entry of body?.entry || []) for (const change of entry.changes || []) {
    if (change.value?.statuses?.length) eventTypes.push('statuses');
    if (change.value?.messages?.length) eventTypes.push('messages');
  }
  const eventType = [...new Set(eventTypes)].join(',') || String(body?.object || 'unknown');
  const bodySize = req.rawBody?.length || 0;
  addLog({ action: 'webhook', details: `Incoming POST /webhook · event type: ${eventType} · size: ${bodySize} bytes` });
  const metaAppSecret = getMetaAppSecret();
  if (!metaAppSecret) {
    addLog({ action: 'webhook', details: 'META_APP_SECRET not set' });
    return res.sendStatus(200);
  }
  const verification = Buffer.isBuffer(req.rawBody) ? verifyMetaSignature(req, metaAppSecret) : { valid: false, received: '', computed: '', sameLength: false };
  if (!verification.valid) {
    const receivedHex = verification.received.startsWith('sha256=') ? verification.received.slice(7) : verification.received;
    const computedHex = verification.computed.startsWith('sha256=') ? verification.computed.slice(7) : verification.computed;
    addLog({ action: 'signature_mismatch', details: `signature mismatch · received: ${receivedHex.slice(0, 6) || '(empty)'} · computed: ${computedHex.slice(0, 6)} · secret length: ${Buffer.byteLength(metaAppSecret)}` });
    return res.sendStatus(200);
  }
  // Acknowledge promptly; processing continues after the response.
  res.sendStatus(200);

  if (!body || body.object !== 'whatsapp_business_account') {
    return;
  }

  void (async () => { try {
    const config = await loadConfig().catch(error => { console.error('[Webhook Config Error]', error.message); return null; });
    const autoReplyConfig = config?.autoReply || {};
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
          const statusName = String(status.status || 'unknown');
          const statusErrors = Array.isArray(status.errors) ? status.errors : [];
          const errorDetail = statusErrors.length ? JSON.stringify(statusErrors) : '';
          const statusDetail = `Meta status ${statusName}${errorDetail ? ` · errors: ${errorDetail}` : ''} · message ID: ${status.id || 'unknown'}`;
          db.prepare(`INSERT INTO message_statuses(message_id, phone, status, details, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(message_id) DO UPDATE SET status=excluded.status, details=excluded.details, updated_at=excluded.updated_at`).run(String(status.id || ''), String(status.recipient_id || ''), statusName, statusDetail, new Date().toISOString());
          if (status.id) db.prepare('UPDATE outbound_messages SET status=?, failure_reason=? WHERE message_id=?').run(statusName, statusName === 'failed' ? errorDetail : null, String(status.id));
          if (status.id && statusName === 'failed') db.prepare("UPDATE sent_numbers SET status='failed', error=? WHERE message_id=?").run(statusDetail, String(status.id));
          const matchedSend = status.id ? (db.prepare('SELECT phone FROM outbound_messages WHERE message_id=?').get(String(status.id)) || db.prepare('SELECT phone FROM sent_numbers WHERE message_id=?').get(String(status.id))) : null;
          const statusAction = ['sent', 'delivered', 'read', 'failed'].includes(statusName) ? statusName : 'webhook';
          if (status.id && statusAction !== 'webhook') updateLogForMessageStatus(status.id, statusAction, statusDetail);
          addLog({ phone: status.recipient_id || matchedSend?.phone || '', action: statusAction, details: statusDetail });
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
            const receivedText = msg.text?.body || msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || msg.button?.text || msg.image?.caption || msg.video?.caption || `[${msg.type || 'message'}]`;
            addLog({ phone: senderPhone || '', action: 'reply_received', details: `Reply received: ${receivedText}` });

            if (!config || config.autoReplyEnabled === false) continue;

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
                  const sendResult = await sendTextMessage({
                    to: senderPhone,
                    text: matchedBtn.reply
                  });
                  recordOutboundMessage({ phone: senderPhone, messageId: sendResult.messages[0].id, messageType: 'auto-reply button follow-up' });
                  addLog({ phone: senderPhone, action: 'reply_sent', details: `Reply sent: ${matchedBtn.reply} · Meta message ID: ${sendResult.messages[0].id}` });
                  console.log('[Webhook] Follow-up reply sent.');
                } catch (err) {
                  addLog({ phone: senderPhone, action: 'failed', details: `Reply failed: ${fullSendError(err)}` });
                  console.error('[Webhook Button Reply Error] Could not send configured button reply.');
                }
              }
            }

            // 2. If not handled as button tap, send standard configured auto-reply
            if (!handledAsButtonTap) {
              console.log('[Webhook] Sending configured auto-reply.');
              try {
                // Auto-reply to user response (does NOT count toward 800 cap)
                const sendResult = await sendConfiguredAutoReply({
                  to: senderPhone,
                  autoReplyConfig
                });
                recordOutboundMessage({ phone: senderPhone, messageId: sendResult.messages[0].id, messageType: 'auto-reply' });
                addLog({ phone: senderPhone, action: 'reply_sent', details: `Auto-reply sent · Meta message ID: ${sendResult.messages[0].id}` });
                console.log('[Webhook] Auto-reply sent.');
              } catch (err) {
                addLog({ phone: senderPhone, action: 'failed', details: `Auto-reply failed: ${fullSendError(err)}` });
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
app.get('/api/message-templates', requireAuth, async (req, res) => {
  try {
    res.json({ templates: await getApprovedMessageTemplates() });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.get('/api/admin/message-templates', requireAuth, async (req, res) => {
  try { res.json({ templates: await getAllMessageTemplates() }); }
  catch (err) { res.status(502).json({ error: err.message, metaCode: err.metaCode, errorDataDetails: err.errorDataDetails }); }
});

app.post('/api/admin/message-templates/refresh', requireAuth, async (req, res) => {
  try { res.json({ templates: await getAllMessageTemplates() }); }
  catch (err) { res.status(502).json({ error: err.message, metaCode: err.metaCode, errorDataDetails: err.errorDataDetails }); }
});

app.post('/api/admin/message-templates', requireAuth, uploadImage.single('headerImage'), async (req, res) => {
  try {
    const name = String(req.body.name || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    const language = String(req.body.language || '').trim();
    const category = String(req.body.category || '').toUpperCase();
    const bodyText = String(req.body.body || '').trim();
    if (!name || !language || !bodyText || !['MARKETING', 'UTILITY'].includes(category)) return res.status(400).json({ error: 'Name, language, body, and MARKETING or UTILITY category are required.' });
    const components = [];
    const headerType = req.body.headerType || 'none';
    if (headerType === 'text') components.push({ type: 'HEADER', format: 'TEXT', text: String(req.body.headerText || '').trim() });
    if (headerType === 'image') {
      if (!req.file) return res.status(400).json({ error: 'Choose an image for the header.' });
      components.push({ type: 'HEADER', format: 'IMAGE', example: { header_handle: [] } });
    }
    const sampleValues = JSON.parse(req.body.sampleValues || '[]');
    const variables = [...bodyText.matchAll(/\{\{(\d+)\}\}/g)].map(match => Number(match[1]));
    if (variables.length && (!Array.isArray(sampleValues) || variables.some(index => !String(sampleValues[index - 1] || '').trim()))) return res.status(400).json({ error: 'Provide a sample value for every body variable.' });
    components.push({ type: 'BODY', text: bodyText, ...(variables.length ? { example: { body_text: [variables.map(index => String(sampleValues[index - 1]))] } } : {}) });
    const footer = String(req.body.footer || '').trim();
    if (footer) components.push({ type: 'FOOTER', text: footer });
    const buttons = JSON.parse(req.body.buttons || '[]');
    if (!Array.isArray(buttons) || buttons.length > 3 || (buttons.some(button => button.type !== 'QUICK_REPLY') && buttons.length > 1)) return res.status(400).json({ error: 'Use up to 3 quick replies, or exactly one URL or phone button.' });
    if (buttons.some(button => !String(button.text || '').trim() || String(button.text).length > 20)) return res.status(400).json({ error: 'Button labels are required and must be 20 characters or fewer.' });
    if (buttons.some(button => button.type === 'URL' && (!/^https:\/\//i.test(button.url || '') || button.url.length > 2000))) return res.status(400).json({ error: 'URL buttons require a valid HTTPS link.' });
    if (buttons.some(button => button.type === 'PHONE_NUMBER' && !/^\+?\d{10,15}$/.test(String(button.phone_number || '').replace(/[\s-]/g, '')))) return res.status(400).json({ error: 'Phone buttons require a 10 to 15 digit number.' });
    if (buttons.length) components.push({ type: 'BUTTONS', buttons });
    const template = { name, language, category, components };
    const result = await createMessageTemplate({ template, imagePath: req.file?.path, imageMime: req.file?.mimetype });
    res.json({ template: result });
  } catch (err) {
    const details = `${err.message}${err.metaCode !== undefined ? ` · Meta code ${err.metaCode}` : ''}${err.errorDataDetails ? ` · ${err.errorDataDetails}` : ''}${err.payload ? ` · JSON payload: ${JSON.stringify(err.payload)}` : ''}`;
    addLog({ action: 'failed', details: `Template creation failed: ${details}` });
    res.status(502).json({ error: err.message, metaCode: err.metaCode, errorDataDetails: err.errorDataDetails, payload: err.payload });
  }
});

app.post('/api/admin/send-one', requireAuth, async (req, res) => {
  const phone = normalizePhone(req.body?.phone);
  const monthlyLimit = getMonthlyLimit();
  const monthKey = getCurrentMonthKey();
  let payload;
  try {
    if (phone.length < 10 || phone.length > 15) return res.status(400).json({ error: 'Enter a 10 to 15 digit phone number with country code.' });
    const recipient = (await readRecipientsFromCsv()).find(item => normalizePhone(item.phone) === phone);
    if (!recipient?.optedIn) return res.status(403).json({ error: 'This number is not on the opted-in recipient list.' });
    if (await isAlreadySentThisMonth(phone)) return res.status(409).json({ error: 'This number has already been sent a message.' });
    if (await getMonthSentCount(monthKey) >= monthlyLimit) return res.status(429).json({ error: `Monthly limit of ${monthlyLimit} messages reached.` });
    let result;
    let label;
    if (req.body?.mode === 'template') {
      const name = String(req.body.templateName || '');
      const language = String(req.body.language || '');
      const definition = await getMessageTemplateDefinition(name, language);
      if (definition.status !== 'APPROVED') return res.status(400).json({ error: 'Only APPROVED templates can be sent.' });
      result = await sendTemplateMessage({ to: phone, templateName: name, languageCode: language, bodyVariables: req.body.variables || [], templateDefinition: definition });
      label = name;
    } else {
      const text = String(req.body?.text || '').trim();
      if (!text) return res.status(400).json({ error: 'Enter a plain text message or choose a template.' });
      result = await sendTextMessage({ to: phone, text });
      label = 'Plain text';
    }
    const messageId = result.messages[0].id;
    const count = await recordSuccessfulSend(phone, monthKey, label, messageId);
    res.json({ status: 'sent', phone, messageId, monthSentCount: count, monthlyLimit });
  } catch (err) {
    const detail = `Meta error ${err.metaCode ?? 'unknown'}: ${err.message}${err.errorDataDetails ? `; ${err.errorDataDetails}` : ''}\nJSON payload sent: ${JSON.stringify(err.payload || payload || {})}`;
    recordFailedSend(phone, String(req.body?.templateName || (req.body?.mode === 'text' ? 'Plain text' : '')), detail);
    res.status(err.responseStatus || 502).json({ error: err.message, metaCode: err.metaCode, errorDataDetails: err.errorDataDetails, payload: err.payload || payload, details: detail });
  }
});

app.get('/api/message-template-definition', requireAuth, async (req, res) => {
  try {
    const name = String(req.query.name || '');
    const language = String(req.query.language || '');
    if (!name) return res.status(400).json({ error: 'Template name is required.' });
    const template = await getMessageTemplateDefinition(name, language);
    const header = template.components?.find(component => component.type === 'HEADER');
    let sampleHeader = null;
    const sampleUrl = header?.format !== 'TEXT' ? header?.example?.header_handle?.[0] : null;
    if (sampleUrl && /^https:\/\//i.test(sampleUrl)) {
      try {
        const mediaResponse = await fetch(sampleUrl);
        if (mediaResponse.ok) {
          const ext = header.format === 'IMAGE' ? '.jpg' : header.format === 'VIDEO' ? '.mp4' : '.pdf';
          const fileName = `template_${Buffer.from(name).toString('hex').slice(0, 24)}${ext}`;
          await fs.promises.writeFile(path.join(UPLOADS_DIR, fileName), Buffer.from(await mediaResponse.arrayBuffer()));
          const base = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;
          sampleHeader = { fileName, url: `${base.replace(/\/$/, '')}/uploads/${fileName}` };
        }
      } catch (error) { console.warn('[Template sample download]', error.message); }
    }
    res.json({ template, sampleHeader });
  } catch (err) { res.status(502).json({ error: err.message }); }
});

app.post('/api/upload-template-media', requireAuth, uploadImage.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No media file uploaded.' });
  const base = process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`;
  res.json({ status: 'ok', fileName: req.file.filename, url: `${base.replace(/\/$/, '')}/uploads/${req.file.filename}` });
});

app.get('/api/config', requireAuth, async (req, res) => {
  try {
    const config = await loadConfig();
    res.json(config);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/logs', requireAuth, (req, res) => res.json({ logs: getRecentLogs(200) }));

app.get('/api/logs/stream', requireAuth, (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  res.write('retry: 3000\n\n');
  const push = row => res.write(`id: ${row.id}\nevent: log\ndata: ${JSON.stringify(row)}\n\n`);
  logEvents.on('log', push);
  const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 25000);
  req.on('close', () => { clearInterval(heartbeat); logEvents.off('log', push); });
});

app.get('/api/database/download', requireAuth, (req, res, next) => {
  try {
    addLog({ action: 'export', details: 'Database downloaded' });
    db.pragma('wal_checkpoint(TRUNCATE)');
    res.download(DATABASE_PATH, 'outreach.db');
  } catch (error) { next(error); }
});

app.post('/api/database/import', requireAuth, uploadDb.single('database'), (req, res) => {
  let importPath = '';
  let source;
  try {
    if (!req.file || path.extname(req.file.originalname).toLowerCase() !== '.db') return res.status(400).json({ error: 'Choose a .db file to import.' });
    importPath = path.join(path.dirname(DATABASE_PATH), `import_${randomUUID()}.db`);
    fs.writeFileSync(importPath, req.file.buffer);
    source = new Database(importPath, { readonly: true, fileMustExist: true });
    const tables = new Set(source.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => row.name));
    if (!tables.has('sent_numbers') || !tables.has('logs')) return res.status(400).json({ error: 'Database is missing sent_numbers or logs table.' });
    const sentCols = new Set(source.prepare('PRAGMA table_info(sent_numbers)').all().map(row => row.name));
    const logCols = new Set(source.prepare('PRAGMA table_info(logs)').all().map(row => row.name));
    if (!['phone', 'template', 'status', 'sent_at', 'error'].every(col => sentCols.has(col)) || !['id', 'timestamp', 'phone', 'action', 'details'].every(col => logCols.has(col))) {
      return res.status(400).json({ error: 'Database tables do not match the expected schema.' });
    }
    const incomingNumbers = source.prepare('SELECT phone, template, status, sent_at, error FROM sent_numbers').all();
    const incomingLogs = source.prepare('SELECT timestamp, phone, action, details FROM logs').all();
    const mergeNumber = db.prepare(`INSERT INTO sent_numbers(phone, template, status, sent_at, error) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(phone) DO UPDATE SET
        sent_at = CASE WHEN excluded.sent_at < sent_numbers.sent_at THEN excluded.sent_at ELSE sent_numbers.sent_at END,
        status = CASE WHEN sent_numbers.status='sent' OR excluded.status='sent' THEN 'sent' ELSE 'failed' END,
        template = CASE WHEN excluded.status='sent' AND sent_numbers.status!='sent' THEN excluded.template ELSE sent_numbers.template END,
        error = CASE WHEN sent_numbers.status='sent' OR excluded.status='sent' THEN NULL ELSE sent_numbers.error END`);
    let added = 0;
    const transaction = db.transaction(() => {
      for (const row of incomingNumbers) {
        const phone = String(row.phone || '').replace(/\D/g, '');
        if (!phone || !['sent', 'failed'].includes(row.status) || !Number.isFinite(Date.parse(row.sent_at))) continue;
        const exists = Boolean(db.prepare('SELECT 1 FROM sent_numbers WHERE phone=?').get(phone));
        mergeNumber.run(phone, String(row.template || ''), row.status, new Date(row.sent_at).toISOString(), row.error || null);
        if (!exists) added++;
      }
      const insertLog = db.prepare(`INSERT INTO logs(timestamp, phone, action, details)
        SELECT ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM logs WHERE timestamp=? AND phone=? AND action=? AND details=?)`);
      for (const row of incomingLogs) {
        if (!Number.isFinite(Date.parse(row.timestamp)) || !['sent', 'failed', 'skipped', 'reply_sent', 'import', 'export'].includes(row.action)) continue;
        insertLog.run(row.timestamp, row.phone || '', row.action, row.details || '', row.timestamp, row.phone || '', row.action, row.details || '');
      }
    });
    transaction();
    addLog({ action: 'import', details: `Database imported · ${added} numbers added` });
    res.json({ status: 'ok', added });
  } catch (error) { res.status(400).json({ error: `Database import failed: ${error.message}` }); }
  finally { source?.close(); if (importPath && fs.existsSync(importPath)) fs.unlinkSync(importPath); }
});

// Update Config
app.post('/api/config', requireAuth, async (req, res) => {
  try {
    const current = await loadConfig();
    const updatedAutoReply = req.body.autoReply ? {
      ...current.autoReply,
      ...req.body.autoReply,
      type: 'link',
      link: {
        ...current.autoReply.link,
        ...(req.body.autoReply.link || {})
      }
    } : current.autoReply;

    const updated = {
      autoReplyEnabled: typeof req.body.autoReplyEnabled === 'boolean' ? req.body.autoReplyEnabled : current.autoReplyEnabled,
      campaign: { ...current.campaign, ...(req.body.campaign || {}) },
      autoReply: updatedAutoReply
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
    const limit = getMonthlyLimit();
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

// Add recipients manually while preserving the existing CSV list.
app.post('/api/recipients', requireAuth, async (req, res) => {
  try {
    const result = await addRecipientsToCsv(req.body?.numbers || '', req.body?.optedIn === true);
    const summary = await getRecipientsSummary();
    res.json({ status: 'ok', ...result, summary });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.patch('/api/recipients/opt-in', requireAuth, async (req, res) => {
  try {
    const result = await updateRecipientOptIn(req.body?.phone, req.body?.optedIn);
    const summary = await getRecipientsSummary();
    res.json({ status: 'ok', ...result, summary });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.patch('/api/recipients/opt-in/all', requireAuth, async (req, res) => {
  try {
    const result = await updateAllRecipientOptIn(req.body?.optedIn);
    const summary = await getRecipientsSummary();
    res.json({ status: 'ok', ...result, summary });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Upload Recipients CSV
app.post('/api/upload-recipients', requireAuth, uploadCsv.single('file'), async (req, res) => {
  try {
    await normalizeRecipientsCsv();
    const summary = await getRecipientsSummary();
    res.json({ status: 'ok', summary });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Download / Export Recipients CSV
app.get('/api/recipients/export', requireAuth, (req, res) => {
  try {
    if (fs.existsSync(CSV_FILE)) {
      res.download(CSV_FILE, 'recipients.csv');
    } else {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="recipients.csv"');
      res.send('phone,opted_in\n');
    }
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
    res.status(500).json({ error: err.message, metaCode: err.metaCode, errorDataDetails: err.errorDataDetails, payload: err.payload });
  }
});

// Legacy POST /send-campaign endpoint (also protected)
app.post('/send-campaign', requireAuth, async (req, res) => {
  try {
    const templateName = req.body?.template;
    if (templateName && !req.body?.languageCode) {
      return res.status(400).json({ error: 'languageCode from an approved Meta template is required.' });
    }
    const override = templateName ? {
      template: templateName,
      languageCode: req.body?.languageCode
    } : null;
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
