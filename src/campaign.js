import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import csvParser from 'csv-parser';
import { resolveTemplate, sendTemplateMessage } from './whatsapp.js';
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

/** Append manually entered recipients without replacing the uploaded CSV. */
export async function addRecipientsToCsv(rawNumbers, optedIn = false) {
  if (!Array.isArray(rawNumbers) || rawNumbers.length === 0) {
    throw new Error('Enter at least one phone number.');
  }

  const normalizedNumbers = rawNumbers.map(value => String(value || '').trim());
  const invalid = normalizedNumbers.filter(value => {
    const digits = value.replace(/\D/g, '');
    return digits.length < 7 || digits.length > 15;
  });
  if (invalid.length > 0) {
    throw new Error(`Invalid phone number(s): ${invalid.join(', ')}`);
  }

  const current = await readRecipientsFromCsv();
  const existingNumbers = new Set(current.map(recipient => recipient.phone.replace(/\D/g, '')));
  const added = [];
  const skipped = [];
  for (const value of normalizedNumbers) {
    const digits = value.replace(/\D/g, '');
    if (existingNumbers.has(digits)) {
      skipped.push(value);
      continue;
    }
    existingNumbers.add(digits);
    added.push({ phone: value, optedIn: Boolean(optedIn) });
  }

  if (added.length > 0) {
    const rows = [...current, ...added];
    const escapeCsv = value => `"${String(value).replace(/"/g, '""')}"`;
    const csv = ['phone,opted_in', ...rows.map(row => `${escapeCsv(row.phone)},${row.optedIn}`)].join('\n') + '\n';
    await fs.promises.writeFile(CSV_FILE, csv, 'utf8');
  }

  return { added: added.length, skipped: skipped.length };
}

/**
 * Run bulk campaign send logic.
 */
export async function runCampaign(overrideCampaignConfig = null) {
  const config = await loadConfig();
  const campaignSettings = overrideCampaignConfig || config.campaign || {};

  const templateResolved = resolveTemplate(
    campaignSettings.template || 'hello',
    campaignSettings.languageCode || 'en_US'
  );

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
        templateName: templateResolved.name,
        languageCode: templateResolved.languageCode,
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
      failedDetails.push({ phone: normalized, error: err.message });
      console.error(`[Campaign Error] Failed to send to ${normalized}:`, err.message);
    }
  }

  return {
    status: limitReached ? 'limit_reached' : 'completed',
    month: monthKey,
    monthlyLimit,
    templateUsed: templateResolved.name,
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
