// ==========================================================================
// MatchDistrict Outreach — Application Logic
// ==========================================================================

let currentConfig = null;
let currentStats = null;
let currentRecipients = null;
let availableTemplates = [];
let selectedDefinition = null;

// Search & Filter States
let recipientFilter = 'all';
let recipientSearchQuery = '';
let logFilter = 'all';
let logSearchQuery = '';
let logSource = null;
let logIds = new Set();
let logEntries = [];
let logViewCleared = false;

// Pending CSV File for Replacement Confirmation
let pendingCsvFile = null;

// ==========================================================================
// DOM Elements
// ==========================================================================

// Global & Toast
const toastContainer = document.getElementById('toastContainer');
const globalAlert = document.getElementById('globalAlert');

// Navigation
const desktopNavItems = document.querySelectorAll('.desktop-nav .nav-item');
const mobileNavItems = document.querySelectorAll('.mobile-bottom-nav .mobile-nav-item');
const viewPanels = document.querySelectorAll('.view-panel');
const subnavPills = document.querySelectorAll('.subnav-pill');

// Settings Modal
const settingsModal = document.getElementById('settingsModal');
const btnOpenSettings = document.getElementById('btnOpenSettings');
const btnCloseSettings = document.getElementById('btnCloseSettings');
const btnDoneSettings = document.getElementById('btnDoneSettings');
const btnToggleTokenVisibility = document.getElementById('btnToggleTokenVisibility');
const webhookVerifyTokenInput = document.getElementById('webhookVerifyToken');
const eyeIcon = document.getElementById('eyeIcon');
const importDbFile = document.getElementById('importDbFile');
const btnImportDb = document.getElementById('btnImportDb');
const dbSyncStatus = document.getElementById('dbSyncStatus');

// Confirmation Modals
const confirmModal = document.getElementById('confirmModal');
const modalPromptText = document.getElementById('modalPromptText');
const btnModalCancel = document.getElementById('btnModalCancel');
const btnModalConfirm = document.getElementById('btnModalConfirm');
const btnModalCloseX = document.getElementById('btnModalCloseX');

const confirmCsvModal = document.getElementById('confirmCsvModal');
const btnCsvModalCancel = document.getElementById('btnCsvModalCancel');
const btnCsvModalConfirm = document.getElementById('btnCsvModalConfirm');
const btnCsvModalCloseX = document.getElementById('btnCsvModalCloseX');

// Header Quota & Auto-Reply Badges
const sentCountDisplay = document.getElementById('sentCountDisplay');
const limitDisplay = document.getElementById('limitDisplay');
const usageProgressFill = document.getElementById('usageProgressFill');
const autoReplyStatus = document.getElementById('autoReplyStatus');

// Dashboard Elements
const dashSentCount = document.getElementById('dashSentCount');
const dashRemainingCount = document.getElementById('dashRemainingCount');
const dashLimitCount = document.getElementById('dashLimitCount');
const dashEligibleCount = document.getElementById('dashEligibleCount');
const dashTotalContactsSub = document.getElementById('dashTotalContactsSub');
const dashAutoReplyBadge = document.getElementById('dashAutoReplyBadge');
const dashTemplateName = document.getElementById('dashTemplateName');
const dashTemplateLang = document.getElementById('dashTemplateLang');
const dashTemplateAudience = document.getElementById('dashTemplateAudience');
const dashTemplateStatus = document.getElementById('dashTemplateStatus');
const dashActivityList = document.getElementById('dashActivityList');

// Quick Action Buttons
const btnQuickRecipients = document.getElementById('btnQuickRecipients');
const btnQuickAutoReply = document.getElementById('btnQuickAutoReply');
const btnQuickSend = document.getElementById('btnQuickSend');
const btnDashEditCampaign = document.getElementById('btnDashEditCampaign');
const btnDashGoSend = document.getElementById('btnDashGoSend');
const btnDashViewAllActivity = document.getElementById('btnDashViewAllActivity');
const btnGoToSendFromCampaign = document.getElementById('btnGoToSendFromCampaign');

// Campaign Elements
const templateSelect = document.getElementById('templateSelect');
const languageCodeInput = document.getElementById('languageCode');
const templateFields = document.getElementById('templateFields');
const campaignForm = document.getElementById('campaignForm');

// WhatsApp Phone Preview Elements
const previewHeader = document.getElementById('previewHeader');
const previewText = document.getElementById('previewText');
const previewFooter = document.getElementById('previewFooter');
const previewActions = document.getElementById('previewActions');

// Auto-Reply Elements
const autoReplyToggle = document.getElementById('autoReplyToggle');
const autoReplyToggleLabel = document.getElementById('autoReplyToggleLabel');
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
const autoReplyPreviewText = document.getElementById('autoReplyPreviewText');
const autoReplyPreviewBtnLabel = document.getElementById('autoReplyPreviewBtnLabel');

// Send Campaign Elements
const sendSummaryTemplate = document.getElementById('sendSummaryTemplate');
const sendSummaryLang = document.getElementById('sendSummaryLang');
const sendSummaryRecipients = document.getElementById('sendSummaryRecipients');
const sendSummaryQuota = document.getElementById('sendSummaryQuota');
const btnSendCampaign = document.getElementById('btnSendCampaign');
const resultsCard = document.getElementById('resultsCard');
const resultsAlert = document.getElementById('resultsAlert');
const failedSection = document.getElementById('failedSection');
const failedTableBody = document.getElementById('failedTableBody');

// Recipients Elements
const totalRecipientsCount = document.getElementById('totalRecipientsCount');
const optedInCount = document.getElementById('optedInCount');
const optedOutCount = document.getElementById('optedOutCount');
const toggleAllRecipients = document.getElementById('toggleAllRecipients');
const allRecipientsOptedInCount = document.getElementById('allRecipientsOptedInCount');
const searchRecipientsInput = document.getElementById('searchRecipientsInput');
const recipientsTableBody = document.getElementById('recipientsTableBody');
const recipientsCsvFile = document.getElementById('recipientsCsvFile');
const btnUploadCsv = document.getElementById('btnUploadCsv');
const btnExportCsv = document.getElementById('btnExportCsv');
const manualRecipientNumbers = document.getElementById('manualRecipientNumbers');
const manualRecipientsOptedIn = document.getElementById('manualRecipientsOptedIn');
const btnAddRecipients = document.getElementById('btnAddRecipients');
const recipientInputFeedback = document.getElementById('recipientInputFeedback');

// Live Log Elements
const liveLogList = document.getElementById('liveLogList');
const btnClearLogView = document.getElementById('btnClearLogView');
const searchLogInput = document.getElementById('searchLogInput');

// ==========================================================================
// Toast Notifications & Alerts
// ==========================================================================

