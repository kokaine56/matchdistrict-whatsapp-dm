import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import csvParser from 'csv-parser';
import { sendTemplateMessage } from './whatsapp.js';
import {
  getCurrentMonthKey,
  getMonthSentCount,
  isAlreadySentThisMonth,
  normalizePhone,
  recordSuccessfulSend
} from './tracker.js';
import { loadConfig } from './config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const CSV_FILE = path.resolve(__dirname, '../recipients.csv');

/**
 * Parse recipients.csv into an array of { phone, optedIn }
 */
export async function readRecipientsFromCsv(filePath = CSV_FILE) {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  return new Promise((resolve, reject) => {
    const recipients = [];
    fs.createReadStream(filePath)
      .pipe(csvParser())
      .on('data', (row) => {
        const phoneKey = Object.keys(row).find(k => /phone|number|mobile/i.test(k)) || Object.keys(row)[0];
        const rawPhone = row[phoneKey];

        const optKey = Object.keys(row).find(k => /opt/i.test(k));
        const rawOpt = optKey ? row[optKey] : 'false';
        const isOptedIn = String(rawOpt).trim().toLowerCase() === 'true';

        recipients.push({
          phone: rawPhone ? String(rawPhone).trim() : '',
          optedIn: isOptedIn
        });
      })
      .on('end', () => resolve(recipients))
      .on('error', (err) => reject(err));
  });
}

/**
 * Return summary of recipients for the UI.
 */
export async function getRecipientsSummary() {
  const recipients = await readRecipientsFromCsv();
  const total = recipients.length;
  const optedIn = recipients.filter(r => r.optedIn).length;
  const optedOut = total - optedIn;
  return {
    total,
    optedIn,
    optedOut,
    preview: recipients.slice(0, 50)
  };
}

function parsePhoneEntries(input) {
  const pieces = String(input || '').split(/[\s,]+/).filter(Boolean);
  const seen = new Set();
  const valid = [];
  const invalid = [];
  const duplicates = [];

  for (const piece of pieces) {
    const trimmed = piece.trim();
    const cleaned = trimmed.replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '');
    if (!cleaned) continue;
    const digits = cleaned.replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 15) {
      invalid.push({ number: trimmed, reason: 'Must contain 10 to 15 digits, including the country code.' });
      continue;
    }
    if (seen.has(digits)) {
      duplicates.push(cleaned);
      continue;
    }
    seen.add(digits);
    valid.push(cleaned);
  }
  return { valid, invalid, duplicates };
}

async function writeRecipients(recipients) {
  const escapeCsv = value => `"${String(value).replace(/"/g, '""')}"`;
  const csv = ['phone,opted_in', ...recipients.map(row => `${escapeCsv(row.phone)},${row.optedIn}`)].join('\n') + '\n';
  await fs.promises.writeFile(CSV_FILE, csv, 'utf8');
}

/** Add valid manually entered recipients while preserving existing rows. */
export async function addRecipientsToCsv(input, optedIn = false) {
  const { valid, invalid, duplicates } = parsePhoneEntries(input);
  const current = await readRecipientsFromCsv();
  const existingNumbers = new Set(current.map(recipient => recipient.phone.replace(/\D/g, '')));
  const added = [];
  for (const value of valid) {
    const digits = value.replace(/\D/g, '');
    if (existingNumbers.has(digits)) {
      duplicates.push(value);
      continue;
    }
    existingNumbers.add(digits);
    added.push({ phone: value, optedIn: Boolean(optedIn) });
  }

  if (added.length > 0) {
    await writeRecipients([...current, ...added]);
  }

  return { added: added.length, skipped: duplicates.length, invalid };
}

/** Update consent status for every CSV row matching a phone number. */
export async function updateRecipientOptIn(phone, optedIn) {
  const normalized = String(phone || '').replace(/\D/g, '');
  if (normalized.length < 10 || normalized.length > 15 || typeof optedIn !== 'boolean') {
    throw new Error('A valid 10 to 15 digit number and opt-in status are required.');
  }
  const current = await readRecipientsFromCsv();
  let updated = false;
  const recipients = current.map(recipient => {
    if (recipient.phone.replace(/\D/g, '') !== normalized) return recipient;
    updated = true;
    return { ...recipient, optedIn };
  });
  if (!updated) throw new Error('Recipient not found.');
  await writeRecipients(recipients);
  return { phone: normalized, optedIn };
}

