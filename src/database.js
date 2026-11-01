import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = path.resolve(__dirname, '../data');
export const DATABASE_PATH = path.join(DATA_DIR, 'outreach.db');
const LEGACY_LOG_PATH = path.resolve(__dirname, '../sent-log.json');
fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new Database(DATABASE_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`
  CREATE TABLE IF NOT EXISTS sent_numbers (
    phone TEXT NOT NULL UNIQUE,
    template TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL CHECK (status IN ('sent', 'failed')),
    sent_at TEXT NOT NULL,
    error TEXT,
    message_id TEXT
  );
  CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    phone TEXT NOT NULL DEFAULT '',
    action TEXT NOT NULL CHECK (action IN ('accepted', 'sent', 'delivered', 'read', 'failed', 'skipped', 'reply_received', 'reply_sent', 'webhook', 'signature_mismatch', 'import', 'export')),
    details TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS message_statuses (message_id TEXT PRIMARY KEY, phone TEXT NOT NULL DEFAULT '', status TEXT NOT NULL, details TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS outbound_messages (message_id TEXT PRIMARY KEY, phone TEXT NOT NULL, message_type TEXT NOT NULL DEFAULT '', sent_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'accepted', failure_reason TEXT);
  CREATE INDEX IF NOT EXISTS logs_timestamp_idx ON logs(timestamp DESC);
  CREATE INDEX IF NOT EXISTS sent_numbers_month_idx ON sent_numbers(status, sent_at);
`);

const logsSchema = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='logs'").get()?.sql || '';
if (!logsSchema.includes("'accepted'") || !logsSchema.includes("'delivered'")) {
  db.exec('DROP INDEX IF EXISTS logs_timestamp_idx');
  const migrateLogs = db.transaction(() => {
    db.exec('ALTER TABLE logs RENAME TO logs_legacy');
    db.exec(`CREATE TABLE logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      action TEXT NOT NULL CHECK (action IN ('accepted', 'sent', 'delivered', 'read', 'failed', 'skipped', 'reply_received', 'reply_sent', 'webhook', 'signature_mismatch', 'import', 'export')),
      details TEXT NOT NULL DEFAULT ''
    )`);
    db.exec('INSERT INTO logs(id, timestamp, phone, action, details) SELECT id, timestamp, phone, action, details FROM logs_legacy');
    db.exec('DROP TABLE logs_legacy');
    db.exec('CREATE INDEX logs_timestamp_idx ON logs(timestamp DESC)');
  });
  migrateLogs();
}

// Additive migration for existing databases.
const sentColumns = new Set(db.prepare('PRAGMA table_info(sent_numbers)').all().map(row => row.name));
if (!sentColumns.has('message_id')) db.exec('ALTER TABLE sent_numbers ADD COLUMN message_id TEXT');

const migrated = db.prepare("SELECT value FROM app_meta WHERE key = 'sent_log_json_migrated'").get();
if (!migrated && fs.existsSync(LEGACY_LOG_PATH)) {
  try {
    const legacy = JSON.parse(fs.readFileSync(LEGACY_LOG_PATH, 'utf8') || '{}');
    const insert = db.prepare(`INSERT INTO sent_numbers(phone, template, status, sent_at, error) VALUES (?, '', 'sent', ?, NULL)
      ON CONFLICT(phone) DO UPDATE SET sent_at=CASE WHEN excluded.sent_at < sent_numbers.sent_at THEN excluded.sent_at ELSE sent_numbers.sent_at END`);
    const transaction = db.transaction(() => {
      for (const [month, phones] of Object.entries(legacy)) {
        if (!/^\d{4}-\d{2}$/.test(month) || !Array.isArray(phones)) continue;
        const sentAt = new Date(`${month}-01T00:00:00.000Z`).toISOString();
        for (const phone of phones) {
          const normalized = String(phone).replace(/\D/g, '');
          if (normalized) insert.run(normalized, sentAt);
        }
      }
      db.prepare("INSERT OR REPLACE INTO app_meta(key, value) VALUES ('sent_log_json_migrated', ?)").run(new Date().toISOString());
    });
    transaction();
  } catch (error) { console.error('[SQLite migration] Could not migrate sent-log.json:', error.message); }
} else if (!migrated) {
  db.prepare("INSERT OR REPLACE INTO app_meta(key, value) VALUES ('sent_log_json_migrated', ?)").run(new Date().toISOString());
}

export const logEvents = new EventEmitter();
export function recordOutboundMessage({ phone, messageId, messageType = '' }) {
  if (!phone || !messageId) throw new Error('A phone number and Meta message ID are required to record a send.');
  const priorStatus = db.prepare('SELECT status, details FROM message_statuses WHERE message_id=?').get(String(messageId));
  db.prepare(`INSERT INTO outbound_messages(message_id, phone, message_type, sent_at, status, failure_reason) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(message_id) DO NOTHING`).run(String(messageId), String(phone).replace(/\D/g, ''), String(messageType), new Date().toISOString(), priorStatus?.status || 'accepted', priorStatus?.status === 'failed' ? priorStatus.details : null);
}
export function updateLogForMessageStatus(messageId, action, details) {
  const marker = `Meta message ID: ${String(messageId)}`;
  return db.prepare(`UPDATE logs SET action=?, details=? WHERE id=(SELECT id FROM logs WHERE instr(details, ?) > 0 ORDER BY id DESC LIMIT 1)`).run(action, details, marker).changes;
}
export function addLog({ phone = '', action, details = '' }) {
  const timestamp = new Date().toISOString();
  const result = db.prepare('INSERT INTO logs(timestamp, phone, action, details) VALUES (?, ?, ?, ?)').run(timestamp, String(phone || ''), action, String(details || ''));
  const row = { id: Number(result.lastInsertRowid), timestamp, phone: String(phone || ''), action, details: String(details || '') };
  logEvents.emit('log', row);
  return row;
}

export function getRecentLogs(limit = 200) {
  return db.prepare('SELECT id, timestamp, phone, action, details FROM logs ORDER BY id DESC LIMIT ?').all(Math.min(Math.max(Number(limit) || 200, 1), 1000));
}
