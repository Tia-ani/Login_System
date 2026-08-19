-- ============================================================
-- schema.sql — Database schema for Osdag Login System
-- Run: psql -U postgres -d osdag_login -f src/db/schema.sql
-- ============================================================

-- Enable pgcrypto so gen_random_uuid() works
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── users ───────────────────────────────────────────────────
-- Stores registered users.
-- Passwords are stored as bcrypt hashes — NEVER plaintext.
CREATE TABLE IF NOT EXISTS users (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT        UNIQUE NOT NULL,
  password   TEXT        NOT NULL,          -- bcrypt hash (cost 12)
  name       TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── files ───────────────────────────────────────────────────
-- Each file belongs to exactly one user (user_id FK).
-- This foreign key is the foundation of data isolation:
-- all file queries are scoped by user_id.
CREATE TABLE IF NOT EXISTS files (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename    TEXT        NOT NULL,
  filepath    TEXT        NOT NULL,          -- relative path on disk (under uploads/)
  mimetype    TEXT,
  size        INTEGER,
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── token_blacklist ─────────────────────────────────────────
-- Why this table exists:
--   JWTs are stateless — once signed, they're valid until expiry.
--   To implement TRUE server-side logout, we track revoked token IDs
--   (the 'jti' claim, a UUID assigned when the token is created).
--   On logout, the jti is inserted here. Protected routes check this
--   table and reject any blacklisted token with 401.
-- 
--   The expires_at column lets us clean up stale entries:
--   DELETE FROM token_blacklist WHERE expires_at < NOW();
CREATE TABLE IF NOT EXISTS token_blacklist (
  jti        TEXT        PRIMARY KEY,       -- matches the 'jti' claim in the JWT
  expires_at TIMESTAMPTZ NOT NULL
);
