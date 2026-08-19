'use strict';

// ─── src/index.js — Express app entry point ──────────────────

require('dotenv').config();
const express = require('express');
const cors    = require('cors');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const fileRoutes = require('./routes/files');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────────

// CORS: allow the provided index.html test client (served on port 5500
// by VS Code Live Server) to make cross-origin requests to this API.
// exposedHeaders allows the browser JS to read the Authorization header.
app.use(cors({
  origin: ['http://localhost:5500', 'http://127.0.0.1:5500', 'http://localhost:5173'],
  credentials: true,
}));

// Parse JSON request bodies
app.use(express.json());

// ── Routes ────────────────────────────────────────────────────
app.use('/', authRoutes);   // POST /register, /login, /logout
app.use('/', userRoutes);   // GET  /me
app.use('/', fileRoutes);   // GET  /files, /files/:id, /files/:id/download

// ── Health check ──────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// ── 404 catch-all ─────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: 'Route not found' }));

// ── Start server ──────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ Custom backend running at http://localhost:${PORT}`);
  console.log(`   Test client: open ../index.html with Live Server (port 5500)`);
});
