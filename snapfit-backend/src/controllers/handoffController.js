const fs = require('fs/promises');
const { createSession, getSession, isExpired, attachPhoto, consumeSession, SESSION_TTL_MS } = require('../services/handoffStore');

// Desktop side (x-api-key auth, same as recommend/try-on) --------------------

function createHandoffSession(req, res) {
  const sessionId = createSession(req.merchant._id);
  return res.status(201).json({ sessionId, expiresInMs: SESSION_TTL_MS });
}

function getHandoffStatus(req, res) {
  const session = getSession(req.params.sessionId);
  if (!session || String(session.merchantId) !== String(req.merchant._id)) {
    return res.status(404).json({ status: 'not_found' });
  }
  if (isExpired(session)) {
    return res.status(200).json({ status: 'expired' });
  }
  return res.status(200).json({ status: session.status });
}

async function getHandoffPhoto(req, res) {
  const session = getSession(req.params.sessionId);
  if (!session || String(session.merchantId) !== String(req.merchant._id)) {
    return res.status(404).json({ message: 'Handoff session not found' });
  }
  if (isExpired(session) || session.status !== 'ready' || !session.filePath) {
    return res.status(404).json({ message: 'No photo is ready for this session yet' });
  }

  try {
    const buffer = await fs.readFile(session.filePath);
    res.setHeader('Content-Type', session.mimeType || 'image/jpeg');
    res.status(200).send(buffer);
  } catch {
    return res.status(404).json({ message: 'The captured photo could not be read' });
  } finally {
    // Single-use: once the desktop has retrieved the photo (or tried to), the
    // handoff session is done with.
    await consumeSession(req.params.sessionId);
  }
}

// Phone side (unauthenticated -- the random sessionId itself is the capability,
// scanned from a QR code the desktop generated moments earlier) --------------

function uploadHandoffPhoto(req, res) {
  const session = getSession(req.params.sessionId);
  if (!session) {
    return res.status(404).json({ message: 'This QR code has expired. Please refresh it and scan again.' });
  }
  if (isExpired(session)) {
    return res.status(410).json({ message: 'This QR code has expired. Please refresh it and scan again.' });
  }
  if (!req.file) {
    return res.status(400).json({ message: 'An image file is required' });
  }

  attachPhoto(req.params.sessionId, req.file.path, req.file.mimetype);
  return res.status(200).json({ message: 'Photo sent — you can return to your computer.' });
}

module.exports = { createHandoffSession, getHandoffStatus, getHandoffPhoto, uploadHandoffPhoto };