/**
 * Run bulk campaign send logic.
 */
export async function runCampaign(overrideCampaignConfig = null) {
  const config = await loadConfig();
  const campaignSettings = { ...(config.campaign || {}), ...(overrideCampaignConfig || {}) };
  const templateName = campaignSettings.template;
  const languageCode = campaignSettings.languageCode;
  if (typeof templateName !== 'string' || !templateName || typeof languageCode !== 'string' || !languageCode) {
    throw new Error('Select an approved Meta template and its language before sending.');
  }

  const monthlyLimit = parseInt(process.env.MONTHLY_LIMIT || '800', 10);
  const monthKey = getCurrentMonthKey();
  const recipients = await readRecipientsFromCsv();

  if (recipients.length === 0) {
    throw new Error('recipients.csv is empty or missing. Please upload a valid CSV file.');
  }

  let sentCount = 0;
  let alreadySentCount = 0;
  let skippedOptOutCount = 0;
  let failedCount = 0;
  let skippedDueToLimit = 0;
  const failedDetails = [];

  let currentMonthTotal = await getMonthSentCount(monthKey);
  let limitReached = false;

  for (let i = 0; i < recipients.length; i++) {
    const recipient = recipients[i];
    const normalized = normalizePhone(recipient.phone);

    // 1. Skip non-opted-in numbers
    if (!recipient.optedIn) {
      skippedOptOutCount++;
      continue;
    }

    // 2. Validate phone number format
    if (!normalized || normalized.length < 7) {
      console.warn(`[Campaign] Skipping invalid phone number: "${recipient.phone}"`);
      failedCount++;
      failedDetails.push({ phone: recipient.phone, error: 'Invalid phone number format' });
      continue;
    }

    // 3. Check if already messaged this calendar month
    const alreadySent = await isAlreadySentThisMonth(normalized, monthKey);
    if (alreadySent) {
      alreadySentCount++;
      continue;
    }

    // 4. Hard Cap check
    if (currentMonthTotal >= monthlyLimit) {
      limitReached = true;
      const remainingRecipients = recipients.slice(i);
      skippedDueToLimit = remainingRecipients.filter(r => r.optedIn).length;
      console.warn(
        `[Campaign] Monthly limit reached (${currentMonthTotal}/${monthlyLimit}). Stopped immediately. Skipped ${skippedDueToLimit} remaining recipients.`
      );
      break;
    }

    // 5. Send approved template message
    try {
      await sendTemplateMessage({
        to: normalized,
        templateName,
        languageCode,
        headerImageUrl: campaignSettings.headerImageUrl,
        bodyVariables: campaignSettings.bodyVariables,
        urlButtonValue: campaignSettings.urlButtonValue,
        quickReplyPayloads: campaignSettings.quickReplyPayloads
      });

      // Successful send - record in month tracking
      currentMonthTotal = await recordSuccessfulSend(normalized, monthKey);
      sentCount++;
      console.log(`[Campaign] Sent successfully to ${normalized} (${currentMonthTotal}/${monthlyLimit})`);
    } catch (err) {
      // 6. On failure: log error, do NOT count toward 800 limit, continue to next
      failedCount++;
      const templateError = [132001, 132000].includes(Number(err.metaCode))
        ? `Meta error ${err.metaCode}: ${err.message} Template sent: ${templateName}; language sent: ${languageCode}.`
        : err.message;
      failedDetails.push({ phone: normalized, error: templateError });
      console.error(`[Campaign Error] Failed to send to ${normalized}:`, err.message);
    }
  }

  return {
    status: limitReached ? 'limit_reached' : 'completed',
    month: monthKey,
    monthlyLimit,
    templateUsed: templateName,
    templateLanguage: languageCode,
    totalInCsv: recipients.length,
    sent: sentCount,
    alreadySentThisMonth: alreadySentCount,
    skippedOptOut: skippedOptOutCount,
    failed: failedCount,
    skippedDueToLimit,
    currentMonthTotalSent: currentMonthTotal,
    ...(limitReached && {
      message: `Monthly limit of ${monthlyLimit} unique users messaged for ${monthKey} was reached. Stopped immediately; ${skippedDueToLimit} opted-in recipients were skipped.`
    }),
    ...(failedDetails.length > 0 && { failedDetails })
  };
}
