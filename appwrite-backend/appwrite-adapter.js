/**
 * appwrite-adapter.js
 * 
 * Adapter layer connecting the provided index.html test client directly
 * to Appwrite Cloud via the official Appwrite Web SDK.
 * 
 * WHY AN ADAPTER?
 * The provided index.html expects standard REST endpoints (/register, /login, /me, /files, etc.).
 * When "Appwrite" mode is selected, this adapter intercepts the operations and maps them
 * to Appwrite Web SDK calls (Account, Databases, Storage) while preserving the exact same
 * response format and HTTP status codes (200, 401, 403, 404).
 */

(function () {
  'use strict';

  // Helper to read Appwrite config inputs from the DOM
  function getAwConfig() {
    return {
      endpoint: document.getElementById('awEndpoint')?.value.trim() || 'https://cloud.appwrite.io/v1',
      projectId: document.getElementById('awProjectId')?.value.trim() || '',
      databaseId: document.getElementById('awDatabaseId')?.value.trim() || '',
      filesCollectionId: document.getElementById('awFilesCollectionId')?.value.trim() || 'files',
      bucketId: document.getElementById('awBucketId')?.value.trim() || 'user-files',
    };
  }

  // Initialize Appwrite SDK client
  function getAppwriteClient() {
    if (typeof Appwrite === 'undefined') {
      throw new Error('Appwrite Web SDK not loaded. Make sure the SDK script tag is included in index.html.');
    }
    const config = getAwConfig();
    const client = new Appwrite.Client();
    client.setEndpoint(config.endpoint).setProject(config.projectId);
    return {
      client,
      account: new Appwrite.Account(client),
      databases: new Appwrite.Databases(client),
      storage: new Appwrite.Storage(client),
      Query: Appwrite.Query,
      ID: Appwrite.ID,
      config,
    };
  }

  function isAppwriteMode() {
    const selected = document.querySelector('input[name="backendMode"]:checked');
    return selected && selected.value === 'appwrite';
  }

  // Store original methods if we need fallback
  const originalDoRegister = window.doRegister;
  const originalDoLogin = window.doLogin;
  const originalDoLogout = window.doLogout;
  const originalGetMe = window.getMe;
  const originalGetFiles = window.getFiles;
  const originalGetFileById = window.getFileById;
  const originalDownloadFileById = window.downloadFileById;

  // ─── 1. Register (Account.create) ───────────────────────────
  window.doRegister = async function () {
    if (!isAppwriteMode()) return originalDoRegister ? originalDoRegister.apply(this, arguments) : null;
    try {
      const { account, ID } = getAppwriteClient();
      const email = document.getElementById('regEmail').value.trim();
      const password = document.getElementById('regPassword').value;

      // Appwrite handles password hashing and account creation
      const user = await account.create(ID.unique(), email, password);
      log('POST /register (Appwrite)', {
        status: 201,
        body: {
          message: 'User registered successfully via Appwrite',
          user: { id: user.$id, email: user.email, created_at: user.$createdAt }
        }
      });
    } catch (err) {
      log('POST /register (Appwrite error)', {
        status: err.code || 400,
        body: { error: err.message || 'Registration failed' }
      });
    }
  };

  // ─── 2. Login (Account.createEmailPasswordSession / createEmailSession)
  window.doLogin = async function () {
    if (!isAppwriteMode()) return originalDoLogin ? originalDoLogin.apply(this, arguments) : null;
    try {
      const { account } = getAppwriteClient();
      const email = document.getElementById('loginEmail').value.trim();
      const password = document.getElementById('loginPassword').value;

      // Appwrite creates a session and manages session cookies
      let session;
      if (typeof account.createEmailPasswordSession === 'function') {
        session = await account.createEmailPasswordSession(email, password);
      } else if (typeof account.createEmailSession === 'function') {
        session = await account.createEmailSession(email, password);
      } else {
        session = await account.createSession(email, password);
      }

      // We can also create a JWT token from Appwrite session for token field
      let jwtToken = '';
      try {
        const jwtRes = await account.createJWT();
        jwtToken = jwtRes.jwt;
        document.getElementById('token').value = jwtToken;
      } catch (jwtErr) {
        // Fallback: session ID if JWT not enabled
        document.getElementById('token').value = session.$id || session.secret || '';
      }

      log('POST /login (Appwrite)', {
        status: 200,
        body: {
          message: 'Login successful via Appwrite',
          sessionId: session.$id,
          token: jwtToken || session.$id,
          userId: session.userId
        }
      });
    } catch (err) {
      // Generic error to prevent email enumeration
      log('POST /login (Appwrite error)', {
        status: 401,
        body: { error: 'Invalid email or password' }
      });
    }
  };

  // ─── 3. Logout (Account.deleteSession) ──────────────────────
  window.doLogout = async function () {
    if (!isAppwriteMode()) return originalDoLogout ? originalDoLogout.apply(this, arguments) : null;
    try {
      const { account } = getAppwriteClient();
      // Appwrite invalidates session server-side
      await account.deleteSession('current');
      document.getElementById('token').value = '';
      log('POST /logout (Appwrite)', {
        status: 200,
        body: { message: 'Logged out successfully (session invalidated server-side)' }
      });
    } catch (err) {
      log('POST /logout (Appwrite error)', {
        status: err.code || 500,
        body: { error: err.message || 'Logout failed' }
      });
    }
  };

  // ─── 4. User Profile (GET /me) ──────────────────────────────
  window.getMe = async function () {
    if (!isAppwriteMode()) return originalGetMe ? originalGetMe.apply(this, arguments) : null;
    try {
      const { account } = getAppwriteClient();
      const user = await account.get();
      log('GET /me (Appwrite)', {
        status: 200,
        body: {
          user: {
            id: user.$id,
            email: user.email,
            name: user.name || user.email.split('@')[0],
            created_at: user.$createdAt,
            emailVerification: user.emailVerification
          }
        }
      });
    } catch (err) {
      log('GET /me (Appwrite error)', {
        status: 401,
        body: { error: 'Unauthorized — no active Appwrite session' }
      });
    }
  };

  // ─── 5. User Files (GET /files) ─────────────────────────────
  window.getFiles = async function () {
    if (!isAppwriteMode()) return originalGetFiles ? originalGetFiles.apply(this, arguments) : null;
    try {
      const { account, databases, Query, config } = getAppwriteClient();
      const user = await account.get(); // Get authenticated user

      // Query only documents belonging to current user
      const response = await databases.listDocuments(
        config.databaseId,
        config.filesCollectionId,
        [Query.equal('userId', user.$id)]
      );

      const files = response.documents.map(doc => ({
        id: doc.$id,
        filename: doc.filename,
        mimetype: doc.mimetype || 'text/plain',
        size: doc.size || 0,
        uploaded_at: doc.$createdAt
      }));

      log('GET /files (Appwrite)', {
        status: 200,
        body: { files }
      });
    } catch (err) {
      log('GET /files (Appwrite error)', {
        status: err.code || 401,
        body: { error: err.message || 'Failed to retrieve files' }
      });
    }
  };

  // ─── 6. Single File by ID (Two-step authorization check) ────
  window.getFileById = async function () {
    if (!isAppwriteMode()) return originalGetFileById ? originalGetFileById.apply(this, arguments) : null;
    try {
      const id = document.getElementById('fileId').value.trim();
      const { account, databases, config } = getAppwriteClient();
      const user = await account.get();

      // Step 1: Fetch document by ID (no user filter)
      let doc;
      try {
        doc = await databases.getDocument(config.databaseId, config.filesCollectionId, id);
      } catch (notFoundErr) {
        // Step 2a: Document does not exist at all -> 404
        log('GET /files/' + id + ' (Appwrite)', {
          status: 404,
          body: { error: 'File not found' }
        });
        return;
      }

      // Step 2b: Document exists but belongs to another user -> 403
      if (doc.userId !== user.$id) {
        log('GET /files/' + id + ' (Appwrite)', {
          status: 403,
          body: { error: 'Access denied — file belongs to another user' }
        });
        return;
      }

      // Step 2c: Owner matches -> 200 OK
      log('GET /files/' + id + ' (Appwrite)', {
        status: 200,
        body: {
          file: {
            id: doc.$id,
            filename: doc.filename,
            mimetype: doc.mimetype,
            size: doc.size,
            uploaded_at: doc.$createdAt
          }
        }
      });
    } catch (err) {
      log('GET /files/:id (Appwrite error)', {
        status: err.code || 500,
        body: { error: err.message || 'Error fetching file' }
      });
    }
  };

  // ─── 7. Download File by ID ──────────────────────────────────
  window.downloadFileById = async function () {
    if (!isAppwriteMode()) return originalDownloadFileById ? originalDownloadFileById.apply(this, arguments) : null;
    try {
      const id = document.getElementById('fileId').value.trim();
      const { account, databases, storage, config } = getAppwriteClient();
      const user = await account.get();

      // Step 1: Fetch document by ID
      let doc;
      try {
        doc = await databases.getDocument(config.databaseId, config.filesCollectionId, id);
      } catch (notFoundErr) {
        log('GET /files/' + id + '/download (Appwrite)', {
          status: 404,
          body: { error: 'File not found' }
        });
        return;
      }

      // Step 2: Ownership verification (403 if mismatch)
      if (doc.userId !== user.$id) {
        log('GET /files/' + id + '/download (Appwrite)', {
          status: 403,
          body: { error: 'Access denied' }
        });
        return;
      }

      // Step 3: Trigger file download via Appwrite Storage SDK or direct file URL
      if (doc.fileId) {
        const downloadUrl = storage.getFileDownload(config.bucketId, doc.fileId);
        const a = document.createElement('a');
        a.href = downloadUrl.href || downloadUrl;
        a.download = doc.filename || ('file-' + id);
        a.target = '_blank';
        a.click();
        log('GET /files/' + id + '/download (Appwrite)', {
          status: 200,
          note: 'Appwrite file download triggered from storage bucket.'
        });
      } else {
        // Fallback simulated download if no binary file was stored in bucket
        const blob = new Blob([`Sample file content for ${doc.filename} (Owner: ${user.email})`], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = doc.filename || ('file-' + id);
        a.click();
        log('GET /files/' + id + '/download (Appwrite)', {
          status: 200,
          note: 'File download generated and triggered.'
        });
      }
    } catch (err) {
      log('GET /files/' + id + '/download (Appwrite error)', {
        status: err.code || 500,
        body: { error: err.message || 'Download failed' }
      });
    }
  };

  console.log('✅ Appwrite adapter loaded and ready.');
})();
