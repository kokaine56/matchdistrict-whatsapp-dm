// Template Body presets for live preview simulation
const TEMPLATE_PREVIEWS = {
  'hello': 'Hello {{1}}! Welcome to {{2}}. We are thrilled to connect with you.',
  'hi': 'Hi {{1}}! Quick check-in from {{2}}. How can we help you today?',
  'ek_kam_hai': 'Ek kaam hai aapse regarding {{1}}. Please reply whenever you are free!'
};

let currentConfig = null;
let currentStats = null;
let currentRecipients = null;
let availableTemplates = [];

// DOM Elements
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');
const globalAlert = document.getElementById('globalAlert');
const autoReplyToggle = document.getElementById('autoReplyToggle');

// Usage Counters
const sentCountDisplay = document.getElementById('sentCountDisplay');
const limitDisplay = document.getElementById('limitDisplay');

// Campaign Elements
const templateSelect = document.getElementById('templateSelect');
const languageCodeInput = document.getElementById('languageCode');
const headerImageUrlInput = document.getElementById('headerImageUrl');
const headerImageFileInput = document.getElementById('headerImageFile');
const btnUploadHeaderImg = document.getElementById('btnUploadHeaderImg');
const variablesContainer = document.getElementById('variablesContainer');
const btnAddVariable = document.getElementById('btnAddVariable');
const urlButtonValueInput = document.getElementById('urlButtonValue');
const qrPayload0Input = document.getElementById('qrPayload0');
const qrPayload1Input = document.getElementById('qrPayload1');
const campaignForm = document.getElementById('campaignForm');

// Preview Elements
const previewImg = document.getElementById('previewImg');
const previewText = document.getElementById('previewText');
const previewActions = document.getElementById('previewActions');

// Auto-Reply Elements
const autoReplyForm = document.getElementById('autoReplyForm');
const radioCards = document.querySelectorAll('.radio-card');
const autoReplyText = document.getElementById('autoReplyText');
const imageReplyFields = document.getElementById('imageReplyFields');
const autoReplyImageUrl = document.getElementById('autoReplyImageUrl');
const autoReplyImageFile = document.getElementById('autoReplyImageFile');
const btnUploadReplyImg = document.getElementById('btnUploadReplyImg');
const autoReplyCaption = document.getElementById('autoReplyCaption');
const buttonReplyFields = document.getElementById('buttonReplyFields');
const linkReplyFields = document.getElementById('linkReplyFields');
const linkTitleInput = document.getElementById('linkTitle');
const linkUrlInput = document.getElementById('linkUrl');

// Recipients Elements
const recipientsCsvFile = document.getElementById('recipientsCsvFile');
const btnUploadCsv = document.getElementById('btnUploadCsv');
const manualRecipientNumbers = document.getElementById('manualRecipientNumbers');
const manualRecipientsOptedIn = document.getElementById('manualRecipientsOptedIn');
const btnAddRecipients = document.getElementById('btnAddRecipients');
const totalRecipientsCount = document.getElementById('totalRecipientsCount');
const optedInCount = document.getElementById('optedInCount');
const optedOutCount = document.getElementById('optedOutCount');
const recipientsTableBody = document.getElementById('recipientsTableBody');

// Send & Results Elements
const btnSendCampaign = document.getElementById('btnSendCampaign');
const confirmModal = document.getElementById('confirmModal');
const modalPromptText = document.getElementById('modalPromptText');
const btnModalCancel = document.getElementById('btnModalCancel');
const btnModalConfirm = document.getElementById('btnModalConfirm');
const resultsCard = document.getElementById('resultsCard');
const resultsAlert = document.getElementById('resultsAlert');
const failedSection = document.getElementById('failedSection');
const failedTableBody = document.getElementById('failedTableBody');

// --- TABS SWITCHING ---
tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    tabBtns.forEach(b => b.classList.remove('active'));
    tabContents.forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    const target = document.getElementById(btn.dataset.tab);
    if (target) target.classList.add('active');
    if (target?.id === 'campaign-tab' && window.matchMedia('(max-width: 700px)').matches) {
      document.querySelector('.preview-panel')?.removeAttribute('open');
    }
  });
});

