const GRAPH_API_VERSION = 'v23.0';
const templateMediaIds = new Map();

async function uploadTemplateMedia(filePath, templateName, format, preferredMime = '') {
  const fileInfo = await (await import('node:fs/promises')).stat(filePath);
  const signature = `${filePath}:${fileInfo.size}:${fileInfo.mtimeMs}`;
  if (templateMediaIds.get(templateName)?.signature === signature) return templateMediaIds.get(templateName).id;
  const accessToken = process.env.ACCESS_TOKEN;
  const phoneNumberId = process.env.PHONE_NUMBER_ID;
  if (!accessToken || !phoneNumberId) throw new Error('ACCESS_TOKEN and PHONE_NUMBER_ID must be set in environment variables');
  const mime = preferredMime || (format === 'IMAGE' ? 'image/jpeg' : format === 'VIDEO' ? 'video/mp4' : 'application/pdf');
  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('type', mime);
  form.append('file', new Blob([await (await import('node:fs/promises')).readFile(filePath)], { type: mime }), `${templateName}${format === 'IMAGE' ? '.jpg' : format === 'VIDEO' ? '.mp4' : '.pdf'}`);
  const response = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/media`, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` }, body: form });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw metaError(data, response);
  templateMediaIds.set(templateName, { signature, id: data.id });
  return data.id;
}

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

export async function getAllMessageTemplates() {
  const accessToken = String(process.env.ACCESS_TOKEN || '').trim();
  const wabaId = String(process.env.WABA_ID || '').trim();
  if (!accessToken || !wabaId) throw new Error('ACCESS_TOKEN / PHONE_NUMBER_ID not set');
  const url = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/${encodeURIComponent(wabaId)}/message_templates`);
  url.searchParams.set('fields', 'id,name,status,category,language,components,rejected_reason');
  url.searchParams.set('limit', '100');
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(15000) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw metaError(data, response);
  return data.data || [];
}

export async function createMessageTemplate({ template, imagePath, imageMime }) {
  const accessToken = String(process.env.ACCESS_TOKEN || '').trim();
  const wabaId = String(process.env.WABA_ID || '').trim();
  if (!accessToken || !wabaId) throw new Error('ACCESS_TOKEN / PHONE_NUMBER_ID not set');
  if (imagePath) {
    const appId = String(process.env.APP_ID || '').trim();
    if (!appId) throw new Error('APP_ID not set for resumable image upload');
    const file = await (await import('node:fs/promises')).readFile(imagePath);
    const mime = imageMime || 'image/jpeg';
    const fileName = imagePath.split(/[\\/]/).pop();
    const init = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${encodeURIComponent(appId)}/uploads?file_length=${file.length}&file_type=${encodeURIComponent(mime)}&file_name=${encodeURIComponent(fileName)}`, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(15000) });
    const initData = await init.json().catch(() => ({}));
    if (!init.ok || !initData.id) throw metaError(initData, init);
    const upload = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${initData.id}`, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, file_offset: '0', 'Content-Type': 'application/octet-stream' }, body: file, signal: AbortSignal.timeout(15000) });
    const uploadData = await upload.json().catch(() => ({}));
    if (!upload.ok || !uploadData.h) throw metaError(uploadData, upload);
    template.components.find(component => component.type === 'HEADER').example = { header_handle: [uploadData.h] };
  }
  const response = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${encodeURIComponent(wabaId)}/message_templates`, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(template), signal: AbortSignal.timeout(15000) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) { const err = metaError(data, response); err.payload = template; throw err; }
  return data;
}