function showToast(message, type = 'success') {
  // Update fallback alert element
  if (globalAlert) {
    globalAlert.className = `alert alert-${type === 'danger' ? 'danger' : type === 'warning' ? 'warning' : 'success'}`;
    globalAlert.textContent = message;
  }

  if (!toastContainer) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type === 'danger' ? 'danger' : type === 'warning' ? 'warning' : 'success'}`;
  
  // Icon based on type
  let iconSvg = '';
  if (type === 'danger') {
    iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#EF4444" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
  } else if (type === 'warning') {
    iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
  } else {
    iconSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>';
  }

  toast.innerHTML = `${iconSvg}<span>${escapeHtml(message)}</span>`;
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(8px)';
    toast.style.transition = 'all 200ms ease';
    setTimeout(() => toast.remove(), 220);
  }, 4000);
}

function showAlert(message, type = 'success') {
  showToast(message, type);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ==========================================================================
// View & Sub-Navigation Controllers
// ==========================================================================

function switchView(targetViewId) {
  // Update desktop nav
  desktopNavItems.forEach(item => {
    item.classList.toggle('active', item.dataset.view === targetViewId);
  });

  // Update mobile nav
  mobileNavItems.forEach(item => {
    item.classList.toggle('active', item.dataset.view === targetViewId);
  });

  // Update view panels
  viewPanels.forEach(panel => {
    panel.classList.toggle('active', panel.id === targetViewId);
  });

  // Specific view entry hooks
  if (targetViewId === 'contacts-view') {
    renderFilteredRecipients();
  }
}

// Desktop & Mobile Navigation Clicks
desktopNavItems.forEach(item => {
  item.addEventListener('click', () => switchView(item.dataset.view));
});

mobileNavItems.forEach(item => {
  item.addEventListener('click', () => switchView(item.dataset.view));
});

// Subnav Pill Switcher (Messaging & Contacts)
subnavPills.forEach(pill => {
  pill.addEventListener('click', () => {
    const parentContainer = pill.closest('.view-panel');
    if (!parentContainer) return;

    // Remove active from sibling pills
    parentContainer.querySelectorAll('.subnav-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');

    // Show matching subtab panel
    const targetSubtabId = pill.dataset.subtab;
    parentContainer.querySelectorAll('.subtab-panel').forEach(panel => {
      panel.classList.toggle('active', panel.id === targetSubtabId);
    });

    if (targetSubtabId === 'cont-activity-tab') {
      openLiveLog();
    }
  });
});

function openSubtab(viewId, subtabId) {
  switchView(viewId);
  const viewEl = document.getElementById(viewId);
  if (!viewEl) return;

  const targetPill = viewEl.querySelector(`[data-subtab="${subtabId}"]`);
  if (targetPill) {
    targetPill.click();
  }
}

// Quick action shortcuts
if (btnQuickRecipients) btnQuickRecipients.addEventListener('click', () => openSubtab('contacts-view', 'cont-recipients-tab'));
if (btnQuickAutoReply) btnQuickAutoReply.addEventListener('click', () => openSubtab('messaging-view', 'msg-autoreply-tab'));
if (btnQuickSend) btnQuickSend.addEventListener('click', () => openSubtab('messaging-view', 'msg-send-tab'));
if (btnDashEditCampaign) btnDashEditCampaign.addEventListener('click', () => openSubtab('messaging-view', 'msg-campaign-tab'));
if (btnDashGoSend) btnDashGoSend.addEventListener('click', () => openSubtab('messaging-view', 'msg-send-tab'));
if (btnDashViewAllActivity) btnDashViewAllActivity.addEventListener('click', () => openSubtab('contacts-view', 'cont-activity-tab'));
if (btnGoToSendFromCampaign) btnGoToSendFromCampaign.addEventListener('click', () => openSubtab('messaging-view', 'msg-send-tab'));

// ==========================================================================
// Settings Modal Controller
// ==========================================================================

function openSettingsModal() {
  if (settingsModal) {
    settingsModal.classList.add('active');
    settingsModal.setAttribute('aria-hidden', 'false');
  }
}

function closeSettingsModal() {
  if (settingsModal) {
    settingsModal.classList.remove('active');
    settingsModal.setAttribute('aria-hidden', 'true');
  }
}

if (btnOpenSettings) btnOpenSettings.addEventListener('click', openSettingsModal);
if (btnCloseSettings) btnCloseSettings.addEventListener('click', closeSettingsModal);
if (btnDoneSettings) btnDoneSettings.addEventListener('click', closeSettingsModal);

if (settingsModal) {
  settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) closeSettingsModal();
  });
}

// Password Masking Toggle
if (btnToggleTokenVisibility && webhookVerifyTokenInput) {
  btnToggleTokenVisibility.addEventListener('click', () => {
    const isPassword = webhookVerifyTokenInput.type === 'password';
    webhookVerifyTokenInput.type = isPassword ? 'text' : 'password';
    if (eyeIcon) {
      eyeIcon.innerHTML = isPassword
        ? '<path d="m2 2 20 20"/><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/>'
        : '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>';
    }
  });
}

// Copy to Clipboard Buttons
document.querySelectorAll('.webhook-copy').forEach(button => {
  button.addEventListener('click', async () => {
    const targetInput = document.getElementById(button.dataset.copyTarget);
    if (!targetInput?.value) return;

    try {
      await navigator.clipboard.writeText(targetInput.value);
    } catch {
      targetInput.select();
      document.execCommand('copy');
    }

    const originalContent = button.innerHTML;
    button.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg><span>Copied!</span>';
    setTimeout(() => {
      button.innerHTML = originalContent;
    }, 1800);
  });
});

// ==========================================================================
// Webhook & Backend Data Loading
// ==========================================================================

async function loadWebhookSetup() {
  const errorEl = document.getElementById('webhookSetupError');
  const warningEl = document.getElementById('webhookLocalWarning');
  const callbackUrlInput = document.getElementById('webhookCallbackUrl');

  try {
    const res = await fetch('/api/webhook-setup');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not load webhook configuration');

    if (callbackUrlInput) callbackUrlInput.value = data.callbackUrl || '';
    if (webhookVerifyTokenInput) webhookVerifyTokenInput.value = data.verifyToken || '';
    if (warningEl) warningEl.style.display = data.isLocalhost ? 'block' : 'none';
    if (!data.verifyToken && errorEl) {
      errorEl.textContent = 'WEBHOOK_VERIFY_TOKEN is missing in server environment.';
      errorEl.style.display = 'block';
    }
  } catch (err) {
    if (errorEl) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    }
  }
}

// ==========================================================================
// Monthly Stats Controller
// ==========================================================================

async function loadStats() {
  try {
    const res = await fetch('/api/stats');
    if (res.status === 401) return (window.location.href = '/login');
    currentStats = await res.json();

    const sent = currentStats.monthSentCount || 0;
    const limit = currentStats.monthlyLimit || 800;
    const remaining = Math.max(0, limit - sent);
    const percent = limit ? Math.min(100, (sent / limit) * 100) : 0;

    // Header Counters (Desktop & Mobile)
    if (sentCountDisplay) sentCountDisplay.textContent = sent;
    if (limitDisplay) limitDisplay.textContent = limit;
    if (usageProgressFill) usageProgressFill.style.width = `${percent}%`;
    document.querySelectorAll('[role="progressbar"]').forEach(bar => {
      bar.setAttribute('aria-valuemax', String(limit));
      bar.setAttribute('aria-valuenow', String(sent));
    });

    const dashQuotaSentMobile = document.getElementById('dashQuotaSentMobile');
    const dashQuotaLimitMobile = document.getElementById('dashQuotaLimitMobile');
    const dashQuotaProgressMobile = document.getElementById('dashQuotaProgressMobile');
    if (dashQuotaSentMobile) dashQuotaSentMobile.textContent = sent;
    if (dashQuotaLimitMobile) dashQuotaLimitMobile.textContent = limit;
    if (dashQuotaProgressMobile) dashQuotaProgressMobile.style.width = `${percent}%`;

    // Dashboard Cards
    if (dashSentCount) dashSentCount.textContent = sent;
    if (dashRemainingCount) dashRemainingCount.textContent = remaining;
    if (dashLimitCount) dashLimitCount.textContent = limit;

    // Send Campaign Summary
    if (sendSummaryQuota) sendSummaryQuota.textContent = `${sent} / ${limit} used (${remaining} left)`;
  } catch (err) {
    console.error('[loadStats error]', err);
  }
}

// ==========================================================================
// Message Templates Controller
// ==========================================================================

async function loadMessageTemplates() {
  try {
    const res = await fetch('/api/message-templates');
    if (res.status === 401) return (window.location.href = '/login');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not fetch templates from Meta');

    availableTemplates = Array.isArray(data.templates) ? data.templates : [];
    templateSelect.replaceChildren();

    const promptOption = document.createElement('option');
    promptOption.value = '';
    promptOption.textContent = availableTemplates.length ? 'Select an approved template' : 'No approved templates found';
    templateSelect.append(promptOption);

    availableTemplates.forEach((template, idx) => {
      const opt = document.createElement('option');
      opt.value = String(idx);
      opt.textContent = `${template.name} (${template.language})`;
      templateSelect.append(opt);
    });

    if (dashTemplateStatus) {
      dashTemplateStatus.textContent = availableTemplates.length ? `${availableTemplates.length} Approved` : 'None';
      dashTemplateStatus.className = `summary-value font-medium ${availableTemplates.length ? 'text-emerald' : 'text-muted'}`;
    }
  } catch (err) {
    templateSelect.replaceChildren(new Option('Could not load templates from Meta', ''));
    if (dashTemplateStatus) {
      dashTemplateStatus.textContent = 'API Error';
      dashTemplateStatus.className = 'summary-value font-medium text-danger';
    }
    showToast('Failed to load Meta templates: ' + err.message, 'danger');
  }
}

function getSelectedTemplate() {
  const idx = Number(templateSelect.value);
  return templateSelect.value !== '' && Number.isInteger(idx) ? availableTemplates[idx] : null;
}

function selectTemplateByNameAndLang(name, language) {
  const idx = availableTemplates.findIndex(t => t.name === name && t.language === language);
  templateSelect.value = idx < 0 ? '' : String(idx);
  if (languageCodeInput) {
    languageCodeInput.value = idx < 0 ? '' : availableTemplates[idx].language;
  }
  updateDashboardTemplateOverview();
}

function updateDashboardTemplateOverview() {
  const tpl = getSelectedTemplate();
  const name = tpl ? tpl.name : 'None selected';
  const lang = tpl ? tpl.language : '—';

  if (dashTemplateName) dashTemplateName.textContent = name;
  if (dashTemplateLang) dashTemplateLang.textContent = lang;
  if (sendSummaryTemplate) sendSummaryTemplate.textContent = name;
  if (sendSummaryLang) sendSummaryLang.textContent = lang;
}

// Clean Input Values
function cleanCampaignValue(value) {
  return String(value ?? '').trim().replace(/[\r\n\t]+/g, ' ').replace(/ {4,}/g, ' ');
}

// Load Dynamic Template Definition
async function loadTemplateDefinition(saved = {}) {
  const tpl = getSelectedTemplate();
  selectedDefinition = null;
  templateFields.replaceChildren();
  updateDashboardTemplateOverview();

  if (!tpl) {
    updateLivePreview();
    return;
  }

  const res = await fetch(`/api/message-template-definition?name=${encodeURIComponent(tpl.name)}&language=${encodeURIComponent(tpl.language)}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Could not load template definition');

  selectedDefinition = data.template;
  const priorHeader = saved.headers?.[tpl.name] || {};
  const header = selectedDefinition.components?.find(c => c.type === 'HEADER');

  if (header && header.format !== 'TEXT') {
    const sample = data.sampleHeader;
    selectedDefinition.sampleHeader = sample;
    selectedDefinition.headerChoice = priorHeader.mode ? priorHeader : sample ? { mode: 'sample', ...sample } : { mode: 'upload' };
  }

  const components = selectedDefinition.components || [];

  const addField = (label, key, val = '', type = 'text', required = true) => {
    const wrap = document.createElement('div');
    wrap.className = 'form-group';
    const lbl = document.createElement('label');
    lbl.className = 'form-label';
    lbl.textContent = label;
    const input = document.createElement('input');
    input.className = 'form-control';
    input.type = type;
    input.dataset.campaignKey = key;
    input.value = val || '';
    input.required = required;
    wrap.append(lbl, input);
    templateFields.append(wrap);
    return input;
  };

  const headerVars = (header?.text || '').match(/\{\{[^}]+\}\}/g) || [];

  if (header && header.format !== 'TEXT') {
    const wrap = document.createElement('div');
    wrap.className = 'form-group';
    const label = document.createElement('label');
    label.className = 'form-label';
    label.textContent = `Header Media (${header.format})`;
    wrap.append(label);

    const select = document.createElement('select');
    select.className = 'form-control';
    select.dataset.campaignKey = 'headerMode';
    select.style.marginBottom = '0.5rem';

    const opts = [
      ...(data.sampleHeader ? [['sample', "Use Meta's template sample image"]] : []),
      ['upload', 'Upload a custom file'],
      ['url', 'Paste a public HTTPS URL']
    ];
    opts.forEach(([val, text]) => select.append(new Option(text, val)));
    select.value = selectedDefinition.headerChoice.mode || 'upload';
    wrap.append(select);

    const upload = document.createElement('input');
    upload.type = 'file';
    upload.className = 'form-control';
    upload.accept = header.format === 'IMAGE' ? 'image/*' : header.format === 'VIDEO' ? 'video/*' : '.pdf,application/pdf';
    upload.dataset.headerUpload = 'true';

    const urlInput = document.createElement('input');
    urlInput.type = 'url';
    urlInput.className = 'form-control';
    urlInput.placeholder = 'https://example.com/header-media.jpg';
    urlInput.dataset.campaignKey = 'headerUrl';
    urlInput.value = selectedDefinition.headerChoice.mode === 'url' ? selectedDefinition.headerChoice.url || '' : '';

    const updateVisibility = () => {
      upload.style.display = select.value === 'upload' ? 'block' : 'none';
      urlInput.style.display = select.value === 'url' ? 'block' : 'none';
    };

    select.addEventListener('change', () => {
      selectedDefinition.headerChoice = select.value === 'sample'
        ? { mode: 'sample', ...data.sampleHeader }
        : select.value === 'url'
          ? { mode: 'url', url: urlInput.value }
          : { mode: 'upload' };
      updateVisibility();
      updateLivePreview();
    });

    upload.addEventListener('change', async () => {
      const file = upload.files?.[0];
      if (!file) return;
      const form = new FormData();
      form.append('image', file);
      try {
        const upRes = await fetch('/api/upload-template-media', { method: 'POST', body: form });
        const savedFile = await upRes.json();
        if (!upRes.ok) throw new Error(savedFile.error || 'Could not upload media');
        selectedDefinition.headerChoice = { mode: 'upload', fileName: savedFile.fileName, url: savedFile.url, mimeType: file.type };
        updateLivePreview();
        showToast('Template media uploaded successfully. Save settings to persist.');
      } catch (err) {
        showToast(err.message, 'danger');
      }
    });

    urlInput.addEventListener('input', () => {
      selectedDefinition.headerChoice = { mode: 'url', url: urlInput.value };
      updateLivePreview();
    });

    wrap.append(upload, urlInput);
    templateFields.append(wrap);
    updateVisibility();
  }

  if (headerVars.length) {
    addField(`Header Text Variable ${headerVars[0]}`, 'headerText', saved.headerText);
  }

  const body = components.find(c => c.type === 'BODY');
  const vars = (body?.text || '').match(/\{\{[^}]+\}\}/g) || [];
  vars.forEach((tok, i) => addField(`Body Variable ${tok}`, `body-${i}`, saved.bodyVariables?.[i]));

  (components.find(c => c.type === 'BUTTONS')?.buttons || []).forEach(btn => {
    if (btn.type === 'URL' && /\{\{1\}\}/.test(btn.url || '')) {
      addField(`URL Button [${btn.text || btn.index}] Variable`, `url-${btn.index}`, saved.urlButtonValues?.[String(btn.index)] || saved.urlButtonValue);
    }
    if (btn.type === 'QUICK_REPLY') {
      addField(`Quick Reply [${btn.text || btn.index}] Payload`, `quick-${btn.index}`, saved.quickReplyPayloads?.[String(btn.index)] || saved.quickReplyPayloads?.[btn.index]);
    }
  });

  updateLivePreview();
}

