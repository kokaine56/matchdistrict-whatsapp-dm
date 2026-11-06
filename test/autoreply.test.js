import test from 'node:test';
import assert from 'node:assert/strict';

process.env.ACCESS_TOKEN = 'test-token';
process.env.PHONE_NUMBER_ID = 'test-phone-id';

import { loadConfig, saveConfig } from '../src/config.js';
import { sendConfiguredAutoReply } from '../src/whatsapp.js';

test('loadConfig provides the default CTA Link Button auto-reply configuration', async () => {
  const config = await loadConfig();
  assert.equal(config.autoReply.type, 'link');
  assert.equal(
    config.autoReply.text,
    "BGMI TOURNAMENT\n🏆 PRIZE POOL – ₹10,000\n🔥 REGISTRATION LIVE!\nSecure your spot now. Join ASAP and compete for the prize!\n\nRegister Now | Match District"
  );
  assert.deepEqual(config.autoReply.link, {
    title: 'Discord',
    url: 'https://discord.gg/zMVN8ZmqTP'
  });
});

test('sendConfiguredAutoReply formats the CTA URL payload correctly for Meta Graph API', async () => {
  let interceptedPayload = null;

  // Intercept global fetch to inspect callMetaGraphApi payload
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    interceptedPayload = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      json: async () => ({ messages: [{ id: 'wamid.test-auto-reply' }] })
    };
  };

  try {
    const config = await loadConfig();
    const result = await sendConfiguredAutoReply({
      to: '15551234567',
      autoReplyConfig: config.autoReply
    });

    assert.equal(result.messages[0].id, 'wamid.test-auto-reply');
    assert.ok(interceptedPayload, 'Meta Graph API should have been called');
    assert.equal(interceptedPayload.messaging_product, 'whatsapp');
    assert.equal(interceptedPayload.to, '15551234567');
    assert.equal(interceptedPayload.type, 'interactive');
    assert.equal(interceptedPayload.interactive.type, 'cta_url');
    assert.equal(
      interceptedPayload.interactive.body.text,
      "BGMI TOURNAMENT\n🏆 PRIZE POOL – ₹10,000\n🔥 REGISTRATION LIVE!\nSecure your spot now. Join ASAP and compete for the prize!\n\nRegister Now | Match District"
    );
    assert.equal(interceptedPayload.interactive.footer, undefined, 'No footer should be sent');
    assert.deepEqual(interceptedPayload, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '15551234567',
      type: 'interactive',
      interactive: {
        type: 'cta_url',
        body: {
          text: "BGMI TOURNAMENT\n🏆 PRIZE POOL – ₹10,000\n🔥 REGISTRATION LIVE!\nSecure your spot now. Join ASAP and compete for the prize!\n\nRegister Now | Match District"
        },
        action: {
          name: 'cta_url',
          parameters: {
            display_text: 'Discord',
            url: 'https://discord.gg/zMVN8ZmqTP'
          }
        }
      }
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
