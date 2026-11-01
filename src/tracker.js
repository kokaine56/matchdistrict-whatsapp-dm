import { db, addLog } from './database.js';

export function normalizePhone(rawPhone) {
  if (!rawPhone) return '';
  return String(rawPhone).replace(/[^\d]/g, '');
}

export function getCurrentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function monthBounds(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  return [new Date(year, month - 1, 1).toISOString(), new Date(year, month, 1).toISOString()];
}

export async function isAlreadySentThisMonth(phone) {
  return Boolean(db.prepare("SELECT 1 FROM sent_numbers WHERE phone = ? AND status = 'sent'").get(normalizePhone(phone)));
}

export async function getMonthSentCount(monthKey = getCurrentMonthKey()) {
  const [start, end] = monthBounds(monthKey);
  return db.prepare("SELECT COUNT(*) AS count FROM sent_numbers WHERE status = 'sent' AND sent_at >= ? AND sent_at < ?").get(start, end).count;
}

export async function recordSuccessfulSend(phone, monthKey = getCurrentMonthKey(), template = '') {
  const normalized = normalizePhone(phone);
  const sentAt = new Date().toISOString();
  db.prepare(`INSERT INTO sent_numbers(phone, template, status, sent_at, error) VALUES (?, ?, 'sent', ?, NULL)
    ON CONFLICT(phone) DO UPDATE SET template=excluded.template, status='sent', sent_at=excluded.sent_at, error=NULL`).run(normalized, template, sentAt);
  addLog({ phone: String(phone), action: 'sent', details: `Sent${template ? ` · ${template}` : ''}` });
  return getMonthSentCount(monthKey);
}

export function recordFailedSend(phone, template, error) {
  const normalized = normalizePhone(phone);
  if (!normalized) {
    addLog({ phone: String(phone || ''), action: 'failed', details: String(error) });
    return;
  }
  const sentAt = new Date().toISOString();
  db.prepare(`INSERT INTO sent_numbers(phone, template, status, sent_at, error) VALUES (?, ?, 'failed', ?, ?)
    ON CONFLICT(phone) DO UPDATE SET template=excluded.template, status=CASE WHEN sent_numbers.status='sent' THEN 'sent' ELSE 'failed' END, sent_at=CASE WHEN sent_numbers.status='sent' THEN sent_numbers.sent_at ELSE excluded.sent_at END, error=CASE WHEN sent_numbers.status='sent' THEN sent_numbers.error ELSE excluded.error END`).run(normalized, template, sentAt, String(error));
  addLog({ phone: String(phone), action: 'failed', details: String(error) });
}

export function recordSkipped(phone, details) {
  addLog({ phone: String(phone), action: 'skipped', details });
}
