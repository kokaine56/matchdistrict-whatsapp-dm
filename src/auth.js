import crypto from 'crypto';

// Hash admin password at startup
const rawPassword = process.env.ADMIN_PASSWORD || '565454';
const adminPasswordHash = crypto.createHash('sha256').update(rawPassword).digest('hex');
const sessionSecret = process.env.SESSION_SECRET || 'wa_admin_secret_key_change_in_env';

export const COOKIE_NAME = 'wa_admin_session';

/**
 * Verify submitted password against startup SHA-256 hash.
 */
export function verifyAdminPassword(candidatePassword) {
  if (!candidatePassword) return false;
  const candidateHash = crypto.createHash('sha256').update(String(candidatePassword)).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(candidateHash, 'hex'), Buffer.from(adminPasswordHash, 'hex'));
  } catch {
    return false;
  }
}

/**
 * Create a signed session token containing timestamp and HMAC signature.
 */
export function createSessionToken() {
  const timestamp = Date.now().toString();
  const signature = crypto
    .createHmac('sha256', sessionSecret)
    .update(timestamp)
    .digest('hex');
  return `${timestamp}.${signature}`;
}

/**
 * Validate session token and check expiration (7 days).
 */
export function isValidSessionToken(token) {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;

  const [timestamp, signature] = parts;
  const expectedSignature = crypto
    .createHmac('sha256', sessionSecret)
    .update(timestamp)
    .digest('hex');

  const sigBuffer = Buffer.from(signature, 'hex');
  const expectedBuffer = Buffer.from(expectedSignature, 'hex');

  if (sigBuffer.length !== expectedBuffer.length) return false;
  if (!crypto.timingSafeEqual(sigBuffer, expectedBuffer)) return false;

  // Session expiry: 7 days
  const age = Date.now() - parseInt(timestamp, 10);
  const maxAge = 7 * 24 * 60 * 60 * 1000;
  return age > 0 && age < maxAge;
}

/**
 * Express middleware to protect admin UI and admin API routes.
 */
export function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];

  if (isValidSessionToken(token)) {
    return next();
  }

  // If API request, return 401 JSON
  if (req.path.startsWith('/api/') || req.headers.accept?.includes('application/json')) {
    return res.status(401).json({ error: 'Unauthorized. Please log in.' });
  }

  // Otherwise redirect browser to login page
  return res.redirect('/login');
}