function showAlert(message, type = 'success') {
  globalAlert.className = `alert alert-${type}`;
  globalAlert.textContent = message;
  globalAlert.style.display = 'block';
  setTimeout(() => {
    globalAlert.style.display = 'none';
  }, 5000);
}

// --- FETCH INITIAL DATA ---
async function initialize() {
  try {
    await Promise.all([loadStats(), loadRecipients(), loadWebhookSetup(), loadMessageTemplates()]);
    await loadConfig();
    updateLivePreview();
  } catch (err) {
    showAlert('Error loading dashboard data: ' + err.message, 'danger');
  }
}

async function loadMessageTemplates() {
  try {
    const response = await fetch('/api/message-templates');
    if (response.status === 401) return (window.location.href = '/login');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not load templates from Meta');
    availableTemplates = Array.isArray(data.templates) ? data.templates : [];
    templateSelect.replaceChildren();

    const prompt = document.createElement('option');
    prompt.value = '';
    prompt.textContent = availableTemplates.length ? 'Select an approved template' : 'No approved templates found';
    templateSelect.append(prompt);

    availableTemplates.forEach((template, index) => {
      const option = document.createElement('option');
      option.value = String(index);
      option.textContent = `${template.name} — ${template.language}`;
      templateSelect.append(option);
    });
  } catch (err) {
    templateSelect.replaceChildren(new Option('Could not load templates from Meta', ''));
    showAlert('Template list could not be loaded: ' + err.message, 'danger');
  }
}

function selectedTemplate() {
  const index = Number(templateSelect.value);
  return templateSelect.value !== '' && Number.isInteger(index) ? availableTemplates[index] : null;
}

function selectTemplate(name, language) {
  const index = availableTemplates.findIndex(template => template.name === name && template.language === language);
  templateSelect.value = index < 0 ? '' : String(index);
  languageCodeInput.value = index < 0 ? '' : availableTemplates[index].language;
}

async function loadWebhookSetup() {
  const error = document.getElementById('webhookSetupError');
  try {
    const response = await fetch('/api/webhook-setup');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not load webhook setup');
    document.getElementById('webhookCallbackUrl').value = data.callbackUrl;
    document.getElementById('webhookVerifyToken').value = data.verifyToken;
    document.getElementById('webhookLocalWarning').style.display = data.isLocalhost ? 'block' : 'none';
    if (!data.verifyToken) throw new Error('Set WEBHOOK_VERIFY_TOKEN in the server environment.');
  } catch (err) {
    error.textContent = err.message;
    error.style.display = 'block';
  }
}

document.querySelectorAll('.webhook-copy').forEach(button => {
  button.addEventListener('click', async () => {
    const input = document.getElementById(button.dataset.copyTarget);
    if (!input?.value) return;
    try {
      await navigator.clipboard.writeText(input.value);
      button.textContent = 'Copied';
      setTimeout(() => { button.textContent = 'Copy'; }, 1500);
    } catch {
      input.select();
      document.execCommand('copy');
      button.textContent = 'Copied';
      setTimeout(() => { button.textContent = 'Copy'; }, 1500);
    }
  });
});

async function loadStats() {
  const res = await fetch('/api/stats');
  if (res.status === 401) return (window.location.href = '/login');
  currentStats = await res.json();
  sentCountDisplay.textContent = currentStats.monthSentCount;
  limitDisplay.textContent = currentStats.monthlyLimit;
  const percent = currentStats.monthlyLimit ? Math.min(100, currentStats.monthSentCount / currentStats.monthlyLimit * 100) : 0;
  document.getElementById('usageProgressFill').style.width = `${percent}%`;
  document.querySelector('.usage-progress').setAttribute('aria-valuemax', currentStats.monthlyLimit);
  document.querySelector('.usage-progress').setAttribute('aria-valuenow', currentStats.monthSentCount);
}

