const crypto = require('crypto');
const fs = require('fs/promises');

const SESSION_TTL_MS = 5 * 60 * 1000;
const SWEEP_INTERVAL_MS = 60 * 1000;

// In-memory only -- these are short-lived, single-use handoffs (a shopper scans a
// QR code, takes one photo on their phone, the desktop picks it up seconds later).
// No merchant data or history needs to survive a restart, so this avoids adding a
// Mongo collection/TTL index for something this ephemeral.
const sessions = new Map();

function createSession(merchantId) {
  const sessionId = crypto.randomBytes(24).toString('hex');
  sessions.set(sessionId, {
    merchantId: String(merchantId),
    status: 'pending',
    filePath: null,
    mimeType: null,
    createdAt: Date.now(),
  });
  return sessionId;
}

function getSession(sessionId) {
  return sessions.get(sessionId) || null;
}

function isExpired(session) {
  return Date.now() - session.createdAt > SESSION_TTL_MS;
}

function attachPhoto(sessionId, filePath, mimeType) {
  const session = sessions.get(sessionId);
  if (!session) return false;
  session.status = 'ready';
  session.filePath = filePath;
  session.mimeType = mimeType;
  return true;
}

async function consumeSession(sessionId) {
  const session = sessions.get(sessionId);
  sessions.delete(sessionId);
  if (session?.filePath) {
    await fs.unlink(session.filePath).catch(() => {});
  }
}

async function sweepExpiredSessions() {
  const now = Date.now();
  for (const [sessionId, session] of sessions.entries()) {
    if (now - session.createdAt > SESSION_TTL_MS) {
      sessions.delete(sessionId);
      if (session.filePath) {
        await fs.unlink(session.filePath).catch(() => {});
      }
    }
  }
}

setInterval(sweepExpiredSessions, SWEEP_INTERVAL_MS).unref();

module.exports = { createSession, getSession, isExpired, attachPhoto, consumeSession, SESSION_TTL_MS };
