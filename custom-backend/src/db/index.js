'use strict';

// ─── db/index.js — PostgreSQL connection pool ────────────────
//
// WHY A POOL (not a single connection)?
//   Express handles requests concurrently. A single DB connection
//   would serialize all queries. A pool keeps N connections open
//   and hands one to each incoming request — much faster.
//
//   We use the 'pg' (node-postgres) library's built-in Pool.

const { Pool } = require('pg');
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Surface connection errors immediately on startup
pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error:', err.message);
  process.exit(1);
});

module.exports = pool;
