const GRAPH_API_VERSION = 'v21.0';

export async function getApprovedMessageTemplates() {
  const accessToken = process.env.ACCESS_TOKEN;
  const wabaId = process.env.WABA_ID;
  if (!accessToken || !wabaId) {
    throw new Error('ACCESS_TOKEN and WABA_ID must be set in environment variables');
  }

  const templates = [];
  let after;
  do {
    const url = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/${encodeURIComponent(wabaId)}/message_templates`);
    url.searchParams.set('fields', 'name,status,language');
    url.searchParams.set('limit', '100');
    if (after) url.searchParams.set('after', after);

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data?.error?.message || `HTTP ${response.status} ${response.statusText}`);
      error.metaCode = data?.error?.code;
      throw error;
    }

    for (const template of data.data || []) {
      if (template.status === 'APPROVED' && template.name && template.language) {
        templates.push({ name: template.name, language: template.language });
      }
    }
    after = data.paging?.cursors?.after;
  } while (after);

  return templates;
}

/**
 * Base Meta Graph API request dispatcher.
 */
async function callMetaGraphApi(payload) {
  const accessToken = process.env.ACCESS_TOKEN;
  const phoneNumberId = process.env.PHONE_NUMBER_ID;

  if (!accessToken || !phoneNumberId) {
    throw new Error('ACCESS_TOKEN and PHONE_NUMBER_ID must be set in environment variables');
  }

  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`;

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
    const error = new Error(errorDetails);
    error.metaCode = data?.error?.code;
    throw error;
  }

  return data;
}

/**
 * Send an approved WhatsApp template message with image header, body variables, and button parameters.
 */
export async function sendTemplateMessage({
  to,
  templateName,
  languageCode,
  headerImageUrl = '',
  bodyVariables = [],
  urlButtonValue = '',
  quickReplyPayloads = []
}) {
  if (typeof templateName !== 'string' || !templateName || typeof languageCode !== 'string' || !languageCode) {
    throw new Error('An exact Meta template name and language code are required.');
  }
  const components = [];

  // 1. Header image
  if (headerImageUrl && headerImageUrl.trim().startsWith('http')) {
    components.push({
      type: 'header',
      parameters: [
        {
          type: 'image',
          image: { link: headerImageUrl.trim() }
        }
      ]
    });
  }

  // 2. Body variables {{1}}, {{2}}...
  if (Array.isArray(bodyVariables) && bodyVariables.length > 0) {
    const params = bodyVariables
      .filter(v => v !== undefined && v !== null && String(v).trim() !== '')
      .map(v => ({
        type: 'text',
        text: String(v).trim()
      }));

    if (params.length > 0) {
      components.push({
        type: 'body',
        parameters: params
      });
    }
  }

  // 3. Dynamic URL button
  if (urlButtonValue && String(urlButtonValue).trim() !== '') {
    components.push({
      type: 'button',
      sub_type: 'url',
      index: '0',
      parameters: [
        {
          type: 'text',
          text: String(urlButtonValue).trim()
        }
      ]
    });
  }

  // 4. Quick reply button payloads
  if (Array.isArray(quickReplyPayloads) && quickReplyPayloads.length > 0) {
    quickReplyPayloads.forEach((payload, index) => {
      if (payload && String(payload).trim() !== '') {
        components.push({
          type: 'button',
          sub_type: 'quick_reply',
          index: String(index),
          parameters: [
            {
              type: 'payload',
              payload: String(payload).trim()
            }
          ]
        });
      }
    });
  }

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: languageCode },
      ...(components.length > 0 && { components })
    }
  };

  return callMetaGraphApi(payload);
}

/**
 * Send auto-reply message based on configured type (text, image, buttons, link).
 */
export async function sendConfiguredAutoReply({ to, autoReplyConfig }) {
  const config = autoReplyConfig || {};
  const type = config.type || 'text';

  // 1. Image with Caption
  if (type === 'image' && config.imageUrl) {
    return callMetaGraphApi({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'image',
      image: {
        link: config.imageUrl,
        caption: config.caption || config.text || ''
      }
    });
  }

  // 2. Interactive Reply Buttons (up to 3)
  if (type === 'buttons' && Array.isArray(config.buttons) && config.buttons.length > 0) {
    const validButtons = config.buttons.slice(0, 3).map((btn, i) => ({
      type: 'reply',
      reply: {
        id: btn.id || `btn_${i + 1}`,
        title: (btn.title || `Option ${i + 1}`).slice(0, 20) // WhatsApp limit: 20 chars
      }
    }));

    return callMetaGraphApi({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: {
          text: config.text || 'Please select an option:'
        },
        action: {
          buttons: validButtons
        }
      }
    });
  }

  // 3. CTA Link Button
  if (type === 'link' && config.link?.url) {
    return callMetaGraphApi({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      interactive: {
        type: 'cta_url',
        body: {
          text: config.text || 'Check out our link below:'
        },
        action: {
          name: 'cta_url',
          parameters: {
            display_text: (config.link.title || 'Open Link').slice(0, 20),
            url: config.link.url
          }
        }
      }
    });
  }

  // 4. Default: Standard text reply
  return callMetaGraphApi({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: {
      preview_url: false,
      body: config.text || 'Hello! Thank you for reaching out.'
    }
  });
}

/**
 * Send a simple plain text message (used for button follow-up replies).
 */
export async function sendTextMessage({ to, text }) {
  return callMetaGraphApi({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: {
      preview_url: false,
      body: text
    }
  });
}