async function loadConfig() {
  const res = await fetch('/api/config');
  if (res.status === 401) return (window.location.href = '/login');
  currentConfig = await res.json();
  renderAutoReplyState(currentConfig.autoReplyEnabled !== false);

  // Populate Campaign
  const c = currentConfig.campaign || {};
  selectTemplate(c.template, c.languageCode);
  headerImageUrlInput.value = c.headerImageUrl || '';
  urlButtonValueInput.value = c.urlButtonValue || '';
  if (c.quickReplyPayloads?.[0]) qrPayload0Input.value = c.quickReplyPayloads[0];
  if (c.quickReplyPayloads?.[1]) qrPayload1Input.value = c.quickReplyPayloads[1];

  // Populate Variables
  variablesContainer.innerHTML = '';
  const vars = Array.isArray(c.bodyVariables) && c.bodyVariables.length > 0 ? c.bodyVariables : [''];
  vars.forEach(v => addVariableRow(v));

  // Populate Auto-Reply
  const ar = currentConfig.autoReply || {};
  setReplyType(ar.type || 'text');
  autoReplyText.value = ar.text || '';
  autoReplyImageUrl.value = ar.imageUrl || '';
  autoReplyCaption.value = ar.caption || '';

  if (ar.buttons?.[0]) {
    document.getElementById('btn1_id').value = ar.buttons[0].id || 'btn_1';
    document.getElementById('btn1_title').value = ar.buttons[0].title || '';
    document.getElementById('btn1_reply').value = ar.buttons[0].reply || '';
  }
  if (ar.buttons?.[1]) {
    document.getElementById('btn2_id').value = ar.buttons[1].id || 'btn_2';
    document.getElementById('btn2_title').value = ar.buttons[1].title || '';
    document.getElementById('btn2_reply').value = ar.buttons[1].reply || '';
  }
  if (ar.buttons?.[2]) {
    document.getElementById('btn3_id').value = ar.buttons[2].id || 'btn_3';
    document.getElementById('btn3_title').value = ar.buttons[2].title || '';
    document.getElementById('btn3_reply').value = ar.buttons[2].reply || '';
  }

  if (ar.link) {
    linkTitleInput.value = ar.link.title || '';
    linkUrlInput.value = ar.link.url || '';
  }
}

function renderAutoReplyState(enabled) {
  const state = Boolean(enabled);
  autoReplyToggle.setAttribute('aria-checked', String(state));
  autoReplyToggle.setAttribute('aria-label', `Auto-reply: ${state ? 'ON' : 'OFF'}`);
  autoReplyToggle.classList.toggle('is-on', state);
  document.getElementById('autoReplyToggleLabel').textContent = state ? 'ON' : 'OFF';
  const badge = document.getElementById('autoReplyStatus');
  badge.textContent = `Auto-reply: ${state ? 'ON' : 'OFF'}`;
  badge.classList.toggle('is-off', !state);
}

autoReplyToggle.addEventListener('click', async () => {
  const nextState = autoReplyToggle.getAttribute('aria-checked') !== 'true';
  autoReplyToggle.disabled = true;
  try {
    const response = await fetch('/api/config', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ autoReplyEnabled: nextState })
    });
    const data = await response.json();
    if (response.status === 401) return (window.location.href = '/login');
    if (!response.ok) throw new Error(data.error || 'Could not update auto-reply state');
    currentConfig = data.config;
    renderAutoReplyState(nextState);
    showAlert(`Auto-reply is now ${nextState ? 'ON' : 'OFF'}.`);
  } catch (err) {
    showAlert('Could not update auto-reply: ' + err.message, 'danger');
  } finally {
    autoReplyToggle.disabled = false;
  }
});

