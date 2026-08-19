# Login_System — FOSSEE Osdag Screening Task

Secure login system built twice: once with a **custom Node/Express + PostgreSQL backend**, and once with **Appwrite** as a managed backend. Both serve the same provided `index.html` test client.

---

## Quick Start (Custom Backend)

```bash
cd custom-backend
npm install
cp .env.example .env        # edit with your PostgreSQL credentials
psql -d postgres -c "CREATE DATABASE osdag_login;"
psql -d osdag_login -f src/db/schema.sql
npm run seed                # prints seeded UUIDs — copy them for testing
npm start                   # runs on http://localhost:3000
```

Open `index.html` with VS Code Live Server (port 5500), select **Custom REST backend**.

---

## Seeded Test Accounts

All passwords: `Password123!`

| User  | Email             | File UUIDs (copy for `/files/:id` testing)                              |
|-------|-------------------|-------------------------------------------------------------------------|
| Alice | alice@example.com | `8a4620cd-964c-4f47-8ce9-1c2e78f98864` (report.pdf), `c009d6b9-7f21-4026-8ecb-59626cf7b996` (notes.txt) |
| Bob   | bob@example.com   | `95cf3755-05a2-4edf-953b-69fd1c6d3f5f` (budget.txt), `7308723c-085e-453f-94f2-d854a39a7792` (photo-description.txt) |
| Carol | carol@example.com | `fc96dd2d-b679-4875-89e3-28b8f81ba3f4` (design.txt)                    |

> **Note**: IDs are UUIDs, not integers. Typing `1` in the File ID field returns `404` — that is correct behaviour.

---

## Verified Security Behaviours

| Test | Expected | Result |
|------|----------|--------|
| Alice fetches her own file | `200 OK` | ✅ |
| Alice fetches Bob's file (exists, wrong owner) | `403 Forbidden` | ✅ |
| Alice fetches made-up UUID (doesn't exist) | `404 Not Found` | ✅ |
| Request without token | `401 Unauthorized` | ✅ |
| Wrong password (generic error) | `"Invalid email or password"` | ✅ |

---

## Repository Structure

- [`custom-backend/`](./custom-backend/README.md) — Node/Express + PostgreSQL
- [`appwrite-backend/`](./appwrite-backend/README.md) — Appwrite managed backend

Full design decisions (JWT vs sessions, logout mechanics, data isolation) are in each backend's README.
