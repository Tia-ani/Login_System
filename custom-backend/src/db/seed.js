'use strict';

// ─── db/seed.js — Seeds 3 test users and their files ─────────
//
// Run: npm run seed   (or: node src/db/seed.js)
//
// This script:
//   1. Creates 3 users (Alice, Bob, Carol) with bcrypt-hashed passwords
//   2. Creates sample files on disk (in uploads/<user>/)
//   3. Inserts file records into the DB linked to each user
//   4. Prints all seeded UUIDs to the console
//
// IMPORTANT: UUIDs are printed after seeding. Copy them from the
// console output when testing GET /files/:id — do NOT use integers.

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const bcrypt = require('bcrypt');
const path   = require('path');
const fs     = require('fs');
const db     = require('./index');

// ── Seed users ────────────────────────────────────────────────
const USERS = [
  { email: 'alice@example.com', password: 'Password123!', name: 'Alice' },
  { email: 'bob@example.com',   password: 'Password123!', name: 'Bob'   },
  { email: 'carol@example.com', password: 'Password123!', name: 'Carol' },
];

// ── Sample file content per user ─────────────────────────────
const FILES = {
  'alice@example.com': [
    {
      filename: 'report.pdf',
      mimetype: 'application/pdf',
      content: `Osdag Structural Report
=======================
Date: ${new Date().toDateString()}
Author: Alice

This is a sample PDF report associated with Alice's account.
It is used to demonstrate the file-access API endpoints.

Section 1: Introduction
The Osdag Login System provides secure, per-user file storage.
Each file is bound to a user_id foreign key in the database.

Section 2: Data Isolation
GET /files returns only Alice's files.
GET /files/:id returns 403 if you request Bob's file ID while logged in as Alice.
GET /files/:id returns 404 if the file ID does not exist at all.
`,
    },
    {
      filename: 'notes.txt',
      mimetype: 'text/plain',
      content: `Alice's Notes
=============
- Review Osdag bridge module
- Submit screening task by deadline
- JWT is stateless; blacklist table handles logout
- Two-step fetch-then-authorize for /files/:id
`,
    },
  ],
  'bob@example.com': [
    {
      filename: 'budget.txt',
      mimetype: 'text/plain',
      content: `Bob's Project Budget
====================
Item          | Cost (INR)
--------------|-----------
Server        | 12,000
Licenses      | 5,000
Miscellaneous | 2,500
--------------|-----------
Total         | 19,500

Note: This file belongs to Bob. Accessing it while logged in as
Alice or Carol must return HTTP 403 Forbidden.
`,
    },
    {
      filename: 'photo-description.txt',
      mimetype: 'text/plain',
      content: `Bob's Photo Description
=======================
Filename: project-site.jpg
Location: IIT Bombay campus
Description: Site photo for the structural assessment project.

(Actual binary image replaced with this text file for portability.)
`,
    },
  ],
  'carol@example.com': [
    {
      filename: 'design.txt',
      mimetype: 'text/plain',
      content: `Carol's Design Notes
====================
Project: Osdag Bridge Substructure
Status: Draft

Key Design Parameters:
- Span: 25m
- Load class: IRC Class A
- Material: IS 2062 Grade E250

This file belongs exclusively to Carol.
Attempting to download it as Alice or Bob must return 403.
`,
    },
  ],
};

async function seed() {
  console.log('\n🌱 Starting seed...\n');

  // ── Clear existing data (re-runnable) ─────────────────────
  await db.query('DELETE FROM token_blacklist');
  await db.query('DELETE FROM files');
  await db.query('DELETE FROM users');
  console.log('🗑️  Cleared existing users, files, and blacklist\n');

  for (const userData of USERS) {
    // ── Hash password ────────────────────────────────────────
    const hash = await bcrypt.hash(userData.password, 12);

    // ── Insert user ──────────────────────────────────────────
    const userResult = await db.query(
      'INSERT INTO users (email, password, name) VALUES ($1, $2, $3) RETURNING id, email, name',
      [userData.email, hash, userData.name]
    );
    const user = userResult.rows[0];
    console.log(`👤 Created user: ${user.name} <${user.email}>`);
    console.log(`   User ID: ${user.id}`);

    // ── Create uploads directory for this user ───────────────
    const userDir = path.join(__dirname, '../../uploads', userData.name.toLowerCase());
    fs.mkdirSync(userDir, { recursive: true });

    // ── Create each sample file ──────────────────────────────
    for (const fileData of FILES[userData.email]) {
      const filePath = path.join(userDir, fileData.filename);
      fs.writeFileSync(filePath, fileData.content, 'utf-8');

      const relPath = path.join('uploads', userData.name.toLowerCase(), fileData.filename);
      const size    = Buffer.byteLength(fileData.content, 'utf-8');

      const fileResult = await db.query(
        `INSERT INTO files (user_id, filename, filepath, mimetype, size)
         VALUES ($1, $2, $3, $4, $5) RETURNING id, filename`,
        [user.id, fileData.filename, relPath, fileData.mimetype, size]
      );

      const file = fileResult.rows[0];
      console.log(`   📄 File: ${file.filename}`);
      console.log(`      File ID (UUID): ${file.id}`);
    }

    console.log();
  }

  console.log('━'.repeat(60));
  console.log('✅ Seed complete!\n');
  console.log('Test credentials (all passwords: Password123!)');
  console.log('  alice@example.com | bob@example.com | carol@example.com\n');
  console.log('⚠️  Copy File IDs (UUIDs) from above — not integers!');
  console.log('   Type "1" in the File ID field and you will get 404.');
  console.log('   That is correct — IDs are UUIDs, not sequential numbers.\n');

  await db.end();
}

seed().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