async function loadRecipients() {
  const res = await fetch('/api/recipients');
  if (res.status === 401) return (window.location.href = '/login');
  currentRecipients = await res.json();

  totalRecipientsCount.textContent = currentRecipients.total;
  optedInCount.textContent = currentRecipients.optedIn;
  optedOutCount.textContent = currentRecipients.optedOut;

  recipientsTableBody.innerHTML = '';
  if (!currentRecipients.preview || currentRecipients.preview.length === 0) {
    recipientsTableBody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted);">No recipients found in recipients.csv</td></tr>';
    return;
  }

  currentRecipients.preview.forEach((r, idx) => {
    const tr = document.createElement('tr');
    const numberCell = document.createElement('td');
    const number = document.createElement('strong');
    number.textContent = r.phone;
    numberCell.append(number);

    const statusCell = document.createElement('td');
    const status = document.createElement('span');
    status.className = `badge-tag ${r.optedIn ? 'badge-success' : 'badge-danger'}`;
    status.textContent = r.optedIn ? 'Opted In ✓' : 'Opted Out ✗';
    statusCell.append(status);

    const toggleCell = document.createElement('td');
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = `recipient-toggle${r.optedIn ? ' is-on' : ''}`;
    toggle.setAttribute('role', 'switch');
    toggle.setAttribute('aria-checked', String(Boolean(r.optedIn)));
    toggle.setAttribute('aria-label', `Switch ${r.phone} ${r.optedIn ? 'off' : 'on'}`);
    toggle.addEventListener('click', () => setRecipientOptIn(r.phone, !r.optedIn, toggle));
    toggleCell.append(toggle);

    const indexCell = document.createElement('td');
    indexCell.textContent = String(idx + 1);
    indexCell.dataset.label = '#';
    numberCell.dataset.label = 'Phone Number';
    statusCell.dataset.label = 'Status';
    toggleCell.dataset.label = 'Opted in';
    tr.append(indexCell, numberCell, statusCell, toggleCell);
    recipientsTableBody.appendChild(tr);
  });
}

async function setRecipientOptIn(phone, optedIn, toggle) {
  toggle.disabled = true;
  try {
    const response = await fetch('/api/recipients/opt-in', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, optedIn })
    });
    const data = await response.json();
    if (response.status === 401) return (window.location.href = '/login');
    if (!response.ok) throw new Error(data.error || 'Could not update recipient status');
    await loadRecipients();
    showAlert(`Recipient marked ${optedIn ? 'Opted In' : 'Opted Out'}.`);
  } catch (err) {
    showAlert('Could not update recipient: ' + err.message, 'danger');
    toggle.disabled = false;
  }
}

// --- DYNAMIC VARIABLES LOGIC ---
function addVariableRow(val = '') {
  const index = variablesContainer.children.length + 1;
  const row = document.createElement('div');
  row.className = 'var-row';
  row.innerHTML = `
    <span class="var-tag">{{${index}}}</span>
    <input type="text" class="var-input" placeholder="Variable {{${index}}} value" value="${val}">
    <button type="button" class="btn btn-secondary btn-sm btn-remove-var">✕</button>
  `;
  row.querySelector('.var-input').addEventListener('input', updateLivePreview);
  row.querySelector('.btn-remove-var').addEventListener('click', () => {
    row.remove();
    reindexVariables();
    updateLivePreview();
  });
  variablesContainer.appendChild(row);
  updateLivePreview();
}

function reindexVariables() {
  Array.from(variablesContainer.children).forEach((row, i) => {
    row.querySelector('.var-tag').textContent = `{{${i + 1}}}`;
    row.querySelector('.var-input').placeholder = `Variable {{${i + 1}}} value`;
  });
}

btnAddVariable.addEventListener('click', () => addVariableRow());