export async function getMessageTemplateDefinition(name, language) {
  const accessToken = process.env.ACCESS_TOKEN;
  const wabaId = process.env.WABA_ID;
  if (!accessToken || !wabaId) throw new Error('ACCESS_TOKEN and WABA_ID must be set in environment variables');
  const url = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/${encodeURIComponent(wabaId)}/message_templates`);
  url.searchParams.set('name', name);
  url.searchParams.set('fields', 'name,language,status,components');
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw metaError(data, response);
  const definition = (data.data || []).find(t => t.name === name && (!language || t.language === language));
  if (!definition) throw new Error(`Meta template definition not found: ${name}${language ? ` (${language})` : ''}`);
  return definition;
}

function metaError(data, response) {
  const error = new Error(data?.error?.message || `HTTP ${response.status} ${response.statusText}`);
  error.metaCode = data?.error?.code;
  error.errorDataDetails = data?.error?.error_data?.details;
  return error;
}

/**
 * Base Meta Graph API request dispatcher.
 */
async function callMetaGraphApi(payload) {
  const accessToken = String(process.env.ACCESS_TOKEN || '').trim();
  const phoneNumberId = String(process.env.PHONE_NUMBER_ID || '').trim();

  const isPlaceholder = value => !value || /^(your[_ -]?.*|<.*>|\{.*\}|replace[_ -]?.*)$/i.test(value);
  if (isPlaceholder(accessToken) || isPlaceholder(phoneNumberId)) {
    throw new Error('ACCESS_TOKEN / PHONE_NUMBER_ID not set');
  }

  payload = { ...payload, messaging_product: 'whatsapp', recipient_type: 'individual', to: String(payload.to || '').replace(/\D/g, '') };
  if (payload.to.length < 10 || payload.to.length > 15) throw new Error('Phone number must contain 10 to 15 digits, including country code.');

  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`;
  const payloadJson = JSON.stringify(payload);
  let response;
  try {
    response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: payloadJson,
    signal: AbortSignal.timeout(15000)
    });
  } catch (cause) {
    const error = new Error(cause?.name === 'TimeoutError' || cause?.name === 'AbortError' ? 'Meta request timed out after 15 seconds.' : `Network error while contacting Meta: ${cause?.message || 'connection failed'}`);
    error.payload = payload;
    error.errorDataDetails = `JSON payload sent: ${payloadJson}`;
    throw error;
  }

  const data = await response.json().catch(() => ({}));

  if (response.status !== 200 || !data?.messages?.[0]?.id) {
    const errorDetails = data?.error?.message || `HTTP ${response.status} ${response.statusText}`;
    const error = metaError(data, response);
    error.message = errorDetails;
    error.payload = payload;
    error.responseStatus = response.status;
    if (response.status !== 200 && !error.errorDataDetails) error.errorDataDetails = `JSON payload sent: ${payloadJson}`;
    if (response.status === 200) error.message = `Meta returned HTTP 200 without messages[0].id`;
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
  headerText = '',
  bodyVariables = [],
  urlButtonValue = '',
  urlButtonValues = {},
  quickReplyPayloads = [],
  templateDefinition
  ,headerChoice = null
}) {
  if (typeof templateName !== 'string' || !templateName || typeof languageCode !== 'string' || !languageCode) {
    throw new Error('An exact Meta template name and language code are required.');
  }
  if (!templateDefinition) templateDefinition = await getMessageTemplateDefinition(templateName, languageCode);
  const definitions = templateDefinition.components || [];
  const clean = value => String(value ?? '').trim().replace(/[\r\n\t]+/g, ' ').replace(/ {4,}/g, ' ');
  const components = [];
  const header = definitions.find(c => c.type === 'HEADER');
  const headerFormat = header?.format;
  const headerVars = (header?.text || '').match(/\{\{[^}]+\}\}/g) || [];
  if (header && (headerFormat !== 'TEXT' || headerVars.length)) {
    if (headerFormat === 'TEXT') components.push({ type: 'header', parameters: [{ type: 'text', text: clean(headerText) }] });
    else {
      const mediaUrl = clean(headerChoice?.url || headerImageUrl);
      const filePath = headerChoice?.fileName ? headerChoice.filePath : '';
      if (filePath) {
        try {
          const mediaId = await uploadTemplateMedia(filePath, templateName, headerFormat, headerChoice.mimeType);
          components.push({ type: 'header', parameters: [{ type: headerFormat.toLowerCase(), [headerFormat.toLowerCase()]: { id: mediaId } }] });
        } catch (uploadError) {
          if (!/^https:\/\//i.test(mediaUrl)) throw uploadError;
          components.push({ type: 'header', parameters: [{ type: headerFormat.toLowerCase(), [headerFormat.toLowerCase()]: { link: mediaUrl } }] });
        }
      } else {
        if (!/^https:\/\//i.test(mediaUrl)) throw new Error('Choose a template sample, upload a file, or enter a public HTTPS media URL.');
        components.push({ type: 'header', parameters: [{ type: headerFormat.toLowerCase(), [headerFormat.toLowerCase()]: { link: mediaUrl } }] });
      }
    }
  }
  const body = definitions.find(c => c.type === 'BODY');
  const bodyMatches = (body?.text || '').match(/\{\{[^}]+\}\}/g) || [];
  if (bodyMatches.length) {
    if (bodyMatches.some((_, i) => !clean(bodyVariables[i]))) throw new Error('Every body template variable is required.');
    const params = bodyMatches.map((token, i) => ({ type: 'text', text: clean(bodyVariables[i]), ...(bodyMatches.some(v => !/^\{\{\d+\}\}$/.test(v)) ? { parameter_name: token.slice(2, -2) } : {}) }));
    components.push({ type: 'body', parameters: params });
  }
  (definitions.find(c => c.type === 'BUTTONS')?.buttons || []).forEach(button => {
    const value = button.type === 'URL' && /\{\{1\}\}/.test(button.url || '') ? (urlButtonValues?.[String(button.index)] ?? urlButtonValue) : button.type === 'QUICK_REPLY' ? quickReplyPayloads?.[String(button.index)] : null;
    if (value !== undefined && value !== null) {
      if (!clean(value)) throw new Error(`Template button ${button.index} value is required.`);
      components.push({ type: 'button', sub_type: button.type === 'URL' ? 'url' : 'quick_reply', index: String(button.index), parameters: [button.type === 'URL' ? { type: 'text', text: clean(value) } : { type: 'payload', payload: clean(value) }] });
    }
  });

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

  try { return await callMetaGraphApi(payload); }
  catch (err) {
    if (header && headerFormat !== 'TEXT' && headerChoice?.fileName && isMediaSendError(err)) {
      templateMediaIds.delete(templateName);
      const refreshedId = await uploadTemplateMedia(headerChoice.filePath, templateName, headerFormat, headerChoice.mimeType);
      payload.template.components.find(component => component.type === 'header').parameters[0][headerFormat.toLowerCase()] = { id: refreshedId };
      return callMetaGraphApi(payload);
    }
    throw err;
  }
}