// Live WhatsApp Preview Simulator
function updateLivePreview() {
  if (!previewHeader || !previewText) return;

  const components = selectedDefinition?.components || [];
  const val = key => cleanCampaignValue(templateFields.querySelector(`[data-campaign-key="${key}"]`)?.value || '');

  // Header
  const header = components.find(c => c.type === 'HEADER');
  previewHeader.replaceChildren();

  if (header?.format === 'TEXT') {
    previewHeader.textContent = (header.text || '').replace(/\{\{[^}]+\}\}/g, token => val('headerText') || token);
    previewHeader.style.fontWeight = '700';
    previewHeader.style.marginBottom = '0.35rem';
  } else if (header && selectedDefinition?.headerChoice?.url) {
    const url = selectedDefinition.headerChoice.url;
    if (header.format === 'IMAGE') {
      const img = document.createElement('img');
      img.src = url;
      img.alt = 'Template Header';
      img.className = 'preview-header-img';
      previewHeader.append(img);
    } else if (header.format === 'VIDEO') {
      const vid = document.createElement('video');
      vid.src = url;
      vid.controls = true;
      vid.className = 'preview-header-img';
      previewHeader.append(vid);
    } else {
      const doc = document.createElement('a');
      doc.href = url;
      doc.textContent = '📄 Template Document';
      doc.className = 'preview-document';
      doc.target = '_blank';
      previewHeader.append(doc);
    }
  }

  // Body
  const body = components.find(c => c.type === 'BODY');
  if (body) {
    previewText.textContent = (body.text || '').replace(/\{\{([^}]+)\}\}/g, (token, name, offset, source) => {
      const tokens = [...source.matchAll(/\{\{([^}]+)\}\}/g)];
      const index = tokens.findIndex(match => match.index === offset);
      return val(`body-${index}`) || token;
    });
  } else {
    previewText.textContent = 'Select an approved WhatsApp template to view live preview.';
  }

  // Footer
  const footer = components.find(c => c.type === 'FOOTER');
  if (previewFooter) {
    previewFooter.textContent = footer?.text || '';
  }

  // Buttons
  if (previewActions) {
    previewActions.replaceChildren();
    (components.find(c => c.type === 'BUTTONS')?.buttons || []).forEach(button => {
      const btnEl = document.createElement('div');
      btnEl.className = 'preview-btn';
      if (button.type === 'QUICK_REPLY') {
        btnEl.textContent = `↩ ${button.text}`;
      } else if (button.type === 'URL') {
        const resolvedUrl = String(button.url || '').replace(/\{\{1\}\}/g, val(`url-${button.index}`) || '{{1}}');
        btnEl.textContent = `🔗 ${button.text || 'Open Link'}`;
        btnEl.title = resolvedUrl;
      } else if (button.type === 'PHONE_NUMBER') {
        btnEl.textContent = `☎ ${button.text || 'Call'} · ${button.phone_number || ''}`;
      }
      previewActions.append(btnEl);
    });
  }
}

