import { db, addLog, recordOutboundMessage } from './database.js';

export function normalizePhone(rawPhone) {
  if (!rawPhone) return '';
  return String(rawPhone).replace(/[^\d]/g, '');
}

export function getCurrentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function getMonthlyLimit() {
  const value = Number.parseInt(String(process.env.MONTHLY_LIMIT || '').trim(), 10);
  return Number.isFinite(value) && value > 0 ? value : 800;
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

export async function recordSuccessfulSend(phone, monthKey = getCurrentMonthKey(), template = '', messageId = '') {
  if (!messageId) throw new Error('Meta did not return a message ID; this number was not marked as sent.');
  const normalized = normalizePhone(phone);
  const sentAt = new Date().toISOString();
  db.prepare(`INSERT INTO sent_numbers(phone, template, status, sent_at, error, message_id) VALUES (?, ?, 'sent', ?, NULL, ?)
    ON CONFLICT(phone) DO UPDATE SET template=excluded.template, status='sent', sent_at=excluded.sent_at, error=NULL, message_id=excluded.message_id`).run(normalized, template, sentAt, messageId);
  recordOutboundMessage({ phone: normalized, messageId, messageType: template });
  const receivedStatus = db.prepare('SELECT status, details FROM message_statuses WHERE message_id=?').get(String(messageId));
  const logAction = receivedStatus && ['sent', 'delivered', 'read', 'failed'].includes(receivedStatus.status) ? receivedStatus.status : 'accepted';
  const logDetails = receivedStatus?.details || `Accepted by Meta${template ? ` · ${template}` : ''} · Meta message ID: ${messageId}`;
  addLog({ phone: String(phone), action: logAction, details: logDetails });
  return getMonthSentCount(monthKey);
}

export function getMessageStatusCounts(messageIds = []) {
  const ids = [...new Set(messageIds.map(String).filter(Boolean))];
  const counts = { delivered: 0, read: 0, failed: 0 };
  if (!ids.length) return counts;
  const rows = db.prepare(`SELECT status, COUNT(*) AS count FROM message_statuses WHERE message_id IN (${ids.map(() => '?').join(',')}) GROUP BY status`).all(...ids);
  for (const row of rows) if (row.status in counts) counts[row.status] = row.count;
  return counts;
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
