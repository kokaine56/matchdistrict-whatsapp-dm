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
    error TEXT
  );
  CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL,
    phone TEXT NOT NULL DEFAULT '',
    action TEXT NOT NULL CHECK (action IN ('sent', 'failed', 'skipped', 'reply_sent', 'import', 'export')),
    details TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS logs_timestamp_idx ON logs(timestamp DESC);
  CREATE INDEX IF NOT EXISTS sent_numbers_month_idx ON sent_numbers(status, sent_at);
`);

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
