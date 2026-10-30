/**
 * Supported templates mapping.
 * WhatsApp template names in Meta Business Manager must be lowercase alphanumeric with underscores.
 */
export const TEMPLATE_CONFIG = {
  'hello': {
    name: 'hello',
    languageCode: 'en_US'
  },
  'hi': {
    name: 'hi',
    languageCode: 'en_US'
  },
  'ek kam hai': {
    name: 'ek_kam_hai',
    languageCode: 'en_US'
  }
};

/**
 * Resolves requested template identifier to Meta template configuration.
 */
export function resolveTemplate(templateKey) {
  const normalizedKey = String(templateKey || '').trim().toLowerCase();
  if (TEMPLATE_CONFIG[normalizedKey]) {
    return TEMPLATE_CONFIG[normalizedKey];
  }

  // Also accept snake_cased versions or exact matches
  const snakeKey = normalizedKey.replace(/\s+/g, '_');
  const found = Object.values(TEMPLATE_CONFIG).find(t => t.name === snakeKey || t.name === normalizedKey);
  if (found) {
    return found;
  }

  return null;
}

/**
 * Send an approved WhatsApp template message.
 */
export async function sendTemplateMessage({ to, templateName, languageCode = 'en_US' }) {
  const accessToken = process.env.ACCESS_TOKEN;
  const phoneNumberId = process.env.PHONE_NUMBER_ID;

  if (!accessToken || !phoneNumberId) {
    throw new Error('ACCESS_TOKEN and PHONE_NUMBER_ID must be set in environment variables');
  }

  const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: {
        code: languageCode
      }
    }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorDetails = data?.error?.message || `HTTP ${response.status} ${response.statusText}`;
    throw new Error(errorDetails);
  }

  return data;
}

/**
 * Send a standard text reply (inside 24h customer service window).
 */
export async function sendTextMessage({ to, text }) {
  const accessToken = process.env.ACCESS_TOKEN;
  const phoneNumberId = process.env.PHONE_NUMBER_ID;

  if (!accessToken || !phoneNumberId) {
    throw new Error('ACCESS_TOKEN and PHONE_NUMBER_ID must be set in environment variables');
  }

  const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: {
      preview_url: false,
      body: text
    }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorDetails = data?.error?.message || `HTTP ${response.status} ${response.statusText}`;
    throw new Error(errorDetails);
  }

  return data;
}

