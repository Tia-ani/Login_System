# Custom Backend — Node/Express + PostgreSQL

Secure authentication REST API using Node.js, Express, and PostgreSQL.
Serves the provided `index.html` test client.

---

## Design Decisions

### JWT vs. Session-Based Authentication

I chose **JWT (JSON Web Token)** over session-based auth for the following reasons:

1. **Stateless by design**: The JWT contains the user's ID and a unique token ID (`jti`). The server doesn't need a session store — it just verifies the cryptographic signature on every request. This is faster (one less DB lookup per request) and simpler to reason about.

2. **Client fit**: The provided `index.html` test client has a dedicated "Token" input field and explicitly sends `Authorization: Bearer <token>`. JWT is the natural fit here.

3. **Explicit tradeoff acknowledged**: Pure JWT can't be revoked — once issued, a token is mathematically valid until expiry. To handle proper server-side logout, I added a `token_blacklist` table. Every logout writes the token's `jti` to this table. Every protected route checks it. This adds one DB read per request but gives genuine logout security rather than just client-side token deletion.

**Why not sessions?** Sessions require a session store (Redis or a DB table), which is stateful infrastructure overhead. For this self-contained task, JWT + blacklist gives the same security guarantee with less complexity.

### How Logout Works Under the Hood

1. Client sends `POST /logout` with the JWT in the `Authorization` header
2. Server verifies the token is valid
3. Server reads the `jti` (unique token ID) from the token payload
4. Server inserts `{ jti, expires_at }` into `token_blacklist`
5. Client token is cleared from the browser (handled by `index.html`)
6. Any subsequent request with that token hits the blacklist check and receives `401`

The `expires_at` field lets us periodically clean up expired entries to keep the blacklist table small.

### How User Data Isolation Is Enforced

- Every file record has a `user_id` foreign key pointing to the owning user
- All protected routes extract the authenticated user's ID **from the verified JWT** — never from the request body or URL params (those can be tampered with)
- **List routes** (`GET /files`): filtered with `WHERE user_id = $1` — the user only sees their own rows
- **Single-resource routes** (`GET /files/:id`, `GET /files/:id/download`): use a **two-step fetch-then-authorize** pattern:
  1. `SELECT * FROM files WHERE id = $1` — fetch by ID with no owner filter
  2. If no row → `404 Not Found` (the file doesn't exist for anyone)
  3. If row found but `row.user_id ≠ jwt.user_id` → `403 Forbidden` (the file exists, but you don't own it)
  4. If match → `200 OK`
  
  This correctly distinguishes "not found" from "forbidden" — a single combined `WHERE id = $1 AND user_id = $2` query cannot do this since both cases return zero rows.

---

## Setup

### Prerequisites
- Node.js 18+
- PostgreSQL 14+

### 1. Clone and install

```bash
cd custom-backend
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env with your PostgreSQL credentials and a strong JWT_SECRET
```

### 3. Create the database

```bash
psql -U postgres -c "CREATE DATABASE osdag_login;"
psql -U postgres -d osdag_login -f src/db/schema.sql
```

### 4. Seed test users and files

```bash
npm run seed
```

This creates 3 users (Alice, Bob, Carol) each with sample files. **UUIDs are printed to the console** after seeding — copy these for testing `/files/:id`.

### 5. Run the server

```bash
npm run dev    # development (auto-restarts on changes)
npm start      # production
```

Server runs on `http://localhost:3000` by default.

### 6. Test with the client

Open `../index.html` with a local server (e.g. VS Code Live Server on port 5500):
- Select **"Custom REST backend"** mode
- Base URL: `http://localhost:3000`
- Click the quick-fill buttons to load seeded credentials

---

## Seeded Test Accounts

| User  | Email               | Password     | Files                    |
|-------|---------------------|--------------|--------------------------|
| Alice | alice@example.com   | Password123! | report.pdf, notes.txt    |
| Bob   | bob@example.com     | Password123! | budget.xlsx, photo.jpg   |
| Carol | carol@example.com   | Password123! | design.pdf               |

---

## API Reference

| Method | Path                  | Auth | Description                                        |
|--------|-----------------------|------|----------------------------------------------------|
| POST   | /register             | ❌    | Register new user (email + password)               |
| POST   | /login                | ❌    | Login, returns JWT token                           |
| POST   | /logout               | ✅    | Blacklists token server-side                       |
| GET    | /me                   | ✅    | Returns logged-in user's profile                   |
| GET    | /files                | ✅    | Lists authenticated user's files                   |
| GET    | /files/:id            | ✅    | Single file metadata (404/403/200)                 |
| GET    | /files/:id/download   | ✅    | Download file (same 404/403/200 ownership logic)   |

---

## What I Would Improve Given More Time

1. **Refresh tokens**: The current 1-hour JWT expiry is a balance — too short and the UX is annoying, too long and stolen tokens are a bigger risk. A refresh token flow (short-lived access token + long-lived refresh token stored httpOnly cookie) would be more robust.
2. **Blacklist cleanup cron job**: Currently expired entries stay in `token_blacklist` forever. A scheduled job to `DELETE WHERE expires_at < NOW()` would keep it lean.
3. **File upload endpoint**: Currently files are seeded. A real `POST /files` upload with multipart form data and file type validation would make it production-ready.
4. **HTTPS enforcement**: Local dev runs HTTP. In production, all traffic must be HTTPS — tokens in transit are otherwise exposed.
5. **Structured logging**: `console.log` is fine for a task submission; a proper logger (Winston/Pino) with log levels would be needed for production.
