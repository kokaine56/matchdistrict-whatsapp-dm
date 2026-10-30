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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CSV_FILE = path.resolve(__dirname, '../recipients.csv');

/**
 * Parse recipients.csv into an array of { phone, optedIn }
 */
export async function readRecipientsFromCsv(filePath = CSV_FILE) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Recipients file not found at: ${filePath}`);
  }

  return new Promise((resolve, reject) => {
    const recipients = [];
    fs.createReadStream(filePath)
      .pipe(csvParser())
      .on('data', (row) => {
        // Find phone from possible header names
        const phoneKey = Object.keys(row).find(k => /phone|number/i.test(k)) || Object.keys(row)[0];
        const rawPhone = row[phoneKey];

        // Find opted_in flag
        const optKey = Object.keys(row).find(k => /opt/i.test(k));
        const rawOpt = optKey ? row[optKey] : 'false';
        const isOptedIn = String(rawOpt).trim().toLowerCase() === 'true';

        recipients.push({
          phone: rawPhone,
          optedIn: isOptedIn
        });
      })
      .on('end', () => resolve(recipients))
      .on('error', (err) => reject(err));
  });
}

/**
 * Execute the campaign send logic.
 */
export async function runCampaign(templateKey) {
  const template = resolveTemplate(templateKey);
  if (!template) {
    throw new Error(`Invalid template "${templateKey}". Supported templates: "hello", "hi", "ek kam hai"`);
  }

  const monthlyLimit = parseInt(process.env.MONTHLY_LIMIT || '800', 10);
  const monthKey = getCurrentMonthKey();
  const recipients = await readRecipientsFromCsv();

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

    // Validate phone digits
    if (!normalized || normalized.length < 7) {
      console.warn(`[Campaign] Skipping invalid phone number: "${recipient.phone}"`);
      failedCount++;
      failedDetails.push({ phone: recipient.phone, error: 'Invalid phone format' });
      continue;
    }

    // 2. Check if already messaged this calendar month
    const alreadySent = await isAlreadySentThisMonth(normalized, monthKey);
    if (alreadySent) {
      alreadySentCount++;
      continue;
    }

    // 3. Hard Cap check
    if (currentMonthTotal >= monthlyLimit) {
      limitReached = true;
      // All remaining unprocessed recipients in CSV are skipped
      const remainingRecipients = recipients.slice(i);
      // Count how many of the remaining ones would have qualified
      skippedDueToLimit = remainingRecipients.filter(r => r.optedIn).length;
      console.warn(
        `[Campaign] Monthly limit reached (${currentMonthTotal}/${monthlyLimit}). Stopped immediately. Skipped ${skippedDueToLimit} remaining recipients.`
      );
      break;
    }

    // 4. Send approved template message
    try {
      await sendTemplateMessage({
        to: normalized,
        templateName: template.name,
        languageCode: template.languageCode
      });

      // Record successful send to log
      currentMonthTotal = await recordSuccessfulSend(normalized, monthKey);
      sentCount++;
      console.log(`[Campaign] Sent successfully to ${normalized} (${currentMonthTotal}/${monthlyLimit})`);
    } catch (err) {
      // 5. Log error and continue with next recipient (failed sends do NOT count toward 800)
      failedCount++;
      failedDetails.push({ phone: normalized, error: err.message });
      console.error(`[Campaign Error] Failed to send to ${normalized}:`, err.message);
    }
  }

  const response = {
    status: limitReached ? 'limit_reached' : 'completed',
    month: monthKey,
    monthlyLimit,
    templateUsed: template.name,
    totalInCsv: recipients.length,
    sent: sentCount,
    alreadySentThisMonth: alreadySentCount,
    skippedOptOut: skippedOptOutCount,
    failed: failedCount,
    skippedDueToLimit,
    currentMonthTotalSent: currentMonthTotal,
    ...(limitReached && {
      message: `Monthly limit of ${monthlyLimit} unique users messaged for ${monthKey} was reached. Outreach stopped immediately; ${skippedDueToLimit} opted-in recipients were skipped.`
    }),
    ...(failedDetails.length > 0 && { failedDetails })
  };

  return response;
}