templateSelect.addEventListener('change', async () => {
  const tpl = getSelectedTemplate();
  if (languageCodeInput) languageCodeInput.value = tpl?.language || '';
  try {
    await loadTemplateDefinition();
  } catch (err) {
    showToast(err.message, 'danger');
  }
  updateLivePreview();
});

templateFields.addEventListener('input', updateLivePreview);

// Save Campaign Form
function getCampaignFormSettings() {
  const tpl = getSelectedTemplate();
  if (!tpl || !selectedDefinition) return null;

  const values = Object.fromEntries(
    Array.from(templateFields.querySelectorAll('[data-campaign-key]'), el => [
      el.dataset.campaignKey,
      cleanCampaignValue(el.value)
    ])
  );

  const requiredEmpty = Array.from(templateFields.querySelectorAll('[required]')).find(
    el => !values[el.dataset.campaignKey]
  );
  if (requiredEmpty) {
    requiredEmpty.focus();
    throw new Error('Please fill in every required template variable.');
  }

  const headerDef = selectedDefinition.components.find(c => c.type === 'HEADER');
  if (headerDef && headerDef.format !== 'TEXT') {
    const choice = selectedDefinition.headerChoice;
    if (!choice?.fileName && !choice?.url) {
      throw new Error('Please choose a template sample, upload a media file, or paste a public HTTPS URL.');
    }
    if (choice.mode === 'url' && !/^https:\/\//i.test(choice.url || '')) {
      throw new Error('Header media must use a valid public HTTPS URL.');
    }
  }

  const bodyVariables = (selectedDefinition.components.find(c => c.type === 'BODY')?.text || '').match(/\{\{[^}]+\}\}/g) || [];
  const urlButtonValues = {};
  const quickReplyPayloads = {};

  for (const btn of selectedDefinition.components.find(c => c.type === 'BUTTONS')?.buttons || []) {
    if (btn.type === 'URL' && /\{\{1\}\}/.test(btn.url || '')) {
      urlButtonValues[String(btn.index)] = values[`url-${btn.index}`];
    }
    if (btn.type === 'QUICK_REPLY') {
      quickReplyPayloads[String(btn.index)] = values[`quick-${btn.index}`];
    }
  }

  const headers = { ...(currentConfig?.campaign?.headers || {}) };
  if (headerDef && headerDef.format !== 'TEXT') {
    headers[tpl.name] = { ...selectedDefinition.headerChoice, format: headerDef.format };
  }

  return {
    template: tpl.name,
    languageCode: tpl.language,
    headerImageUrl: values.headerImageUrl || '',
    headerText: values.headerText || '',
    bodyVariables: bodyVariables.map((_, i) => values[`body-${i}`]),
    urlButtonValues,
    quickReplyPayloads,
    headers
  };
}

campaignForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  let updatedCampaign;
  try {
    updatedCampaign = getCampaignFormSettings();
  } catch (err) {
    return showToast(err.message, 'danger');
  }

  if (!updatedCampaign) {
    return showToast('Select an approved Meta template first.', 'danger');
  }

  try {
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaign: updatedCampaign })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to save settings');
    currentConfig = data.config;
    updateDashboardTemplateOverview();
    showToast('Campaign template settings saved successfully!');
  } catch (err) {
    showToast('Save failed: ' + err.message, 'danger');
  }
});

// ==========================================
// Auto-Reply Rules Controller
// ==========================================

function renderAutoReplyState(enabled) {
  const state = Boolean(enabled);
  if (autoReplyToggle) {
    autoReplyToggle.setAttribute('aria-checked', String(state));
    autoReplyToggle.classList.toggle('is-on', state);
  }
  if (autoReplyToggleLabel) {
    autoReplyToggleLabel.textContent = state ? 'ON' : 'OFF';
    autoReplyToggleLabel.style.color = state ? 'var(--brand-green)' : 'var(--text-muted)';
  }
  if (autoReplyStatus) {
    autoReplyStatus.textContent = `Auto-reply: ${state ? 'ON' : 'OFF'}`;
    autoReplyStatus.classList.toggle('is-off', !state);
  }
  if (dashAutoReplyBadge) {
    dashAutoReplyBadge.textContent = state ? 'ACTIVE' : 'PAUSED';
    dashAutoReplyBadge.className = `badge-tag ${state ? 'badge-success' : 'badge-neutral'}`;
  }
}

if (autoReplyToggle) {
  autoReplyToggle.addEventListener('click', async () => {
    const nextState = autoReplyToggle.getAttribute('aria-checked') !== 'true';
    autoReplyToggle.disabled = true;
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoReplyEnabled: nextState })
      });
      const data = await res.json();
      if (res.status === 401) return (window.location.href = '/login');
      if (!res.ok) throw new Error(data.error || 'Could not update auto-reply state');
      currentConfig = data.config;
      renderAutoReplyState(nextState);
      showToast(`Auto-reply is now ${nextState ? 'ON' : 'OFF'}.`);
    } catch (err) {
      showToast('Could not update auto-reply: ' + err.message, 'danger');
    } finally {
      autoReplyToggle.disabled = false;
    }
  });
}

const DEFAULT_AUTOREPLY_TEXT = "🏆 PRIZE POOL – ₹10,000\n🔥 REGISTRATION LIVE!\nSecure your spot now. Join ASAP and compete for the prize!\n\nRegister Now | Match District";
const DEFAULT_AUTOREPLY_BUTTON_TEXT = 'Discord';
const DEFAULT_AUTOREPLY_BUTTON_URL = 'https://discord.gg/zMVN8ZmqTP';

function updateAutoReplyPreview() {
  if (autoReplyPreviewText) {
    const textVal = autoReplyText ? autoReplyText.value : '';
    autoReplyPreviewText.textContent = textVal.trim() ? textVal : DEFAULT_AUTOREPLY_TEXT;
  }
  if (autoReplyPreviewBtnLabel) {
    const titleVal = linkTitleInput ? linkTitleInput.value.trim() : '';
    autoReplyPreviewBtnLabel.textContent = titleVal || DEFAULT_AUTOREPLY_BUTTON_TEXT;
  }
}

if (autoReplyText) autoReplyText.addEventListener('input', updateAutoReplyPreview);
if (linkTitleInput) linkTitleInput.addEventListener('input', updateAutoReplyPreview);

function setReplyType(type) {
  // Auto-reply format is locked to CTA Link Button
}

if (autoReplyForm) {
  autoReplyForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const textVal = autoReplyText ? autoReplyText.value.trim() : '';
    const linkTitle = linkTitleInput ? linkTitleInput.value.trim() : '';
    const linkUrl = linkUrlInput ? linkUrlInput.value.trim() : '';

    const updatedAutoReply = {
      type: 'link',
      text: textVal || DEFAULT_AUTOREPLY_TEXT,
      imageUrl: '',
      caption: '',
      buttons: [],
      link: {
        title: linkTitle || DEFAULT_AUTOREPLY_BUTTON_TEXT,
        url: linkUrl || DEFAULT_AUTOREPLY_BUTTON_URL
      }
    };

    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoReply: updatedAutoReply })
      });
      const data = await res.json();
      if (res.status === 401) return (window.location.href = '/login');
      if (!res.ok) throw new Error(data.error || 'Failed to save settings');
      currentConfig = data.config || currentConfig;
      showToast('Auto-reply rules saved successfully!');
      updateAutoReplyPreview();
    } catch (err) {
      showToast('Save failed: ' + err.message, 'danger');
    }
  });
}

