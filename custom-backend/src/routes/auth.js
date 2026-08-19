'use strict';

// ─── routes/auth.js — /register, /login, /logout ────────────

const express  = require('express');
const bcrypt   = require('bcrypt');
const jwt      = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const rateLimit = require('express-rate-limit');
const db        = require('../db');
const requireAuth = require('../middleware/auth');

const router = express.Router();

// ── Rate limiter — applied to POST /login only ────────────────
//
// WHY: Without rate limiting, an attacker can try millions of
// passwords programmatically (brute-force attack). This limiter
// allows 5 failed attempts per IP per 15 minutes, then blocks.
//
// windowMs: 15-minute sliding window
// max: 5 requests per window per IP
// skipSuccessfulRequests: true — only counts FAILED logins
//   (so a legitimate user who logs in successfully doesn't burn
//    their quota and get locked out)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 5,
  skipSuccessfulRequests: true,
  message: {
    error: 'Too many failed login attempts. Please try again in 15 minutes.'
  },
  standardHeaders: true,   // send RateLimit-* headers
  legacyHeaders: false,
});

// ──────────────────────────────────────────────────────────────
// POST /register
// Body: { email, password }
// Creates a new user. Hashes the password with bcrypt before storing.
// ──────────────────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  const { email, password } = req.body;

  // ── Basic input validation ───────────────────────────────
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  try {
    // ── Hash the password ────────────────────────────────────
    // Cost factor 12: bcrypt will perform 2^12 = 4096 iterations.
    // This makes it ~250ms on a modern CPU — fast enough for UX,
    // slow enough that brute-forcing a leaked hash is impractical.
    // bcrypt also auto-generates a unique salt per password,
    // so two users with the same password get different hashes.
    const hash = await bcrypt.hash(password, 12);

    // ── Insert into DB ───────────────────────────────────────
    const result = await db.query(
      'INSERT INTO users (email, password) VALUES ($1, $2) RETURNING id, email, created_at',
      [email.toLowerCase().trim(), hash]
    );

    return res.status(201).json({
      message: 'User registered successfully',
      user: result.rows[0],
    });
  } catch (err) {
    // PostgreSQL error code 23505 = unique_violation (duplicate email)
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Email already registered' });
    }
    console.error('Register error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ──────────────────────────────────────────────────────────────
// POST /login
// Body: { email, password }
// Returns a signed JWT on success.
// ──────────────────────────────────────────────────────────────
router.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    // ── Look up user by email ────────────────────────────────
    const result = await db.query(
      'SELECT * FROM users WHERE email = $1',
      [email.toLowerCase().trim()]
    );

    // ── SECURITY: Generic error message ──────────────────────
    // We deliberately return the SAME error whether the email
    // doesn't exist OR the password is wrong. This prevents
    // "user enumeration" — an attacker probing which emails are
    // registered by comparing error messages.
    const GENERIC_ERROR = 'Invalid email or password';

    if (result.rows.length === 0) {
      // User not found — but we still run bcrypt.compare against a
      // dummy hash to keep response time consistent (timing attacks
      // can reveal whether the user exists based on how fast we respond).
      await bcrypt.compare(password, '$2b$12$invalidhashfortimingnormalization');
      return res.status(401).json({ error: GENERIC_ERROR });
    }

    const user = result.rows[0];

    // ── Compare submitted password against stored hash ────────
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: GENERIC_ERROR });
    }

    // ── Build the JWT ─────────────────────────────────────────
    // sub (subject): the user's UUID — this is what we use as identity
    // jti (JWT ID):  a unique UUID per token — used for the blacklist
    // exp:           set by expiresIn option
    const jti = uuidv4();
    const token = jwt.sign(
      { sub: user.id, email: user.email, jti },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '1h' }
    );

    return res.status(200).json({
      message: 'Login successful',
      token,
    });
  } catch (err) {
    console.error('Login error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ──────────────────────────────────────────────────────────────
// POST /logout
// Header: Authorization: Bearer <token>
// Inserts the token's jti into token_blacklist, invalidating it
// server-side so it can never be used again — even before it expires.
// ──────────────────────────────────────────────────────────────
router.post('/logout', requireAuth, async (req, res) => {
  try {
    // requireAuth already verified the token, so we can safely re-read it
    const header  = req.headers['authorization'];
    const token   = header.slice(7);
    const payload = jwt.decode(token); // decode only — already verified by middleware

    // Insert jti into blacklist with the token's actual expiry time.
    // This means the blacklist entry auto-expires at the same time the
    // token would have expired anyway — safe to clean up afterwards.
    await db.query(
      'INSERT INTO token_blacklist (jti, expires_at) VALUES ($1, to_timestamp($2)) ON CONFLICT DO NOTHING',
      [payload.jti, payload.exp]
    );

    return res.status(200).json({ message: 'Logged out successfully' });
  } catch (err) {
    console.error('Logout error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
