import 'dotenv/config';
import express from 'express';
import { runCampaign } from './campaign.js';
import { sendTextMessage } from './whatsapp.js';

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

/**
 * Health check & status endpoint (GET /)
 */
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'matchdistrict-whatsapp-dm',
    message: 'WhatsApp Outreach & Auto-Reply service is running.',
    endpoints: {
      sendCampaign: 'POST /send-campaign',
      webhook: '/webhook'
    }
  });
});

// Set to avoid duplicate processing of incoming webhook retries
const processedMessageIds = new Set();
function trackProcessedMessage(messageId) {
  if (processedMessageIds.size > 2000) {
    const firstAdded = processedMessageIds.values().next().value;
    processedMessageIds.delete(firstAdded);
  }
  processedMessageIds.add(messageId);
}

/**
 * 1. Bulk first message endpoint
 * Body: { "template": "hello" | "hi" | "ek kam hai" }
 */
app.post('/send-campaign', async (req, res) => {
  const { template } = req.body || {};

  if (!template) {
    return res.status(400).json({
      error: 'Missing "template" parameter in request body.',
      supportedTemplates: ['hello', 'hi', 'ek kam hai']
    });
  }

  try {
    const result = await runCampaign(template);
    return res.json(result);
  } catch (err) {
    console.error('[Send Campaign Error]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * 2. Meta Webhook Verification (GET /webhook)
 */
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const verifyToken = process.env.WEBHOOK_VERIFY_TOKEN;

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('[Webhook] Verification successful');
    return res.status(200).send(challenge);
  }

  console.warn('[Webhook] Verification failed. Token mismatch.');
  return res.sendStatus(403);
});

/**
 * 3. Meta Incoming Messages Webhook (POST /webhook)
 * Handles incoming replies and sends auto-reply inside 24h window
 */
app.post('/webhook', async (req, res) => {
  // Acknowledge Meta immediately with 200 OK
  res.sendStatus(200);

  const body = req.body;
  if (!body || body.object !== 'whatsapp_business_account') {
    return;
  }

  const autoReplyText = process.env.AUTO_REPLY_TEXT || 'Hello! Thank you for reaching out. We will get back to you shortly.';

  try {
    const entries = body.entry || [];
    for (const entry of entries) {
      const changes = entry.changes || [];
      for (const change of changes) {
        const value = change.value;
        const messages = value?.messages;

        if (Array.isArray(messages) && messages.length > 0) {
          for (const msg of messages) {
            // Deduplicate incoming webhook messages
            if (msg.id && processedMessageIds.has(msg.id)) {
              continue;
            }
            if (msg.id) trackProcessedMessage(msg.id);

            const senderPhone = msg.from;
            console.log(`[Auto-Reply] Received message from ${senderPhone}. Sending auto-reply...`);

            try {
              // Send auto-reply text message inside 24h customer service window
              // Note: Does NOT count toward the 800 monthly outreach cap
              await sendTextMessage({
                to: senderPhone,
                text: autoReplyText
              });
              console.log(`[Auto-Reply] Successfully replied to ${senderPhone}`);
            } catch (replyErr) {
              console.error(`[Auto-Reply Error] Failed to reply to ${senderPhone}:`, replyErr.message);
            }
          }
        }
      }
    }
  } catch (err) {
    console.error('[Webhook Processing Error]', err.message);
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`WhatsApp Outreach Server running on port ${port}`);
});