// ==========================================
// Recipients Controller (Search, Filter, Consent)
// ==========================================

async function loadRecipients() {
  try {
    const res = await fetch('/api/recipients');
    if (res.status === 401) return (window.location.href = '/login');
    currentRecipients = await res.json();

    const total = currentRecipients.total || 0;
    const optedIn = currentRecipients.optedIn || 0;
    const optedOut = currentRecipients.optedOut || 0;
    const allOptedIn = total > 0 && optedIn === total;

    // Contact counts
    if (totalRecipientsCount) totalRecipientsCount.textContent = total;
    if (optedInCount) optedInCount.textContent = optedIn;
    if (optedOutCount) optedOutCount.textContent = optedOut;

    // Dashboard overview
    if (dashEligibleCount) dashEligibleCount.textContent = optedIn;
    if (dashTotalContactsSub) dashTotalContactsSub.textContent = total;
    if (dashTemplateAudience) dashTemplateAudience.textContent = `${optedIn} contacts`;
    if (sendSummaryRecipients) sendSummaryRecipients.textContent = `${optedIn} opted-in`;

    // Toggle All Button State
    if (toggleAllRecipients) {
      toggleAllRecipients.setAttribute('aria-checked', String(allOptedIn));
      toggleAllRecipients.disabled = total === 0;
      if (allRecipientsOptedInCount) {
        allRecipientsOptedInCount.textContent = `${optedIn} / ${total} Opted In`;
      }
    }

    renderFilteredRecipients();
  } catch (err) {
    console.error('[loadRecipients error]', err);
  }
}

function renderFilteredRecipients() {
  if (!recipientsTableBody) return;
  recipientsTableBody.replaceChildren();

  const recipients = currentRecipients?.recipients || [];
  if (recipients.length === 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td colspan="4" class="table-empty">No contacts in recipients list. Upload a CSV or add numbers manually above.</td>';
    recipientsTableBody.appendChild(tr);
    return;
  }

  const query = recipientSearchQuery.trim().toLowerCase();
  const filtered = recipients.filter(r => {
    // Filter by opt-in status
    if (recipientFilter === 'opted-in' && !r.optedIn) return false;
    if (recipientFilter === 'opted-out' && r.optedIn) return false;
    // Search query
    if (query && !r.phone.toLowerCase().includes(query)) return false;
    return true;
  });

  if (filtered.length === 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td colspan="4" class="table-empty">No contacts match the selected search or filter criteria.</td>';
    recipientsTableBody.appendChild(tr);
    return;
  }

  filtered.forEach((r, idx) => {
    const tr = document.createElement('tr');
    tr.className = 'recipient-row';

    const indexCell = document.createElement('td');
    indexCell.className = 'col-index';
    indexCell.textContent = String(idx + 1);
    indexCell.style.color = 'var(--text-muted)';

    const phoneCell = document.createElement('td');
    phoneCell.className = 'col-phone';
    const strong = document.createElement('strong');
    strong.textContent = r.phone;
    phoneCell.append(strong);

    const statusCell = document.createElement('td');
    statusCell.className = 'col-status';
    const badge = document.createElement('span');
    badge.className = `badge-tag ${r.optedIn ? 'badge-success' : 'badge-danger'}`;
    badge.textContent = r.optedIn ? 'Opted In ✓' : 'Opted Out ✗';
    statusCell.append(badge);

    const toggleCell = document.createElement('td');
    toggleCell.className = 'col-toggle';
    toggleCell.style.textAlign = 'right';
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = `recipient-toggle${r.optedIn ? ' is-on' : ''}`;
    toggle.setAttribute('role', 'switch');
    toggle.setAttribute('aria-checked', String(Boolean(r.optedIn)));
    toggle.setAttribute('aria-label', `Toggle opt-in for ${r.phone}`);
    toggle.addEventListener('click', () => setRecipientOptIn(r.phone, !r.optedIn, toggle));
    toggleCell.append(toggle);

    tr.append(indexCell, phoneCell, statusCell, toggleCell);
    recipientsTableBody.appendChild(tr);
  });
}

// Recipient Search & Filters
if (searchRecipientsInput) {
  searchRecipientsInput.addEventListener('input', (e) => {
    recipientSearchQuery = e.target.value;
    renderFilteredRecipients();
  });
}

document.querySelectorAll('[data-recipient-filter]').forEach(button => {
  button.addEventListener('click', () => {
    recipientFilter = button.dataset.recipientFilter;
    document.querySelectorAll('[data-recipient-filter]').forEach(b => b.classList.toggle('active', b === button));
    renderFilteredRecipients();
  });
});

async function setRecipientOptIn(phone, optedIn, toggleBtn) {
  toggleBtn.disabled = true;
  try {
    const res = await fetch('/api/recipients/opt-in', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, optedIn })
    });
    const data = await res.json();
    if (res.status === 401) return (window.location.href = '/login');
    if (!res.ok) throw new Error(data.error || 'Failed to update recipient');
    await loadRecipients();
    showToast(`Recipient status set to ${optedIn ? 'Opted In' : 'Opted Out'}.`);
  } catch (err) {
    showToast('Update failed: ' + err.message, 'danger');
    toggleBtn.disabled = false;
  }
}

// Bulk Opt-In Toggle
if (toggleAllRecipients) {
  toggleAllRecipients.addEventListener('click', async () => {
    const total = currentRecipients?.total || 0;
    if (total === 0) return;

    const allOptedIn = currentRecipients.optedIn === total;
    const nextState = !allOptedIn;
    const label = nextState ? 'Opted In' : 'Opted Out';

    if (!window.confirm(`Set all ${total} contacts to ${label}?`)) return;

    toggleAllRecipients.disabled = true;
    try {
      const res = await fetch('/api/recipients/opt-in/all', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ optedIn: nextState })
      });
      const data = await res.json();
      if (res.status === 401) return (window.location.href = '/login');
      if (!res.ok) throw new Error(data.error || 'Failed to update contacts');
      await loadRecipients();
      showToast(`All contacts updated to ${label}.`);
    } catch (err) {
      showToast('Bulk update failed: ' + err.message, 'danger');
      toggleAllRecipients.disabled = false;
    }
  });
}

// Add Numbers Manually
if (btnAddRecipients && manualRecipientNumbers) {
  btnAddRecipients.addEventListener('click', async () => {
    const numbers = manualRecipientNumbers.value.trim();
    if (!numbers) {
      return showToast('Please enter at least one phone number.', 'warning');
    }

    if (recipientInputFeedback) {
      recipientInputFeedback.replaceChildren();
      recipientInputFeedback.style.display = 'none';
    }

    btnAddRecipients.disabled = true;
    btnAddRecipients.textContent = 'Adding...';

    try {
      const res = await fetch('/api/recipients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          numbers,
          optedIn: manualRecipientsOptedIn ? manualRecipientsOptedIn.checked : false
        })
      });
      const data = await res.json();
      if (res.status === 401) return (window.location.href = '/login');
      if (!res.ok) throw new Error(data.error || 'Could not add numbers');

      if (data.invalid?.length && recipientInputFeedback) {
        recipientInputFeedback.style.display = 'block';
        const strong = document.createElement('strong');
        strong.textContent = 'Rejected Numbers:';
        const list = document.createElement('ul');
        data.invalid.forEach(inv => {
          const li = document.createElement('li');
          li.textContent = `${inv.number}: ${inv.reason}`;
          list.append(li);
        });
        recipientInputFeedback.append(strong, list);
      }

      if (!data.invalid?.length) {
        manualRecipientNumbers.value = '';
      }

      await loadRecipients();
      showToast(
        `Added ${data.added} contact(s); skipped ${data.skipped} duplicate(s).${data.invalid?.length ? ` Rejected ${data.invalid.length} invalid.` : ''}`,
        data.invalid?.length ? 'warning' : 'success'
      );
    } catch (err) {
      showToast(err.message, 'danger');
    } finally {
      btnAddRecipients.disabled = false;
      btnAddRecipients.textContent = 'Add to Recipients List';
    }
  });
}