// --- LIVE PREVIEW ---
function updateLivePreview() {
  const selectedTpl = selectedTemplate();
  let rawBody = TEMPLATE_PREVIEWS[selectedTpl?.name] || 'Hello! Thank you for contacting us.';

  // Substitute variables
  const varInputs = Array.from(variablesContainer.querySelectorAll('.var-input'));
  varInputs.forEach((inp, i) => {
    const val = inp.value.trim() || `[Variable {{${i + 1}}}]`;
    rawBody = rawBody.replace(new RegExp(`\\{\\{${i + 1}\\}\\}`, 'g'), val);
  });

  previewText.textContent = rawBody;

  // Header Image
  const imgUrl = headerImageUrlInput.value.trim();
  if (imgUrl) {
    previewImg.src = imgUrl;
    previewImg.style.display = 'block';
  } else {
    previewImg.style.display = 'none';
  }

  // Action Buttons
  previewActions.innerHTML = '';
  const urlVal = urlButtonValueInput.value.trim();
  if (urlVal) {
    const btn = document.createElement('div');
    btn.className = 'preview-btn';
    btn.innerHTML = `🔗 Open Link (${urlVal})`;
    previewActions.appendChild(btn);
  }

  const qr0 = qrPayload0Input.value.trim();
  const qr1 = qrPayload1Input.value.trim();
  if (qr0) {
    const btn = document.createElement('div');
    btn.className = 'preview-btn';
    btn.innerHTML = `↩ ${qr0}`;
    previewActions.appendChild(btn);
  }
  if (qr1) {
    const btn = document.createElement('div');
    btn.className = 'preview-btn';
    btn.innerHTML = `↩ ${qr1}`;
    previewActions.appendChild(btn);
  }
}

templateSelect.addEventListener('change', () => {
  const template = selectedTemplate();
  languageCodeInput.value = template?.language || '';
  updateLivePreview();
});
headerImageUrlInput.addEventListener('input', updateLivePreview);
urlButtonValueInput.addEventListener('input', updateLivePreview);
qrPayload0Input.addEventListener('input', updateLivePreview);
qrPayload1Input.addEventListener('input', updateLivePreview);

