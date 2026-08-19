'use strict';

// ─── middleware/auth.js — JWT validation middleware ──────────
//
// This middleware runs BEFORE any protected route handler.
// It does three things in order:
//   1. Extracts the token from the Authorization header
//   2. Verifies the JWT signature (proves it hasn't been tampered with)
//   3. Checks the token_blacklist table (proves it hasn't been logged out)
//
// If all three pass, it attaches req.user = { id, email }
// and calls next() so the route handler can run.
//
// WHY extract identity from the token and not from req.body/params?
//   Request body can be forged. The JWT is cryptographically signed —
//   altering its payload invalidates the signature. So req.user.id
//   is trustworthy; req.body.userId is not.

const jwt = require('jsonwebtoken');
const db  = require('../db');

async function requireAuth(req, res, next) {
  // ── Step 1: Extract token ─────────────────────────────────
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  const token = header.slice(7); // strip "Bearer " prefix

  // ── Step 2: Verify signature and expiry ───────────────────
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    // jwt.verify throws if the token is expired, malformed, or tampered
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  // ── Step 3: Check blacklist (server-side logout) ──────────
  // Even a cryptographically valid token must be rejected if the
  // user has already logged out (their jti is in the blacklist).
  try {
    const blacklisted = await db.query(
      'SELECT 1 FROM token_blacklist WHERE jti = $1',
      [payload.jti]
    );
    if (blacklisted.rows.length > 0) {
      return res.status(401).json({ error: 'Token has been revoked — please log in again' });
    }
  } catch (err) {
    console.error('Blacklist check error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }

  // ── Attach user identity for downstream route handlers ────
  req.user = { id: payload.sub, email: payload.email };
  next();
}

module.exports = requireAuth;