// Export CSV Handler
if (btnExportCsv) {
  btnExportCsv.addEventListener('click', () => {
    const recipients = currentRecipients?.recipients || [];
    if (recipients.length === 0) {
      return showToast('No recipients available to export.', 'warning');
    }

    // Direct browser CSV download
    const rows = ['phone,opted_in'];
    recipients.forEach(r => {
      rows.push(`"${r.phone}",${r.optedIn}`);
    });
    const blob = new Blob([rows.join('\n') + '\n'], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `matchdistrict_recipients_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Exported recipients.csv successfully!');
  });
}

// Upload CSV with Confirmation Modal
if (btnUploadCsv && recipientsCsvFile) {
  btnUploadCsv.addEventListener('click', () => recipientsCsvFile.click());

  recipientsCsvFile.addEventListener('change', () => {
    const file = recipientsCsvFile.files?.[0];
    if (!file) return;

    pendingCsvFile = file;
    if (confirmCsvModal) {
      confirmCsvModal.classList.add('active');
    }
  });
}

function closeCsvModal() {
  if (confirmCsvModal) confirmCsvModal.classList.remove('active');
  pendingCsvFile = null;
  if (recipientsCsvFile) recipientsCsvFile.value = '';
}

if (btnCsvModalCancel) btnCsvModalCancel.addEventListener('click', closeCsvModal);
if (btnCsvModalCloseX) btnCsvModalCloseX.addEventListener('click', closeCsvModal);

if (btnCsvModalConfirm) {
  btnCsvModalConfirm.addEventListener('click', async () => {
    if (!pendingCsvFile) return closeCsvModal();

    const formData = new FormData();
    formData.append('file', pendingCsvFile);
    closeCsvModal();

    btnUploadCsv.textContent = 'Uploading...';
    try {
      const res = await fetch('/api/upload-recipients', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'CSV upload failed');
      showToast('Recipients CSV uploaded & verified successfully!');
      await loadRecipients();
    } catch (err) {
      showToast('CSV upload failed: ' + err.message, 'danger');
    } finally {
      btnUploadCsv.textContent = 'Upload & Replace CSV';
    }
  });
}

// ==========================================
// Campaign Dispatch Controller
// ==========================================

if (btnSendCampaign) {
  btnSendCampaign.addEventListener('click', () => {
    const tpl = getSelectedTemplate();
    if (!tpl) {
      return showToast('Select an approved Meta template before dispatching.', 'warning');
    }

    const eligible = currentRecipients?.optedIn || 0;
    const sent = currentStats?.monthSentCount || 0;
    const limit = currentStats?.monthlyLimit || 800;
    const remaining = Math.max(0, limit - sent);

    if (modalPromptText) {
      modalPromptText.innerHTML = `
        You are about to dispatch <strong>${escapeHtml(tpl.name)}</strong> (${escapeHtml(tpl.language)}) to <strong>${eligible}</strong> opted-in recipients.<br><br>
        Monthly quota: <strong>${sent} / ${limit}</strong> messages used (<strong>${remaining}</strong> slots remaining).
      `;
    }

    if (confirmModal) confirmModal.classList.add('active');
  });
}

function closeConfirmModal() {
  if (confirmModal) confirmModal.classList.remove('active');
}

if (btnModalCancel) btnModalCancel.addEventListener('click', closeConfirmModal);
if (btnModalCloseX) btnModalCloseX.addEventListener('click', closeConfirmModal);

if (btnModalConfirm) {
  btnModalConfirm.addEventListener('click', async () => {
    let campaign;
    try {
      campaign = getCampaignFormSettings();
    } catch (err) {
      closeConfirmModal();
      return showToast(err.message, 'danger');
    }

    if (!campaign) {
      closeConfirmModal();
      return showToast('Select an approved Meta template first.', 'danger');
    }

    closeConfirmModal();
    btnSendCampaign.disabled = true;
    btnSendCampaign.innerHTML = '<span class="pulse-dot"></span><span>Dispatching campaign... please wait</span>';

    try {
      const res = await fetch('/api/send-campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaign })
      });

      const data = await res.json();
      btnSendCampaign.disabled = false;
      btnSendCampaign.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg><span>Dispatch Campaign Now</span>';

      if (!res.ok) {
        throw new Error(
          `${data.metaCode !== undefined ? `Meta error ${data.metaCode}: ` : ''}${data.error || 'Failed to dispatch campaign'}${data.errorDataDetails ? `\nerror_data.details: ${data.errorDataDetails}` : ''}${data.payload ? `\nJSON payload sent: ${JSON.stringify(data.payload)}` : ''}`
        );
      }

      // Show Results
      if (resultsCard) {
        resultsCard.style.display = 'block';
        resultsCard.scrollIntoView({ behavior: 'smooth' });
      }

      const isLimitHit = data.status === 'limit_reached';
      if (resultsAlert) {
        resultsAlert.className = `alert ${isLimitHit ? 'alert-warning' : 'alert-success'}`;
        resultsAlert.innerHTML = `<strong>${isLimitHit ? '⚠️ Monthly Limit Reached' : '✓ Campaign Finished'}</strong>: Skipped: <strong>${data.skipped}</strong> | Remaining: <strong>${data.remaining}</strong>`;
      }
      activeCampaignMessageIds = new Set(data.sentMessageIds || []);
      campaignCounts = { accepted: data.accepted ?? data.sent ?? 0, delivered: data.delivered || 0, read: data.read || 0, failed: data.failed || 0 };
      renderCampaignDeliveryCounts();

      // Render Failed Numbers
      if (Array.isArray(data.failedDetails) && data.failedDetails.length > 0 && failedSection && failedTableBody) {
        failedSection.style.display = 'block';
        failedTableBody.replaceChildren();
        data.failedDetails.forEach(f => {
          const tr = document.createElement('tr');
          tr.innerHTML = `<td><strong>${escapeHtml(f.phone)}</strong></td><td style="color: var(--danger);">${escapeHtml(f.error)}</td>`;
          failedTableBody.appendChild(tr);
        });
      } else if (failedSection) {
        failedSection.style.display = 'none';
      }

      await loadStats();
      showToast(isLimitHit ? 'Campaign stopped: Monthly limit reached.' : 'Campaign dispatched successfully!');
    } catch (err) {
      btnSendCampaign.disabled = false;
      btnSendCampaign.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg><span>Dispatch Campaign Now</span>';
      showToast('Campaign failed: ' + err.message, 'danger');
    }
  });
}

// ==========================================
// Live Activity Log & Database Sync
// ==========================================

function logActionLabel(action, details = '') {
  const labels = {
    accepted: 'Accepted by Meta',
    sent: /^Meta status sent\b/i.test(details) ? 'Sent' : 'Accepted by Meta',
    delivered: 'Delivered',
    read: 'Read',
    failed: 'Failed',
    skipped: 'Skipped',
    reply_received: 'Reply received',
    reply_sent: 'Reply Sent',
    webhook: 'Webhook',
    signature_mismatch: 'Signature mismatch',
    import: 'DB Import',
    export: 'DB Export'
  };
  return labels[action] || action;
}

function formatLogTime(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

function renderLiveLogs() {
  // 1. Render Dashboard Compact Activity List
  if (dashActivityList) {
    const recent = logEntries.slice(0, 6);
    if (!recent.length) {
      dashActivityList.innerHTML = '<div class="empty-state-compact"><p>No recent activity recorded.</p></div>';
    } else {
      dashActivityList.replaceChildren();
      recent.forEach(entry => {
        const item = document.createElement('div');
        item.className = 'activity-mini-item';
        item.innerHTML = `
          <div class="activity-mini-left">
            <span class="badge-tag log-${entry.action}">${logActionLabel(entry.action, entry.details)}</span>
            <strong>${escapeHtml(entry.phone || 'System')}</strong>
          </div>
          <span class="activity-mini-time">${formatLogTime(entry.timestamp)}</span>
        `;
        dashActivityList.appendChild(item);
      });
    }
  }

  // 2. Render Full Live Delivery Stream
  if (!liveLogList || logViewCleared) return;
  liveLogList.replaceChildren();

  const query = logSearchQuery.trim().toLowerCase();
  const filtered = logEntries.filter(entry => {
    if (logFilter === 'sent' && !(['accepted', 'sent', 'delivered', 'read', 'reply_sent', 'reply_received'].includes(entry.action))) return false;
    if (logFilter === 'failed' && entry.action !== 'failed') return false;
    if (logFilter === 'skipped' && entry.action !== 'skipped') return false;
    if (query) {
      const matchPhone = (entry.phone || '').toLowerCase().includes(query);
      const matchDetails = (entry.details || '').toLowerCase().includes(query);
      if (!matchPhone && !matchDetails) return false;
    }
    return true;
  });

  if (!filtered.length) {
    liveLogList.innerHTML = '<p class="help-text">No delivery logs matching this filter.</p>';
    return;
  }

  filtered.forEach(entry => {
    const article = document.createElement('article');
    article.className = 'live-log-entry';

    const header = document.createElement('div');
    header.className = 'live-log-entry-header';

    const time = document.createElement('time');
    time.dateTime = entry.timestamp;
    time.textContent = formatLogTime(entry.timestamp);

    const phone = document.createElement('strong');
    phone.textContent = entry.phone || 'System Event';

    const badge = document.createElement('span');
    badge.className = `badge-tag log-${entry.action}`;
    badge.textContent = logActionLabel(entry.action, entry.details);

    header.append(time, phone, badge);

    const details = document.createElement('p');
    details.className = 'live-log-details';
    details.textContent = entry.details || '';

    article.append(header, details);
    liveLogList.appendChild(article);
  });
}

function receiveLog(entry) {
  if (logIds.has(entry.id)) return;
  const messageId = entry.details?.match(/message ID:\s*([^\s·]+)/i)?.[1];
  if (messageId && activeCampaignMessageIds.has(messageId)) {
    if (entry.action === 'delivered') campaignCounts.delivered++;
    if (entry.action === 'read') campaignCounts.read++;
    if (entry.action === 'failed') campaignCounts.failed++;
    renderCampaignDeliveryCounts();
  }
  logIds.add(entry.id);
  logEntries.unshift(entry);
  logEntries = logEntries.slice(0, 250);
  logViewCleared = false;
  renderLiveLogs();
}

let activeCampaignMessageIds = new Set();
let campaignCounts = { accepted: 0, delivered: 0, read: 0, failed: 0 };
function renderCampaignDeliveryCounts() {
  const host = document.getElementById('campaignDeliveryCounts');
  if (host) host.textContent = `Accepted by Meta: ${campaignCounts.accepted} · Delivered: ${campaignCounts.delivered} · Read: ${campaignCounts.read} · Failed: ${campaignCounts.failed}`;
}

async function openLiveLog() {
  try {
    const res = await fetch('/api/logs');
    if (res.status === 401) return (window.location.href = '/login');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not load logs');

    logEntries = data.logs || [];
    logIds = new Set(logEntries.map(e => e.id));
    logViewCleared = false;
    renderLiveLogs();

    if (!logSource) {
      logSource = new EventSource('/api/logs/stream');
      logSource.addEventListener('log', e => {
        try {
          receiveLog(JSON.parse(e.data));
        } catch { /* Malformed SSE ignore */ }
      });
    }
  } catch (err) {
    if (liveLogList) liveLogList.textContent = `Could not load logs: ${err.message}`;
  }
}

// Log Filters
document.querySelectorAll('[data-log-filter]').forEach(btn => {
  btn.addEventListener('click', () => {
    logFilter = btn.dataset.logFilter;
    document.querySelectorAll('[data-log-filter]').forEach(b => b.classList.toggle('active', b === btn));
    renderLiveLogs();
  });
});

if (searchLogInput) {
  searchLogInput.addEventListener('input', (e) => {
    logSearchQuery = e.target.value;
    renderLiveLogs();
  });
}

if (btnClearLogView) {
  btnClearLogView.addEventListener('click', () => {
    logViewCleared = true;
    if (liveLogList) liveLogList.replaceChildren();
    showToast('Activity view cleared.');
  });
}

// Database Import
if (btnImportDb && importDbFile) {
  btnImportDb.addEventListener('click', () => importDbFile.click());

  importDbFile.addEventListener('change', async () => {
    const file = importDbFile.files?.[0];
    if (!file) return;

    if (!window.confirm('Importing a database will merge historical records and sent statuses into your existing database. Continue?')) {
      importDbFile.value = '';
      return;
    }

    const form = new FormData();
    form.append('database', file);
    if (dbSyncStatus) dbSyncStatus.textContent = 'Importing database...';

    try {
      const res = await fetch('/api/database/import', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Database import failed');
      if (dbSyncStatus) dbSyncStatus.textContent = `Import complete: ${data.added} number(s) merged.`;
      showToast(`Database imported successfully. ${data.added} number(s) added.`);
      await Promise.all([loadStats(), openLiveLog()]);
    } catch (err) {
      if (dbSyncStatus) dbSyncStatus.textContent = err.message;
      showToast(err.message, 'danger');
    } finally {
      importDbFile.value = '';
    }
  });
}

// ==========================================
// Application Bootstrap
// ==========================================

async function loadConfig() {
  try {
    const res = await fetch('/api/config');
    if (res.status === 401) return (window.location.href = '/login');
    currentConfig = await res.json();

    renderAutoReplyState(currentConfig.autoReplyEnabled !== false);

    // Populate Campaign
    const c = currentConfig.campaign || {};
    selectTemplateByNameAndLang(c.template, c.languageCode);
    await loadTemplateDefinition(c);

    // Populate Auto-Reply
    const ar = currentConfig.autoReply || {};
    if (autoReplyText) autoReplyText.value = ar.text || DEFAULT_AUTOREPLY_TEXT;
    if (linkTitleInput) linkTitleInput.value = (ar.link && ar.link.title) ? ar.link.title : DEFAULT_AUTOREPLY_BUTTON_TEXT;
    if (linkUrlInput) linkUrlInput.value = (ar.link && ar.link.url) ? ar.link.url : DEFAULT_AUTOREPLY_BUTTON_URL;
    updateAutoReplyPreview();
  } catch (err) {
    console.error('[loadConfig error]', err);
  }
}

const createTemplateForm = document.getElementById('createTemplateForm');
const newTemplateBody = document.getElementById('newTemplateBody');
const newTemplateName = document.getElementById('newTemplateName');
const newTemplateResult = document.getElementById('newTemplateResult');
const adminTemplateList = document.getElementById('adminTemplateList');
const sendOneForm = document.getElementById('sendOneForm');
const sendOneTemplate = document.getElementById('sendOneTemplate');

if (newTemplateName) newTemplateName.addEventListener('input', () => { newTemplateName.value = newTemplateName.value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''); });
function updateCreatePreview() {
  if (!newTemplateBody) return;
  const samples = [...document.querySelectorAll('[data-template-sample]')].map(input => input.value || `{{${input.dataset.templateSample}}}`);
  let body = newTemplateBody.value.replace(/\{\{(\d+)\}\}/g, (_, n) => samples[Number(n) - 1] || `{{${n}}}`);
  const headerType = document.getElementById('newTemplateHeaderType').value;
  const header = headerType === 'text' ? document.getElementById('newTemplateHeaderText').value : headerType === 'image' ? '🖼️ Image header' : '';
  const footer = document.getElementById('newTemplateFooter').value;
  const buttonType = document.getElementById('newTemplateButtonType').value;
  const buttonPreview = buttonType === 'quick_reply' ? document.getElementById('newTemplateButtonLabels')?.value : ['url', 'phone'].includes(buttonType) ? document.getElementById('newTemplateButtonLabel')?.value : '';
  document.getElementById('newTemplatePreview').textContent = [header, body, footer, buttonPreview ? `［ ${buttonPreview} ］` : ''].filter(Boolean).join('\n');
}
function renderTemplateSamples() {
  const host = document.getElementById('newTemplateSamples');
  const count = Math.max(0, ...[...newTemplateBody.value.matchAll(/\{\{(\d+)\}\}/g)].map(match => Number(match[1])));
  host.replaceChildren();
  for (let index = 1; index <= count; index++) {
    const input = document.createElement('input'); input.className = 'form-control'; input.placeholder = `Sample value for {{${index}}}`; input.dataset.templateSample = String(index); input.required = true;
    const wrap = document.createElement('div'); wrap.className = 'form-group'; wrap.append(input); host.append(wrap);
  }
  host.querySelectorAll('input').forEach(input => input.addEventListener('input', updateCreatePreview));
  updateCreatePreview();
}
newTemplateBody?.addEventListener('input', renderTemplateSamples);
['newTemplateHeaderType', 'newTemplateHeaderText', 'newTemplateFooter'].forEach(id => document.getElementById(id)?.addEventListener('input', updateCreatePreview));
document.getElementById('newTemplateHeaderType')?.addEventListener('change', event => {
  document.getElementById('newTemplateHeaderTextWrap').hidden = event.target.value !== 'text';
  document.getElementById('newTemplateHeaderImageWrap').hidden = event.target.value !== 'image'; updateCreatePreview();
});
document.getElementById('newTemplateButtonType')?.addEventListener('change', event => {
  const host = document.getElementById('newTemplateButtonsFields'); host.hidden = event.target.value === 'none'; host.replaceChildren();
  const fields = event.target.value === 'quick_reply' ? [['Labels (comma separated, max 3)', 'newTemplateButtonLabels', 'text']] : event.target.value === 'url' ? [['Button label', 'newTemplateButtonLabel', 'text'], ['HTTPS link', 'newTemplateButtonLink', 'url']] : event.target.value === 'phone' ? [['Button label', 'newTemplateButtonLabel', 'text'], ['Phone number', 'newTemplateButtonPhone', 'tel']] : [];
  fields.forEach(([label, id, type]) => { const wrap = document.createElement('div'); wrap.className = 'form-group'; const l = document.createElement('label'); l.className='form-label'; l.htmlFor=id; l.textContent=label; const input=document.createElement('input'); input.id=id; input.type=type; input.className='form-control'; input.required=true; wrap.append(l,input); host.append(wrap); });
  host.querySelectorAll('input').forEach(input => input.addEventListener('input', updateCreatePreview)); updateCreatePreview();
});
async function refreshAdminTemplates() {
  const response = await fetch('/api/admin/message-templates/refresh', { method: 'POST' }); const data = await response.json();
  if (response.status === 401) return (window.location.href = '/login');
  if (!response.ok) throw new Error(data.error || 'Could not refresh template status');
  adminTemplateList.replaceChildren();
  (data.templates || []).forEach(template => { const row=document.createElement('div'); row.className='template-status-row'; const info=document.createElement('div'); const title=document.createElement('strong'); title.textContent=`${template.name} (${template.language})`; const state=document.createElement('span'); state.textContent=`${template.status}${template.rejected_reason ? ` · ${template.rejected_reason}` : ''}`; info.append(title,state); row.append(info); adminTemplateList.append(row); });
  availableTemplates = (data.templates || []).filter(template => template.status === 'APPROVED').map(template => ({ name: template.name, language: template.language }));
  const current = sendOneTemplate?.value; if (sendOneTemplate) { sendOneTemplate.replaceChildren(new Option('Choose approved template', '')); availableTemplates.forEach((template,index)=>sendOneTemplate.add(new Option(`${template.name} (${template.language})`, String(index)))); }
  await loadMessageTemplates();
}
document.getElementById('refreshTemplates')?.addEventListener('click', () => refreshAdminTemplates().catch(err => showToast(err.message, 'danger')));
createTemplateForm?.addEventListener('submit', async event => {
  event.preventDefault(); newTemplateResult.textContent = 'Submitting template…';
  const headerType=document.getElementById('newTemplateHeaderType').value; const buttonType=document.getElementById('newTemplateButtonType').value;
  const buttons = buttonType === 'quick_reply' ? document.getElementById('newTemplateButtonLabels').value.split(',').map(value=>value.trim()).filter(Boolean).slice(0,3).map(text=>({type:'QUICK_REPLY',text})) : buttonType === 'url' ? [{type:'URL',text:document.getElementById('newTemplateButtonLabel').value.trim(),url:document.getElementById('newTemplateButtonLink').value.trim()}] : buttonType === 'phone' ? [{type:'PHONE_NUMBER',text:document.getElementById('newTemplateButtonLabel').value.trim(),phone_number:document.getElementById('newTemplateButtonPhone').value.replace(/\D/g,'')}] : [];
  const form = new FormData(); form.set('name',newTemplateName.value); form.set('category',document.getElementById('newTemplateCategory').value); form.set('language',document.getElementById('newTemplateLanguage').value); form.set('headerType',headerType); form.set('headerText',document.getElementById('newTemplateHeaderText').value); form.set('body',newTemplateBody.value); form.set('footer',document.getElementById('newTemplateFooter').value); form.set('sampleValues',JSON.stringify([...document.querySelectorAll('[data-template-sample]')].map(input=>input.value))); form.set('buttons',JSON.stringify(buttons));
  if (headerType==='image') { const file=document.getElementById('newTemplateHeaderImage').files[0]; if(file) form.set('headerImage',file); }
  try { const response=await fetch('/api/admin/message-templates',{method:'POST',body:form}); const data=await response.json(); if(response.status===401) return (window.location.href='/login'); if(!response.ok) throw new Error([data.error,data.metaCode ? `Meta code ${data.metaCode}` : '',data.errorDataDetails, data.payload ? `Payload: ${JSON.stringify(data.payload)}` : ''].filter(Boolean).join('\n')); newTemplateResult.textContent=`Created ${data.template.name || newTemplateName.value}. Status: ${data.template.status || 'PENDING'}`; await refreshAdminTemplates(); } catch(error) { newTemplateResult.textContent=error.message; }
});

document.getElementById('sendOneMode')?.addEventListener('change', event => { const isText=event.target.value==='text'; document.getElementById('sendOneTemplateWrap').hidden=isText; document.getElementById('sendOneTextWrap').hidden=!isText; });
sendOneTemplate?.addEventListener('change', async () => {
  const template=availableTemplates[Number(sendOneTemplate.value)]; const host=document.getElementById('sendOneVariables'); host.replaceChildren(); if(!template) return;
  try { const response=await fetch(`/api/message-template-definition?name=${encodeURIComponent(template.name)}&language=${encodeURIComponent(template.language)}`); const data=await response.json(); if(!response.ok) throw new Error(data.error); const body=data.template.components?.find(component=>component.type==='BODY')?.text || ''; const vars=Math.max(0,...[...body.matchAll(/\{\{(\d+)\}\}/g)].map(match=>Number(match[1]))); for(let i=1;i<=vars;i++){const input=document.createElement('input');input.className='form-control';input.placeholder=`Value for {{${i}}}`;input.dataset.sendVariable=String(i);input.required=true;host.append(input);} } catch(error) { host.textContent=error.message; }
});
sendOneForm?.addEventListener('submit', async event => {
  event.preventDefault(); const result=document.getElementById('sendOneResult'); result.textContent='Sending…';
  const mode=document.getElementById('sendOneMode').value; const template=availableTemplates[Number(sendOneTemplate.value)]; const payload={phone:document.getElementById('sendOnePhone').value,mode};
  if(mode==='template'){if(!template){result.textContent='Choose an approved template.';return;} payload.templateName=template.name;payload.language=template.language;payload.variables=[...document.querySelectorAll('[data-send-variable]')].map(input=>input.value);} else payload.text=document.getElementById('sendOneText').value;
  try {const response=await fetch('/api/admin/send-one',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const data=await response.json();if(response.status===401)return(window.location.href='/login');if(!response.ok)throw new Error([data.error,data.metaCode !== undefined ? `Meta error code: ${data.metaCode}` : '',data.errorDataDetails ? `error_data.details: ${data.errorDataDetails}` : '',data.details,data.payload ? `JSON payload sent: ${JSON.stringify(data.payload)}` : ''].filter(Boolean).join('\n')); result.textContent=`Sent successfully. Meta message ID: ${data.messageId}`; loadStats();}catch(error){result.textContent=error.message;}
});

async function initialize() {
  try {
    await Promise.all([
      loadStats(),
      loadRecipients(),
      loadWebhookSetup(),
      loadMessageTemplates(),
      refreshAdminTemplates().catch(error => console.warn('[Template status]', error.message)),
      openLiveLog()
    ]);
    await loadConfig();
    updateLivePreview();
  } catch (err) {
    showToast('Dashboard initialization error: ' + err.message, 'danger');
  }
}

// Start application
initialize();