// --- FILE UPLOADS ---
btnUploadHeaderImg.addEventListener('click', () => headerImageFileInput.click());
headerImageFileInput.addEventListener('change', async () => {
  const file = headerImageFileInput.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append('image', file);

  btnUploadHeaderImg.textContent = 'Uploading...';
  try {
    const res = await fetch('/api/upload-image', { method: 'POST', body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload failed');
    headerImageUrlInput.value = data.url;
    updateLivePreview();
    showAlert('Header image uploaded successfully!');
  } catch (err) {
    showAlert('Image upload failed: ' + err.message, 'danger');
  } finally {
    btnUploadHeaderImg.textContent = 'Upload';
  }
});

btnUploadReplyImg.addEventListener('click', () => autoReplyImageFile.click());
autoReplyImageFile.addEventListener('change', async () => {
  const file = autoReplyImageFile.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append('image', file);

  btnUploadReplyImg.textContent = 'Uploading...';
  try {
    const res = await fetch('/api/upload-image', { method: 'POST', body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload failed');
    autoReplyImageUrl.value = data.url;
    showAlert('Reply image uploaded successfully!');
  } catch (err) {
    showAlert('Image upload failed: ' + err.message, 'danger');
  } finally {
    btnUploadReplyImg.textContent = 'Upload';
  }
});

btnUploadCsv.addEventListener('click', () => recipientsCsvFile.click());
recipientsCsvFile.addEventListener('change', async () => {
  const file = recipientsCsvFile.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append('file', file);

  btnUploadCsv.textContent = 'Uploading...';
  try {
    const res = await fetch('/api/upload-recipients', { method: 'POST', body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'CSV upload failed');
    showAlert('Recipients CSV uploaded successfully!');
    await loadRecipients();
  } catch (err) {
    showAlert('CSV upload failed: ' + err.message, 'danger');
  } finally {
    btnUploadCsv.textContent = 'Upload & Replace CSV';
    recipientsCsvFile.value = '';
  }
});

btnAddRecipients.addEventListener('click', async () => {
  const numbers = manualRecipientNumbers.value.trim();
  if (!numbers) {
    showAlert('Enter at least one phone number.', 'danger');
    return;
  }

  const feedback = document.getElementById('recipientInputFeedback');
  feedback.replaceChildren();
  feedback.style.display = 'none';
  btnAddRecipients.disabled = true;
  btnAddRecipients.textContent = 'Adding...';
  try {
    const res = await fetch('/api/recipients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ numbers, optedIn: manualRecipientsOptedIn.checked })
    });
    const data = await res.json();
    if (res.status === 401) return (window.location.href = '/login');
    if (!res.ok) throw new Error(data.error || 'Could not add recipients');
    if (data.invalid?.length) {
      feedback.style.display = 'block';
      const heading = document.createElement('strong');
      heading.textContent = 'Rejected numbers';
      const list = document.createElement('ul');
      data.invalid.forEach(item => {
        const row = document.createElement('li');
        row.textContent = `${item.number}: ${item.reason}`;
        list.append(row);
      });
      feedback.append(heading, list);
    }
    if (!data.invalid?.length) manualRecipientNumbers.value = '';
    await loadRecipients();
    showAlert(`Added ${data.added} number(s); skipped ${data.skipped} duplicate(s).${data.invalid?.length ? ` Rejected ${data.invalid.length} invalid number(s); see details below.` : ''}`,
      data.invalid?.length ? 'warning' : 'success');
  } catch (err) {
    showAlert('Could not add numbers: ' + err.message, 'danger');
  } finally {
    btnAddRecipients.disabled = false;
    btnAddRecipients.textContent = 'Add to Recipients List';
  }
});

// --- AUTO-REPLY TYPE SWITCHER ---
function setReplyType(type) {
  radioCards.forEach(card => {
    const isTarget = card.dataset.type === type;
    card.classList.toggle('active', isTarget);
    card.querySelector('input').checked = isTarget;
  });

  imageReplyFields.style.display = type === 'image' ? 'block' : 'none';
  buttonReplyFields.style.display = type === 'buttons' ? 'block' : 'none';
  linkReplyFields.style.display = type === 'link' ? 'block' : 'none';
}

radioCards.forEach(card => {
  card.addEventListener('click', () => {
    setReplyType(card.dataset.type);
  });
});

// --- SAVE CAMPAIGN FORM ---
function getCampaignFormSettings() {
  const template = selectedTemplate();
  if (!template) return null;
  const varInputs = Array.from(variablesContainer.querySelectorAll('.var-input'));
  const bodyVariables = varInputs.map(input => input.value.trim()).filter(Boolean);
  const quickReplyPayloads = [qrPayload0Input.value.trim(), qrPayload1Input.value.trim()].filter(Boolean);
  return {
    template: template.name,
    languageCode: template.language,
    headerImageUrl: headerImageUrlInput.value.trim(),
    bodyVariables,
    urlButtonValue: urlButtonValueInput.value.trim(),
    quickReplyPayloads
  };
}

campaignForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const updatedCampaign = getCampaignFormSettings();
  if (!updatedCampaign) return showAlert('Select an approved Meta template and language first.', 'danger');

  try {
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaign: updatedCampaign })
    });
    if (!res.ok) throw new Error('Failed to save settings');
    showAlert('Campaign template settings saved successfully!');
  } catch (err) {
    showAlert('Save failed: ' + err.message, 'danger');
  }
});

// --- SAVE AUTO-REPLY FORM ---
autoReplyForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const selectedTypeCard = document.querySelector('.radio-card.active');
  const type = selectedTypeCard ? selectedTypeCard.dataset.type : 'text';

  const buttons = [];
  const b1Title = document.getElementById('btn1_title').value.trim();
  if (b1Title) {
    buttons.push({
      id: document.getElementById('btn1_id').value.trim() || 'btn_1',
      title: b1Title,
      reply: document.getElementById('btn1_reply').value.trim()
    });
  }
  const b2Title = document.getElementById('btn2_title').value.trim();
  if (b2Title) {
    buttons.push({
      id: document.getElementById('btn2_id').value.trim() || 'btn_2',
      title: b2Title,
      reply: document.getElementById('btn2_reply').value.trim()
    });
  }
  const b3Title = document.getElementById('btn3_title').value.trim();
  if (b3Title) {
    buttons.push({
      id: document.getElementById('btn3_id').value.trim() || 'btn_3',
      title: b3Title,
      reply: document.getElementById('btn3_reply').value.trim()
    });
  }

  const updatedAutoReply = {
    type,
    text: autoReplyText.value.trim(),
    imageUrl: autoReplyImageUrl.value.trim(),
    caption: autoReplyCaption.value.trim(),
    buttons,
    link: {
      title: linkTitleInput.value.trim(),
      url: linkUrlInput.value.trim()
    }
  };

  try {
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ autoReply: updatedAutoReply })
    });
    if (!res.ok) throw new Error('Failed to save settings');
    showAlert('Auto-reply rules saved successfully!');
  } catch (err) {
    showAlert('Save failed: ' + err.message, 'danger');
  }
});

