'use strict';

// ─── routes/user.js — GET /me ────────────────────────────────
//
// Returns the authenticated user's own profile.
//
// SECURITY NOTE: We identify the user exclusively from req.user.id,
// which was set by the requireAuth middleware from the verified JWT.
// We do NOT read any user ID from the URL or request body —
// those can be manipulated by the client. The JWT's 'sub' claim
// is cryptographically bound to the token, so it's trustworthy.

const express     = require('express');
const db          = require('../db');
const requireAuth = require('../middleware/auth');

const router = express.Router();

// ──────────────────────────────────────────────────────────────
// GET /me
// Header: Authorization: Bearer <token>
// Returns the logged-in user's profile (never another user's).
// ──────────────────────────────────────────────────────────────
router.get('/me', requireAuth, async (req, res) => {
  try {
    // req.user.id comes from the verified JWT (set in middleware/auth.js)
    // — this is the only source of identity we trust.
    const result = await db.query(
      'SELECT id, email, name, created_at FROM users WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      // Extremely unlikely (the token was valid but user was deleted),
      // but handled defensively.
      return res.status(404).json({ error: 'User not found' });
    }

    // We explicitly select only safe columns — password hash is NEVER returned
    return res.status(200).json({ user: result.rows[0] });
  } catch (err) {
    console.error('GET /me error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
