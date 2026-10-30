import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOG_FILE = path.resolve(__dirname, '../sent-log.json');

/**
 * Standardize phone number by removing +, spaces, hyphens, and parentheses.
 * Meta Cloud API expects digits with country code (e.g. 15551234567).
 */
export function normalizePhone(rawPhone) {
  if (!rawPhone) return '';
  return String(rawPhone).replace(/[^\d]/g, '');
}

/**
 * Returns the current calendar month key in YYYY-MM format (e.g. "2026-10").
 */
export function getCurrentMonthKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Load the sent-log data from disk.
 */
async function loadSentLog() {
  try {
    const data = await fs.readFile(LOG_FILE, 'utf-8');
    return JSON.parse(data || '{}');
  } catch (err) {
    if (err.code === 'ENOENT') {
      return {};
    }
    console.error(`Error reading ${LOG_FILE}:`, err.message);
    return {};
  }
}

/**
 * Save sent-log data to disk.
 */
async function saveSentLog(log) {
  await fs.writeFile(LOG_FILE, JSON.stringify(log, null, 2), 'utf-8');
}

/**
 * Check if a number was already messaged in the given month.
 */
export async function isAlreadySentThisMonth(phone, monthKey = getCurrentMonthKey()) {
  const normalized = normalizePhone(phone);
  const log = await loadSentLog();
  const sentNumbers = log[monthKey] || [];
  return sentNumbers.includes(normalized);
}

/**
 * Get the count of unique users messaged in the given month.
 */
export async function getMonthSentCount(monthKey = getCurrentMonthKey()) {
  const log = await loadSentLog();
  return (log[monthKey] || []).length;
}

/**
 * Record a successfully sent message to a phone number.
 * Ensures numbers are only added once per month.
 */
export async function recordSuccessfulSend(phone, monthKey = getCurrentMonthKey()) {
  const normalized = normalizePhone(phone);
  const log = await loadSentLog();

  if (!log[monthKey]) {
    log[monthKey] = [];
  }

  if (!log[monthKey].includes(normalized)) {
    log[monthKey].push(normalized);
    await saveSentLog(log);
  }

  return log[monthKey].length;
}