// --- DISPATCH CAMPAIGN MODAL & EXECUTION ---
btnSendCampaign.addEventListener('click', () => {
  const template = selectedTemplate();
  if (!template) return showAlert('Select an approved Meta template before sending.', 'danger');
  const eligible = currentRecipients?.optedIn || 0;
  const used = currentStats?.monthSentCount || 0;
  const limit = currentStats?.monthlyLimit || 800;
  const remaining = Math.max(0, limit - used);

  modalPromptText.innerHTML = `
    You are about to send <strong>${template.name}</strong> (${template.language}) to <strong>${eligible}</strong> opted-in recipients.<br><br>
    Monthly status: <strong>${used} / ${limit}</strong> used (${remaining} remaining slots).
  `;
  confirmModal.classList.add('active');
});

btnModalCancel.addEventListener('click', () => confirmModal.classList.remove('active'));

btnModalConfirm.addEventListener('click', async () => {
  const campaign = getCampaignFormSettings();
  if (!campaign) return showAlert('Select an approved Meta template and language first.', 'danger');
  confirmModal.classList.remove('active');
  btnSendCampaign.disabled = true;
  btnSendCampaign.textContent = '⏳ Dispatching campaign... please wait';

  try {
    const res = await fetch('/api/send-campaign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaign })
    });

    const data = await res.json();
    btnSendCampaign.disabled = false;
    btnSendCampaign.textContent = '🚀 Send Campaign Now';

    if (!res.ok) throw new Error(data.error || 'Failed to dispatch campaign');

    // Display Summary
    resultsCard.style.display = 'block';
    resultsCard.scrollIntoView({ behavior: 'smooth' });

    const isLimitHit = data.status === 'limit_reached';
    resultsAlert.className = `alert ${isLimitHit ? 'alert-warning' : 'alert-success'}`;
    resultsAlert.innerHTML = `
      <strong>${isLimitHit ? '⚠️ Monthly Limit Reached' : '✓ Campaign Finished'}</strong>: 
      Successfully sent: <strong>${data.sent}</strong> | 
      Already messaged this month: <strong>${data.alreadySentThisMonth}</strong> | 
      Skipped (opted-out): <strong>${data.skippedOptOut}</strong> | 
      Skipped due to 800 cap: <strong>${data.skippedDueToLimit}</strong> | 
      Failed: <strong>${data.failed}</strong>
    `;

    // Render Failed Sends Table if any
    if (Array.isArray(data.failedDetails) && data.failedDetails.length > 0) {
      failedSection.style.display = 'block';
      failedTableBody.innerHTML = '';
      data.failedDetails.forEach(f => {
        const tr = document.createElement('tr');
        const phoneCell = document.createElement('td');
        const phone = document.createElement('strong');
        phone.textContent = f.phone;
        phoneCell.append(phone);
        const errorCell = document.createElement('td');
        errorCell.style.color = '#f87171';
        errorCell.textContent = f.error;
        tr.append(phoneCell, errorCell);
        failedTableBody.appendChild(tr);
      });
    } else {
      failedSection.style.display = 'none';
    }

    // Refresh monthly stats counter
    await loadStats();
    showAlert(isLimitHit ? 'Campaign stopped: Monthly limit reached.' : 'Campaign dispatched successfully!');
  } catch (err) {
    btnSendCampaign.disabled = false;
    btnSendCampaign.textContent = '🚀 Send Campaign Now';
    showAlert('Campaign failed: ' + err.message, 'danger');
  }
});

// Run startup
initialize();