function isMediaSendError(err) {
  return [131051, 131052, 131053, 131054, 131055, 131056, 131057].includes(Number(err.metaCode)) || /media/i.test(`${err.message} ${err.errorDataDetails || ''}`);
}

/**
 * Send auto-reply message based on configured type (text, image, buttons, link).
 * Default simplified format is interactive CTA Link Button.
 */
export async function sendConfiguredAutoReply({ to, autoReplyConfig }) {
  const config = autoReplyConfig || {};
  const type = config.type || 'link';

  // 1. CTA Link Button (Primary)
  if (type === 'link' || (!type && config.link?.url)) {
    const linkUrl = config.link?.url || 'https://discord.gg/zMVN8ZmqTP';
    const linkTitle = config.link?.title || 'Discord';
    const messageText = config.text || "BGMI TOURNAMENT\n🏆 PRIZE POOL – ₹10,000\n🔥 REGISTRATION LIVE!\nSecure your spot now. Join ASAP and compete for the prize!\n\nRegister Now | Match District";

    return callMetaGraphApi({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'interactive',
      interactive: {
        type: 'cta_url',
        body: {
          text: messageText
        },
        action: {
          name: 'cta_url',
          parameters: {
            display_text: linkTitle.slice(0, 20),
            url: linkUrl
          }
        }
      }
    });
  }

  // 2. Image with Caption (Legacy fallback)
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

  // 3. Interactive Reply Buttons (Legacy fallback)
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

  // 4. Default: Standard text reply
  return callMetaGraphApi({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: {
      preview_url: false,
      body: config.text || "BGMI TOURNAMENT\n🏆 PRIZE POOL – ₹10,000\n🔥 REGISTRATION LIVE!\nSecure your spot now. Join ASAP and compete for the prize!\n\nRegister Now | Match District"
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
