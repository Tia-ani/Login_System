'use strict';

// ─── routes/files.js — /files, /files/:id, /files/:id/download ─
//
// All routes here are protected (require valid JWT).
// The key security principle in this file:
//
//   LIST   → simple WHERE user_id = $1 filter (you only see yours)
//   BY ID  → two-step fetch-then-authorize (explained below)

const express     = require('express');
const path        = require('path');
const fs          = require('fs');
const db          = require('../db');
const requireAuth = require('../middleware/auth');

const router = express.Router();

// ──────────────────────────────────────────────────────────────
// GET /files
// Returns all files belonging to the authenticated user.
//
// WHY simple WHERE user_id filter is correct here:
//   We are not looking up a specific file by ID. We're asking:
//   "give me ALL files I own." A missing row just means the user
//   has no files — there's no ambiguity between "not found" and
//   "forbidden" because we're not requesting a specific resource.
// ──────────────────────────────────────────────────────────────
router.get('/files', requireAuth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, filename, mimetype, size, uploaded_at
       FROM files
       WHERE user_id = $1
       ORDER BY uploaded_at DESC`,
      [req.user.id]
    );

    return res.status(200).json({ files: result.rows });
  } catch (err) {
    console.error('GET /files error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ──────────────────────────────────────────────────────────────
// GET /files/:id
// Returns metadata for a single file.
//
// ⚠️  TWO-STEP FETCH-THEN-AUTHORIZE PATTERN — READ THIS:
//
//   THE WRONG WAY (do NOT do this):
//     SELECT * FROM files WHERE id = $1 AND user_id = $2
//   Problem: if this returns 0 rows, you can't tell whether
//   the file doesn't exist at all, or it exists but belongs
//   to a different user. Both cases look identical. You're
//   forced to return the same status code for both — wrong.
//
//   THE CORRECT TWO-STEP WAY:
//   Step 1 — Fetch by ID only (no ownership filter):
//     SELECT * FROM files WHERE id = $1
//   Step 2 — Inspect the result:
//     • 0 rows      → 404 Not Found  (the file doesn't exist, period)
//     • row found, but row.user_id ≠ req.user.id → 403 Forbidden
//       (the file exists; you just don't own it)
//     • row found, user_id matches  → 200 OK
//
//   This correctly implements HTTP semantics:
//     404 = "this thing does not exist"
//     403 = "this thing exists, but you're not allowed to access it"
// ──────────────────────────────────────────────────────────────
router.get('/files/:id', requireAuth, async (req, res) => {
  try {
    // ── Step 1: Fetch by ID only — no user_id filter ──────────
    const result = await db.query(
      'SELECT * FROM files WHERE id = $1',
      [req.params.id]
    );

    // ── Step 2a: File genuinely does not exist ─────────────────
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }

    const file = result.rows[0];

    // ── Step 2b: File exists but belongs to another user ───────
    if (file.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // ── Step 2c: File exists and user owns it ─────────────────
    return res.status(200).json({
      file: {
        id:          file.id,
        filename:    file.filename,
        mimetype:    file.mimetype,
        size:        file.size,
        uploaded_at: file.uploaded_at,
      }
    });
  } catch (err) {
    console.error('GET /files/:id error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ──────────────────────────────────────────────────────────────
// GET /files/:id/download
// Streams the actual file bytes to the client.
//
// Uses the SAME two-step fetch-then-authorize pattern as above.
// The ownership check must happen before we touch the filesystem.
// ──────────────────────────────────────────────────────────────
router.get('/files/:id/download', requireAuth, async (req, res) => {
  try {
    // ── Step 1: Fetch by ID only ───────────────────────────────
    const result = await db.query(
      'SELECT * FROM files WHERE id = $1',
      [req.params.id]
    );

    // ── Step 2a: Not found ─────────────────────────────────────
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'File not found' });
    }

    const file = result.rows[0];

    // ── Step 2b: Exists but wrong owner ───────────────────────
    if (file.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // ── Step 2c: Authorized — stream the file ─────────────────
    const absolutePath = path.join(__dirname, '../../', file.filepath);

    if (!fs.existsSync(absolutePath)) {
      // File record exists in DB but the file is missing on disk
      // (shouldn't happen in normal operation, but handle it)
      return res.status(500).json({ error: 'File not found on disk' });
    }

    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    res.setHeader('Content-Type', file.mimetype || 'application/octet-stream');

    // fs.createReadStream is non-blocking and memory-efficient —
    // it streams the file in chunks rather than loading it all into RAM.
    const stream = fs.createReadStream(absolutePath);
    stream.pipe(res);
  } catch (err) {
    console.error('GET /files/:id/download error:', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
