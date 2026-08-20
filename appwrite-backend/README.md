# Appwrite Backend — Managed BaaS Implementation

This folder contains the **Appwrite managed backend** implementation for the FOSSEE Osdag Login System screening task.

Instead of running a custom Express/PostgreSQL server, this version uses **Appwrite Cloud** as a Backend-as-a-Service (BaaS) and connects directly to it from the browser via the official Appwrite Web SDK and [`appwrite-adapter.js`](./appwrite-adapter.js).

---

## 🧠 Key Questions & Interview Explanations

### 1. What Appwrite Handled Automatically vs. What Was Configured Manually

| Feature | Handled Automatically by Appwrite | Configured by Us |
| :--- | :--- | :--- |
| **User Authentication** | Password hashing (Argon2/bcrypt), email verification state, user account creation (`Account.create`), session lifecycle | Account fields and client-side registration workflow |
| **Session Management** | HTTP-only session cookies, server-side session invalidation on logout (`Account.deleteSession`), JWT generation (`Account.createJWT`) | Passing and validating session state |
| **Brute-Force & Rate Limiting** | Built-in abuse protection and IP rate limiting on login/registration | Platform whitelist (`localhost` Web platform in Appwrite Console) |
| **File Storage & Serving** | Binary file storage, chunked uploads, virus scanning, antivirus checks, CDN distribution | Storage Bucket (`user-files`) and access permissions |
| **Database & Schema** | Document indexing, query optimization, filtering APIs | Database creation, Collection creation (`files`), Attributes (`userId`, `filename`, `fileId`, `size`, `mimetype`), and Collection RBAC permissions |
| **Data Isolation** | Permission checks at query level | Designing queries (`Query.equal('userId', currentUser.$id)`) and implementing two-step fetch-then-authorize logic in the adapter |

---

### 2. How User Data Isolation Is Enforced

1. **Authentication verification**: The Appwrite Web SDK authenticates the active user session via cookies or JWT tokens.
2. **List queries (`GET /files`)**: Enforced at query time using `Query.equal('userId', currentUser.$id)`. The user only receives documents containing their own user ID.
3. **Single document queries (`GET /files/:id`)**: The adapter applies the **two-step fetch-then-authorize** pattern:
   - **Step 1**: Fetch document by ID (`databases.getDocument`). If Appwrite returns 404 or throws a not-found exception $\rightarrow$ Return **404 Not Found**.
   - **Step 2**: Inspect `document.userId`. If it does not match the active `currentUser.$id` $\rightarrow$ Return **403 Forbidden**.
   - **Step 3**: If owner matches $\rightarrow$ Return **200 OK**.

---

## 🛠️ Appwrite Setup Guide

### 1. Web Platform (CORS Setup)
1. Go to Appwrite Console $\rightarrow$ **Settings** $\rightarrow$ **Platforms** $\rightarrow$ **Add Platform** $\rightarrow$ **Web App**.
2. Set Name: `Osdag Client`
3. Set Hostname: `localhost` (and/or `127.0.0.1`).

### 2. Database & Collection
1. Go to **Databases** $\rightarrow$ Create Database (e.g. `Osdag DB`).
2. Inside the database, create a collection with ID `files`.
3. Add the following **Attributes**:
   - `userId` (String, size 255, required)
   - `filename` (String, size 255, required)
   - `fileId` (String, size 255, optional)
   - `size` (Integer, optional)
   - `mimetype` (String, size 100, optional)
4. Under Collection **Settings** $\rightarrow$ **Permissions**, grant `Users` (all authenticated users) **Read, Create, Update, Delete** permissions.

### 3. Storage Bucket
1. Go to **Storage** $\rightarrow$ Create Bucket with ID `user-files`.
2. Under Bucket **Settings** $\rightarrow$ **Permissions**, grant `Users` **Read** and **Create** permissions.

---

## 🧪 Testing with `index.html`

1. Open `index.html` in your browser (via VS Code Live Server on `http://localhost:5500`).
2. Select **"Appwrite"** mode radio button.
3. Fill in your Appwrite credentials:
   - **Endpoint**: `https://cloud.appwrite.io/v1`
   - **Project ID**: `YOUR_PROJECT_ID`
   - **Database ID**: `YOUR_DATABASE_ID`
   - **Files collection ID**: `files`
   - **Storage bucket ID**: `user-files`
4. Test:
   - **Register** / **Login** with test accounts.
   - Click **GET /me** to view your profile.
   - Click **GET /files** to list files.
   - Test **GET /files/:id** and **Download**.
   - Click **Logout** to verify session revocation.
