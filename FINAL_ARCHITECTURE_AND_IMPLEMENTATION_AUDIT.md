# AssistIQ: Final Architecture and Implementation Audit

**Date:** 2026-10-04  
**Project:** AssistIQ (AI-Powered Customer Support Application)  
**Audit Scope:** Full repository source code inspection across React Frontend, Node.js/Express Backend, Python FastAPI RAG Service, Docker Containers (PostgreSQL, ChromaDB, Redis), Database Schemas, Authentication Flows, and Legacy Supabase Footprint.

---

# 1. EXECUTIVE SUMMARY

AssistIQ is currently in a **severely fragmented, dual-state architectural transition**. While individual building blocks exist across Node.js, Python, and Docker, the system as a whole **cannot function end-to-end**.

### Key System States:
- **Is the architecture coherent?** **NO.** The project is split down the middle: the backend has half-migrated Node routes pointing toward PostgreSQL and the Python RAG service, but the frontend, WebSocket server, and admin knowledge-base operations remain coupled to Supabase Auth, Supabase pgvector, and legacy Node embedding routines.
- **Is the RAG service actually connected?** **NO.** The Python FastAPI service runs completely standalone and is **not wired to the Node backend at runtime**. Node's `ragClient.js` defaults to `http://127.0.0.1:8000`, which is the exact port bound to the ChromaDB Docker container. FastAPI is neither defined in `docker-compose.yml` nor assigned a dedicated collision-free port.
- **Is Chroma actually being used?** **YES, by Python only.** Chroma is running in Docker on port `8000` with 51 pre-ingested chunks in collection `assistiq_chunks`. The Python pipeline (`retriever.py` and `rag_pipeline.py`) successfully queries Chroma and retrieves chunks with real cosine distances. However, Node never talks to Chroma.
- **Is PostgreSQL actually being used?** **YES, by schema and controllers, but 0 records exist.** Tables `profiles`, `chat_sessions`, and `messages` are instantiated in the Docker container, and Node's `authController.js`, `sessionController.js`, and `chatController.js` issue parameterized SQL against them. However, row count across all tables is currently `0` because no traffic actually reaches them.
- **Is Supabase still part of the active architecture?** **YES.** Supabase Auth is actively driving the entire React client (`AuthContext.jsx`, `auth.js`), the Socket.IO server (`socket.js`), and the admin KB management UI (`KBUploadPage.jsx`).
- **Is authentication fully migrated?** **NO.** The Node backend implements bcrypt and JWT issuance in `authController.js`, but `JWT_SECRET` is missing from `server/.env`, causing the backend to crash immediately on startup. Even if running, the React client never calls Node's `/api/auth/login` or `/api/auth/register`; it authenticates against Supabase and sends Supabase tokens, which Node's `authMiddleware.js` rejects as invalid.
- **Is the application currently runnable end-to-end?** **NO.**

### Overall Status: **RED**

**Root Causes:**
1. **Startup Crash:** The Node server cannot start due to an unhandled exception thrown in `authController.js` and `authMiddleware.js` (`Missing JWT_SECRET in environment variables`).
2. **Port Conflict:** ChromaDB is bound to host port `8000`. The Python FastAPI service has no designated port and collides with Chroma if launched on `8000`. Node's `RAG_SERVICE_URL` defaults to `8000`, sending HTTP `/query` calls directly to ChromaDB rather than the FastAPI app.
3. **Frontend/Backend Auth Decoupling:** The client uses Supabase Auth; the backend validates custom JWTs against PostgreSQL.
4. **WebSocket Split-Brain:** Real-time chat on the server (`socket.js`) still queries and writes to Supabase and uses Node-side Ollama calls rather than PostgreSQL and Python RAG.

---

# 2. ACTUAL ARCHITECTURE

The following ASCII diagram reflects **strictly what is implemented in the repository code today**, distinguishing active runtime paths from isolated components.

```
       +-------------------------------------------------------------+
       |                        REACT CLIENT                         |
       |  (AuthContext.jsx, ChatPage.jsx, AdminPage, KBUploadPage)   |
       +------------------------------+------------------------------+
                  |                   |                 |
       Supabase   |        WebSocket  |                 | HTTP (Axios with
       Auth SDK   |        (Bearer    |                 | Supabase Token)
                  |         Supabase) |                 |
                  v                   v                 v
          +---------------+   +---------------+   +-----------------------------+
          | Supabase Auth |   | Node.js /     |   | Node.js / Express Backend   |
          | (Cloud)       |   | Socket.IO     |   | [FAILS STARTUP: NO JWT_SEC] |
          +---------------+   | (socket.js)   |   +-----------------------------+
                  ^           +-------+-------+                 |
                  |                   |                         | Checks req.headers.authorization
                  |                   | Reads/Writes            | with jwt.verify(JWT_SECRET)
                  |                   v                         v
                  |           +---------------+   +-----------------------------+
                  +-----------+   Supabase    |   | REJECTS WITH 401            |
                              |   Database    |   | (Invalid Token / Signature) |
                              |  (Cloud PG &  |   +-----------------------------+
                              |   pgvector)   |                 |
                              +---------------+                 | (If token were valid)
                                                                |
                                             +------------------+------------------+
                                             |                                     |
                                    PostgreSQL Queries                     HTTP POST /query
                                    (pg Pool)                              (ragClient.js)
                                             |                                     |
                                             v                                     v
                                    +-----------------+                   +-----------------+
                                    | PostgreSQL 16   |                   | PORT 8000       |
                                    | (Docker :5432)  |                   | COLLISION:      |
                                    | profiles        |                   | Sends request to|
                                    | chat_sessions   |                   | ChromaDB, NOT   |
                                    | messages        |                   | FastAPI!        |
                                    | [COUNT: 0 ROWS] |                   +--------+--------+
                                    +-----------------+                            |
                                                                                   X (404 / Hangs)
                                                                                   |
+--------------------------------------------------------------+                   v
|                ISOLATED PYTHON RAG SUBSYSTEM                 |         +-------------------+
|               (Not connected to Node runtime)                |         | ChromaDB (Docker) |
|                                                              |         | Container :8000   |
|   +-------------------+              +-------------------+   |         | Collection:       |
|   | FastAPI app       |              | ChromaStore       +------------>| assistiq_chunks   |
|   | main.py (:8000?)  |              | (chromadb HTTP)   |   |         | (51 items stored) |
|   +---------+---------+              +---------+---------+   |         +-------------------+
|             |                                  |             |
|             v                                  v             |
|   +-------------------+              +-------------------+   |
|   | RAGPipeline /     |              | nomic-embed-text  |   |
|   | Generator         +------------->| & Mistral         |   |
|   | (rag_pipeline.py) |              | (Ollama :11434)   |   |
|   +-------------------+              +-------------------+   |
+--------------------------------------------------------------+

+--------------------------------------------------------------+
| Redis 7 (Docker :6379) - UNUSED / 0 REFERENCES IN APPLICATION|
+--------------------------------------------------------------+
```

---

# 3. COMPONENT-BY-COMPONENT AUDIT

| Component | Status | Evidence | Problems |
| :--- | :--- | :--- | :--- |
| **React** | PARTIALLY IMPLEMENTED | `package.json`, `App.jsx`, `ChatPage.jsx` | Client components are fully styled and interactive, but all auth flows point to Supabase, message sending defaults to legacy WebSocket, and the KB upload page sends manual strings to legacy Supabase endpoints rather than files to Python. |
| **Node/Express** | PARTIALLY IMPLEMENTED | `server.js`, `chatController.js` | Server crashes on boot due to missing `JWT_SECRET` in `.env`. Socket server is still wired to Supabase. Ports for RAG communication collide with ChromaDB. |
| **PostgreSQL** | IMPLEMENTED AND VERIFIED FROM CODE | `docker-compose.yml`, `schema.sql`, `psql` container inspection | Docker container is running and healthy; tables `profiles`, `chat_sessions`, and `messages` exist with matching constraints. Currently contains 0 rows because traffic does not reach it. |
| **Redis** | LEGACY / OBSOLETE | `docker-compose.yml` | Running in Docker on `6379`, but there are zero references or client connections to Redis anywhere in Node, Python, or React code. |
| **ChromaDB** | IMPLEMENTED AND VERIFIED FROM CODE | `docker-compose.yml`, `chroma_store.py` | Running in Docker on port `8000`. Contains collection `assistiq_chunks` with 51 vectors. Verified functional via Python `chromadb.HttpClient`. Occupies port `8000`, causing collision with FastAPI. |
| **Python RAG service** | IMPLEMENTED AND VERIFIED FROM CODE | `main.py`, `rag_pipeline.py` | Endpoints `/health`, `/ingest`, `/query` exist. Querying via Python module returns generated answers based on Chroma chunks. Not containerized in Docker, not running continuously, and not reachable by Node due to port collision. |
| **Ollama embeddings** | IMPLEMENTED AND VERIFIED FROM CODE | `embedder.py`, local Ollama verification | Calls `http://localhost:11434/api/embeddings` with `nomic-embed-text`. Verified generating 768-dimensional vectors. Node also has duplicate legacy embedder in `vectorUtils.js`. |
| **Ollama LLM** | IMPLEMENTED AND VERIFIED FROM CODE | `generator.py`, local Ollama verification | Calls `http://localhost:11434/api/generate` with `mistral`. Verified generating contextual answers. Node also has duplicate legacy generation in `vectorUtils.js`. |
| **Authentication** | PARTIALLY IMPLEMENTED | `authController.js`, `authMiddleware.js` | Node side implements bcrypt hashing and JWT checks against PostgreSQL. However, React still authenticates against Supabase Auth, rendering Node auth routes uncalled and protected routes unreachable. |
| **JWT** | PARTIALLY IMPLEMENTED | `authController.js`, `authMiddleware.js` | `jsonwebtoken` library used in Node. Secret key is missing from environment variables, halting server launch. Frontend stores and transmits Supabase tokens, causing signature verification failures. |
| **Document ingestion** | PARTIALLY IMPLEMENTED | `ingestion.py`, `document_loader.py` | Works for local `.txt` files only. Hardcodes `document_id = "handbook"`. No multipart file upload endpoint, no PDF/DOCX support, and no UI in React for document ingestion. |
| **Retrieval** | IMPLEMENTED AND VERIFIED FROM CODE | `retriever.py` | Embeds query via Ollama and queries ChromaDB with cosine distance. Verified returning top-k matching chunks with similarity scores. |
| **Chat persistence** | PARTIALLY IMPLEMENTED | `chatController.js`, `socket.js` | HTTP path in `chatController.js` correctly writes user and AI messages to PostgreSQL `messages`. But WebSocket server writes to Supabase `messages`. Frontend defaults to WebSocket, bypassing PostgreSQL entirely. |

---

# 4. RAG PIPELINE AUDIT

Tracing ONE user question through the intended flow:

1. **User question:** Entered into input field on React UI.
   - *File/Function:* `client/src/pages/ChatPage.jsx` (`handleSend`)
2. **React -> Node:**
   - *Active Flow:* `client/src/pages/ChatPage.jsx` checks `sock?.connected`. If connected, it emits `send_message` via WebSocket to `server/sockets/socket.js`, completely bypassing the HTTP RAG path.
   - *HTTP Fallback:* `client/api/chat.js` (`chatAPI.sendMessage`) calls `POST /api/chat/send/:id`.
3. **Node Route & Middleware:**
   - *File/Function:* `server/routes/chatRouter.js` -> `server/middleware/authMiddleware.js`.
   - *Status:* **BLOCKED.** Fails because `JWT_SECRET` is undefined, and incoming header contains a Supabase JWT.
4. **Node Session & Message Persistence (PostgreSQL):**
   - *File/Function:* `server/controllers/chatController.js` (`sendMessage`).
   - Verifies session ownership via `SELECT user_id, status FROM chat_sessions WHERE id = $1`.
   - Inserts user message: `INSERT INTO messages (session_id, sender_role, content) VALUES ($1, 'user', $3)`.
5. **Node -> ragClient:**
   - *File/Function:* `server/controllers/chatController.js` calls `queryRAG(message.trim(), 5)` in `server/utils/ragClient.js`.
6. **ragClient -> Python FastAPI:**
   - *File/Function:* `server/utils/ragClient.js` issues `axios.post(`${RAG_SERVICE_URL}/query`, { question, top_k })`.
   - *Status:* **BROKEN.** `RAG_SERVICE_URL` is set to `http://127.0.0.1:8000`. Port 8000 is occupied by ChromaDB. Chroma responds with `404 Not Found` or hangs. Python FastAPI is never reached.
7. **Python FastAPI /query Endpoint:**
   - *File/Function:* `rag-service/app/main.py` (`query`). Calls `rag_pipeline.ask(question=request.question, top_k=request.top_k)`.
8. **Embedding Query:**
   - *File/Function:* `rag-service/app/rag_pipeline.py` calls `retriever.search()`, which invokes `embedder.embed()` in `rag-service/app/embedder.py`.
   - Generates 768-dimension vector via Ollama `nomic-embed-text`.
9. **ChromaDB Query:**
   - *File/Function:* `rag-service/app/retriever.py` (`self.collection.query(query_embeddings=[query_embedding], n_results=top_k)`).
   - Returns matched documents, metadata, and cosine distances.
10. **Context Assembly:**
    - *File/Function:* `rag-service/app/rag_pipeline.py` (`context = "\n\n".join(documents)`).
11. **LLM Generation:**
    - *File/Function:* `rag-service/app/generator.py` (`generate`). Calls Ollama `mistral` at `http://localhost:11434/api/generate`.
12. **Response Return to Node:**
    - *File/Function:* `rag-service/app/rag_pipeline.py` returns `{"question", "answer", "context"}` -> `rag-service/app/main.py` -> `server/utils/ragClient.js`.
13. **Node AI Message Persistence (PostgreSQL):**
    - *File/Function:* `server/controllers/chatController.js`.
    - `INSERT INTO messages (session_id, sender_role, content) VALUES ($1, 'ai', $3)`.
14. **Response Return to React:**
    - *File/Function:* `server/controllers/chatController.js` returns `res.json({ status: 'success', response: aiResponse })` -> `client/src/pages/ChatPage.jsx`.

---

# 5. INGESTION PIPELINE AUDIT

### Step-by-Step Execution Trace:
1. **Document Loading:**
   - *File/Function:* `rag-service/app/document_loader.py` (`load_text_file(file_path)`).
   - Reads file using `pathlib.Path(file_path).read_text(encoding="utf-8")`.
2. **Parser & Format Validation:**
   - *File/Function:* `rag-service/app/document_loader.py`.
   - Strict extension validation: `if path.suffix.lower() != ".txt": raise ValueError(...)`.
3. **Section Detection:**
   - *File/Function:* `rag-service/app/chunker.py` (`split_sections(text)`).
   - Regex-based: `pattern = r"(^[A-Za-z][A-Za-z0-9 /&-]*:)(.*?)(?=^[A-Za-z][A-Za-z0-9 /&-]*:|\Z)"`.
4. **Chunking Strategy:**
   - *File/Function:* `rag-service/app/chunker.py` (`chunk_document(sections, size=500, overlap=100)`).
   - Sub-chunks each section into 500-character windows with 100-character sliding overlap.
5. **Embedding Generation:**
   - *File/Function:* `rag-service/app/chroma_store.py` calling `Embedder.embed()` in `rag-service/app/embedder.py`.
   - Loops over chunks synchronously, sending individual HTTP POST requests to Ollama.
6. **Vector Database Insertion:**
   - *File/Function:* `rag-service/app/chroma_store.py` (`self.collection.add(...)`).
   - Inserts IDs, text documents, vectors, and metadata into collection `assistiq_chunks`.

### Current Limitations:
- **Supported File Types:** Plain UTF-8 text (`.txt`) **ONLY**. Zero support for PDF, DOCX, Markdown, or HTML.
- **Section Parsing Fragility:** The section splitter depends entirely on lines starting with a title followed by a colon (`Title:`). Standard prose, unformatted documents, or markdown headings fail to match the regex, resulting in `0` sections and `0` chunks ingested.
- **Hardcoded Document ID:** `rag-service/app/ingestion.py` hardcodes `document_id = "handbook"`. Every document ingested generates IDs `handbook_chunk_0`, `handbook_chunk_1`, overwriting previous ingestions.
- **Synchronous Ingestion:** Large documents block the single-threaded event loop while generating embeddings one-by-one with 60-second timeouts.
- **No HTTP File Upload:** `rag-service/app/main.py` accepts only `{ "file_path": "string" }` pointing to an existing file on the host machine filesystem.

---

# 6. DATABASE AUDIT

### PostgreSQL Schema vs. Node Controllers

| Table | Column in SQL (`schema.sql`) | Type / Constraint | Used in Controllers | Compatibility Assessment |
| :--- | :--- | :--- | :--- | :--- |
| **`profiles`** | `id` | `UUID PRIMARY KEY DEFAULT gen_random_uuid()` | `authController.js` (lines 50, 174) | **MATCHES.** Returned on register/login, queried in profile. |
| | `email` | `VARCHAR(255) UNIQUE NOT NULL` | `authController.js` (lines 29, 49) | **MATCHES.** Unique check and insert. |
| | `password_hash` | `TEXT NOT NULL` | `authController.js` (lines 49, 94) | **MATCHES.** Stores bcrypt hash (salt rounds 12). |
| | `name` | `VARCHAR(255) DEFAULT ''` | `authController.js` (line 50) | **MATCHES.** Defaults to empty string if omitted. |
| | `role` | `VARCHAR(50) NOT NULL DEFAULT 'user'` | `authController.js` (line 57), `adminMiddleware.js` (line 15) | **MATCHES.** Verified by `req.user.role === 'admin'`. |
| | `created_at` | `TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP` | `authController.js` (line 50) | **MATCHES.** |
| **`chat_sessions`** | `id` | `UUID PRIMARY KEY DEFAULT gen_random_uuid()` | `sessionController.js` (line 26), `chatController.js` (line 24) | **MATCHES.** Queried by session ID. |
| | `user_id` | `UUID NOT NULL (FK -> profiles.id)` | `sessionController.js` (line 28), `chatController.js` (line 36) | **MATCHES.** Enforces user ownership checks. |
| | `title` | `VARCHAR(255) NOT NULL DEFAULT 'New Chat'` | `sessionController.js` (line 28) | **MATCHES.** |
| | `status` | `VARCHAR(50) NOT NULL DEFAULT 'active'` | `sessionController.js` (line 13), `chatController.js` (line 121) | **MATCHES.** Controls whether messages can be sent. |
| | `created_at` | `TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP` | `sessionController.js` (line 57) | **MATCHES.** Ordered by `created_at DESC`. |
| | `updated_at` | `TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP` | *Not explicitly modified by controllers* | Needs an `ON UPDATE` trigger to remain accurate. |
| **`messages`** | `id` | `UUID PRIMARY KEY DEFAULT gen_random_uuid()` | `chatController.js` (line 46) | **MATCHES.** |
| | `session_id` | `UUID NOT NULL (FK -> chat_sessions.id)` | `chatController.js` (lines 136, 152) | **MATCHES.** Links messages to chat sessions. |
| | `sender_role` | `VARCHAR(20) NOT NULL` | `chatController.js` (lines 136, 152) | **MATCHES.** Stores `'user'` and `'ai'`. |
| | `content` | `TEXT NOT NULL` | `chatController.js` (lines 136, 152) | **MATCHES.** |
| | `created_at` | `TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP` | `chatController.js` (line 49) | **MATCHES.** Ordered by `created_at ASC`. |

### Ghost Schema Expectations:
- In `server/controllers/supabaseController.js` (line 9), the startup check executes:
  ```javascript
  const tables = ['profiles', 'chat_sessions', 'messages', 'knowledge_base']
  ```
  `knowledge_base` is **NOT** defined in `schema.sql` (nor should it be). Consequently, `startupCheck()` emits:
  `PostgreSQL Connection: Partial Success (Check tables) { knowledge_base: 'Table not found' }` on every server boot.

---

# 7. AUTHENTICATION AUDIT

### Implementation Verification:
- **Registration Flow:**
  - *Location:* `server/controllers/authController.js` (`register`).
  - Hashing: `bcrypt.hash(password, 12)` is correctly implemented.
  - Duplicate Check: Parameterized SQL `SELECT id FROM profiles WHERE email = $1` prevents collisions.
  - Insert: Parameterized SQL inserts into `profiles` with default role `'user'`.
- **Login Flow:**
  - *Location:* `server/controllers/authController.js` (`login`).
  - Password Verification: `bcrypt.compare(password, user.password_hash)`.
  - JWT Creation: `jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '1h' })`.
- **Protected Requests:**
  - *Location:* `server/middleware/authMiddleware.js`.
  - Validates `Authorization: Bearer <token>` via `jwt.verify(token, JWT_SECRET)`.
  - Attaches decoded payload to `req.user`. Handles `TokenExpiredError` and `JsonWebTokenError`.
- **Admin Verification:**
  - *Location:* `server/middleware/adminMiddleware.js`.
  - Checks `if (!req.user) return 401; if (req.user.role !== 'admin') return 403;`. Correct logic.

### Critical Vulnerabilities & Deficiencies:
1. **Fatal Server Crash:** `process.env.JWT_SECRET` is read at file scope without a default. Because it is missing from `server/.env`, `authController.js` and `authMiddleware.js` crash the Node process on load.
2. **Frontend Disconnection:** The React frontend does not call Node's `/api/auth/register` or `/api/auth/login`. `client/api/auth.js` in the client calls `supabase.auth.signUp()` and `supabase.auth.signInWithPassword()`.
3. **Admin Middleware Misconfiguration:** In `server/routes/kbRouter.js`, `adminMiddleware` is attached to routes without `authMiddleware` preceding it. Since `req.user` is never populated, all requests to those routes return 401.
4. **Token Refresh:** No refresh tokens are implemented. Sessions die abruptly after 60 minutes.

---

# 8. SUPABASE MIGRATION AUDIT

Full repository search results for `@supabase/supabase-js`, `createClient`, `supabase.`, `SUPABASE_`, `generateEmbedding`, `searchByEmbedding`, `resolveQuery`, and `knowledge_base`:

| File | Occurrence | Classification | Required Action |
| :--- | :--- | :--- | :--- |
| `server/config/supabase.js` | `createClient`, `SUPABASE_PROJECT_URL`, `SUPABASE_SECRET_KEY` | **B. Legacy code** | Delete file once dependencies are severed. |
| `server/package.json` | `"@supabase/supabase-js": "^2.97.0"` | **B. Legacy dependency** | Remove from package.json (`npm uninstall @supabase/supabase-js`). |
| `server/.env` | `SUPABASE_PROJECT_URL`, `SUPABASE_SECRET_KEY` | **B. Legacy config** | Remove keys; add `JWT_SECRET`. |
| `server/sockets/socket.js` | `supabase.auth.getUser`, `supabase.from('chat_sessions')`, `supabase.from('messages')`, `_searchKb`, `_resolveKb` | **C. Accidentally active architecture** | **High Priority:** Rewrite socket handler to use PostgreSQL and the Python RAG service, or remove WebSockets in favor of HTTP. |
| `server/controllers/kbController.js` | `supabase.from('knowledge_base')`, `generateEmbedding`, `searchByEmbedding`, `resolveQuery` | **B. Legacy code** | Fully obsolete. Remove entire controller. |
| `server/routes/kbRouter.js` | Mounts `kbController` endpoints | **B. Legacy code** | Remove router from `server.js`. |
| `server/controllers/supabaseController.js` | Check for `knowledge_base` in PostgreSQL | **D. Dead/unused code** | Remove `knowledge_base` from table check; rename controller to `dbCheckController.js`. |
| `server/routes/supaRouter.js` | `GET /api/test-supabase` | **B. Legacy code** | Remove or rename route to `/api/db-check`. |
| `server/controllers/testController.js` | `supabase.auth.signInWithPassword`, `supabase.auth.getUser` | **D. Dead/unused code** | Delete controller and its router `testRouter.js`. |
| `server/utils/vectorUtils.js` | `supabase.rpc('search_knowledge_base')`, `generateEmbedding`, `resolveQuery` | **B. Legacy code** | Fully replaced by Python RAG service. Delete file. |
| `server/utils/test.js` | Tests `generateEmbedding` and `resolveQuery` | **D. Dead/unused code** | Delete test script. |
| `client/config/supabase.js` | `createClient`, `supabase.auth.getSession()` | **C. Accidentally active architecture** | Remove; replace token getter with `localStorage` token reader. |
| `client/api/auth.js` | `supabase.auth.signUp`, `supabase.auth.signInWithPassword`, `supabase.auth.signOut` | **C. Accidentally active architecture** | **Critical:** Rewrite to call Node `/api/auth/register`, `/api/auth/login`, and `/api/auth/logout`. |
| `client/src/contexts/AuthContext.jsx` | `supabase.auth.onAuthStateChange`, `supabase.auth.signOut` | **C. Accidentally active architecture** | Rewrite context to manage state via Node JWT stored in `localStorage`. |
| `client/api/api.js` | Reads token via `getToken()` from Supabase | **C. Accidentally active architecture** | Update Axios interceptor to read Node JWT from `localStorage`. |
| `client/socket/socket.js` | Connects socket using Supabase token | **C. Accidentally active architecture** | Connect using Node JWT. |
| `client/api/index.js` | Exports `supabase`, calls `supabase.auth.getSession()` | **C. Accidentally active architecture** | Remove Supabase exports. |
| `client/package.json` | `"@supabase/supabase-js": "^2.97.0"` | **B. Legacy dependency** | Remove from package.json (`npm uninstall @supabase/supabase-js`). |
| `client/.env` | `VITE_SUPABASE_ANON_KEY`, `VITE_SUPABASE_URL` | **B. Legacy config** | Remove from client environment. |

---

# 9. LEGACY CODE

1. **`server/controllers/kbController.js` & `server/routes/kbRouter.js`**
   - *Why legacy:* Implements vector storage in Supabase pgvector and calls Ollama directly from Node.
   - *What replaces it:* Python FastAPI service (`rag-service`), ChromaDB, and `ragClient.js`.
   - *Safe to remove now?* **Safe on the server side** once `server.js` unmounts it, but `KBUploadPage.jsx` and `AdminPage.jsx` in the frontend currently call these routes. Frontend must be decoupled first.
2. **`server/utils/vectorUtils.js` & `server/utils/test.js`**
   - *Why legacy:* Contains duplicate embedding generation and text generation logic using `fetch()` to Ollama.
   - *What replaces it:* `embedder.py` and `generator.py` in the Python service.
   - *Safe to remove now?* **Yes**, provided `kbController.js` and `socket.js` are updated.
3. **`server/sockets/socket.js`**
   - *Why legacy:* Entire file runs the legacy Supabase database and legacy vector search pipeline.
   - *What replaces it:* Re-implementation using PostgreSQL queries (`pool.query`) and `ragClient.queryRAG()`, or routing all messages through HTTP `POST /api/chat/send/:id`.
   - *Safe to remove now?* Must be refactored before removal, as `ChatPage.jsx` attempts WebSocket connection on mount.
4. **`server/controllers/testController.js` & `server/routes/testRouter.js`**
   - *Why legacy:* Endpoints test logging into Supabase Auth and verifying Supabase tokens.
   - *What replaces it:* Tests targeting Node's `/api/auth/login` and PostgreSQL.
   - *Safe to remove now?* **Yes**, completely safe to delete now.
5. **`server/controllers/supabaseController.js` & `server/routes/supaRouter.js`**
   - *Why legacy:* Queries PostgreSQL but retains Supabase naming conventions and verifies non-existent `knowledge_base` table.
   - *What replaces it:* Dedicated `/api/health/db` endpoint inside `healthRouter.js`.
   - *Safe to remove now?* **Yes.**

---

# 10. DUPLICATION / ARCHITECTURAL PROBLEMS

1. **Port 8000 Conflict (Fatal Runtime Blocker):**
   - `docker-compose.yml` maps `8000:8000` to ChromaDB.
   - `server/.env` sets `RAG_SERVICE_URL='http://127.0.0.1:8000'`.
   - `ragClient.js` defaults to `http://127.0.0.1:8000`.
   - ChromaDB does not serve `/query`. FastAPI cannot bind to `8000` while Chroma is running.
2. **Duplicate Embedding Logic:**
   - Python: `embedder.py` calls Ollama `nomic-embed-text`.
   - Node: `vectorUtils.js` calls Ollama `nomic-embed-text`.
3. **Duplicate Generation Logic:**
   - Python: `generator.py` calls Ollama `mistral`.
   - Node: `vectorUtils.js` calls Ollama `mistral`.
4. **Duplicate & Conflicting Database Access:**
   - `chatController.js` writes to Docker PostgreSQL.
   - `socket.js` writes to Cloud Supabase.
   - Messages sent via WebSocket never appear in PostgreSQL; messages sent via HTTP never appear in Supabase.
5. **Completely Unused Redis Service:**
   - Redis container runs continuously in Docker, but not a single file in the repository contains a Redis client connection or import.
6. **Hardcoded URLs & Localhost Assumptions:**
   - `chroma_store.py`: defaults to `localhost:8000`.
   - `retriever.py`: defaults to `localhost:8000`.
   - `embedder.py`: defaults to `http://localhost:11434`.
   - `generator.py`: defaults to `http://localhost:11434`.
   None of these accept environment variables (`os.getenv`).
7. **Python Module Import Failure when Executed Directly:**
   - Scripts in `rag-service/app/` use `from app.embedder import Embedder`.
   - Running `python app/retriever.py` fails with `ModuleNotFoundError: No module named 'app'`. Scripts must be run with `python -m app.<module>` from the root of `rag-service`.
8. **Client/Server Session Contract Mismatch:**
   - `session.js` defines `getSession`, `deleteSession`, and `updateSessionTitle`.
   - `sessionRouter.js` implements none of these routes.
9. **Client/Server Health Contract Mismatch:**
   - `health.js` defines `getStatus`, `checkDatabase`, and `checkAll`.
   - `healthRouter.js` implements only `GET /`.

---

# 11. END-TO-END READINESS

1. **Can a user register?**
   - **NO.** React calls Supabase Auth. The Node registration endpoint cannot run because the Node server crashes on startup due to missing `JWT_SECRET`.
2. **Can a user log in?**
   - **NO.** React logs in via Supabase Auth. Node login endpoint cannot run due to the server startup crash.
3. **Does login return a JWT?**
   - **PARTIAL.** Node's `authController.js` contains the code to generate a JWT, but cannot execute until `JWT_SECRET` is defined in `.env`.
4. **Can the JWT authenticate protected routes?**
   - **NO.** Frontend transmits Supabase access tokens, which are rejected by `authMiddleware.js`.
5. **Can an admin route verify admin role?**
   - **NO.** Blocked by token validation failure at the auth middleware stage.
6. **Can a user create a chat session?**
   - **NO.** `sessionAPI.createSession()` calls `POST /api/session/create`, which is blocked by 401 Unauthorized from `authMiddleware`.
7. **Can a user send a message?**
   - **NO.** If sent via WebSocket, it reaches `socket.js` which fails on Supabase RPC search; if sent via HTTP, it fails with 401 Unauthorized.
8. **Does Node call Python RAG?**
   - **NO.** Node's `ragClient.js` sends requests to port `8000` (ChromaDB), which rejects them.
9. **Does Python retrieve from Chroma?**
   - **YES.** Verified by direct execution of `python -m app.retriever`. Retrieves 5 chunks with cosine similarity distances.
10. **Does the LLM generate an answer?**
    - **YES.** Verified by direct execution of `python -m app.rag_pipeline`. Ollama Mistral generates contextual answers from retrieved Chroma chunks.
11. **Is the answer stored in PostgreSQL?**
    - **NO.** No AI responses have been stored in PostgreSQL (verified: `SELECT count(*) FROM messages` is `0`).
12. **Can chat history be retrieved?**
    - **NO.** Blocked by 401 Unauthorized on `GET /api/chat/:id`.
13. **Can an admin currently upload a real document?**
    - **NO.** Neither frontend nor backend has an endpoint or UI to upload document files (multipart/form-data).
14. **Can a real PDF/DOCX be ingested?**
    - **NO.** `document_loader.py` explicitly rejects any file not ending in `.txt`.
15. **Are embeddings stored in Chroma?**
    - **YES.** Verified: 51 vectors currently reside in the `assistiq_chunks` collection.
16. **Is PostgreSQL the source of truth?**
    - **NO.** The schema is initialized, but no active application data flows into it.
17. **Is Supabase completely removed from the active runtime path?**
    - **NO.** Supabase actively manages user sessions on the frontend and handles real-time messages on the WebSocket server.

---

# 12. SECURITY AUDIT

- **Password Hashing:** **SECURE.** Node uses `bcrypt.hash(password, 12)` in `authController.js`.
- **JWT Secret Handling:** **INSECURE.** No secret key is provided in `server/.env`. Missing fallback or default causes unhandled startup crash.
- **SQL Injection:** **SECURE.** All database queries in `authController.js`, `sessionController.js`, `chatController.js`, and `supabaseController.js` use parameterized SQL statements (`$1, $2, ...`).
- **Authorization & Session Ownership:** **SECURE IN CODE.** `chatController.js` and `sessionController.js` verify that `session.user_id === req.user.id` before reading or inserting messages.
- **Admin Authorization Bypass Risk:** **BROKEN CONFIGURATION.** `kbRouter.js` invokes `adminMiddleware` without `authMiddleware`.
- **CORS Configuration:** **LOOSE.** `server.js` configures Socket.IO with `cors: { origin: "*" }`. Express CORS hardcodes `http://localhost:5173`.
- **Exposed Secrets in Source Code & Version Control:** **CRITICAL RISK.** Real Supabase public and secret keys, along with database passwords (`assistiq_password`), are committed in `server/.env` and `client/.env`.
- **Arbitrary File Path Ingestion (Path Traversal):** **CRITICAL RISK.** `main.py` accepts an unvalidated `file_path: str` and reads it via `Path(file_path).read_text()`. An attacker can pass arbitrary filesystem paths to read and embed system files into Chroma.
- **Input Validation:** **PARTIAL.** String types are checked in chat controllers, but email formatting and password strength rules are completely absent.

---

# 13. PERFORMANCE / PRODUCTION ISSUES

### CRITICAL:
1. **Node Server Startup Crash:** Missing `JWT_SECRET` in environment halts server execution immediately.
2. **Port 8000 Collision:** ChromaDB and FastAPI cannot coexist on `localhost:8000`. Node `ragClient` cannot reach the RAG service.
3. **Synchronous Embedding & Generation in Ingestion:** Ingesting a large document calls Ollama sequentially for each chunk with no connection pooling, batching, or background worker queue.

### IMPORTANT:
1. **No Database Migration Tooling:** Schema relies on manual execution of `schema.sql` through `psql`. No tool like Prisma, Knex, or Flyway manages schema evolution.
2. **Lack of Fast-Path Rejection / Abstention:** If a user asks a completely out-of-domain question, Chroma still returns the 5 nearest vectors (regardless of distance), and Mistral attempts generation instead of rejecting early.
3. **No Timeout in `ragClient.js`:** Axios call to Python RAG has no configured timeout. If Python hangs or Mistral stalls, the Express request hangs indefinitely.

### LATER:
1. **Unused Redis Instance:** Consuming container resources in Docker with zero application utilization.
2. **No Token Expiration Handling (Refresh Tokens):** Hard expiration after 1 hour forces user logouts mid-session.
3. **No Chunk Batching for Chroma:** `chroma_store.py` adds all chunks in a single request; if a file has thousands of chunks, the payload could exceed payload size limits.

---

# 14. CURRENT LIMITATIONS

- **File Types:** Only `.txt` files are supported. PDF, DOCX, Markdown, and CSV are rejected.
- **OCR:** Completely absent. Scanned PDFs or images cannot be processed.
- **Document Versioning:** Absent. Documents have no version tracking or replace/update lifecycle.
- **Document Identifiers:** Hardcoded to `"handbook"`. Subsequent uploads overwrite prior chunks.
- **File Upload Capability:** No HTTP multipart upload exists. Files must manually pre-exist on the host filesystem.
- **Hybrid Search:** Absent. Retrieval relies 100% on dense vector cosine search; no BM25/keyword sparse search is combined.
- **Reranking:** Absent. Raw top-k distance order from Chroma is passed directly to the LLM.
- **Citations / Source Attribution:** `generator.py` prompt does not instruct the model to provide section references, nor does the endpoint return source metadata to the client.
- **Evaluation / Observability:** No RAG evaluation metrics (e.g. Ragas, TruLens) or tracing (e.g. Langfuse, OpenTelemetry).
- **Asynchronous Ingestion:** No background job queue (e.g. Celery, BullMQ). Ingestions are blocking HTTP calls.

---

# 15. FINAL VERDICT

### CURRENT STATE:
AssistIQ has successfully validated its core Python RAG algorithms (Ollama embedding, Chroma storage, cosine retrieval, and Mistral generation) and has an operational Docker PostgreSQL instance with a clean relational schema. However, the system is fundamentally broken as an integrated product: the Node backend crashes on startup due to missing environment configuration, the Node-to-Python HTTP bridge points to the wrong container port, the React frontend and Socket.IO server remain coupled to legacy Supabase infrastructure, and not a single live user or chat record exists in the intended database.

### WHAT IS ACTUALLY WORKING:
- Python RAG pipeline (`retriever.py`, `generator.py`, `rag_pipeline.py`) querying ChromaDB and generating real answers via Mistral.
- ChromaDB Docker container running on port `8000` with 51 vectors in collection `assistiq_chunks`.
- PostgreSQL 16 Docker container running on port `5432` with tables `profiles`, `chat_sessions`, and `messages`.
- Parameterized SQL controller implementations in Node for auth, sessions, and chat.
- UI layout and visual styling across all React pages.

### WHAT IS BROKEN:
- Node backend crashes immediately on boot with `Error: Missing JWT_SECRET in environment variables`.
- Port collision: Node calls `http://127.0.0.1:8000/query`, hitting ChromaDB instead of FastAPI.
- Frontend Auth: React logs into Supabase; Node rejects Supabase tokens with 401 Unauthorized.
- WebSocket server: Still queries Supabase and runs Node-side Ollama calls instead of PostgreSQL and Python RAG.
- Admin KB routes in `kbRouter.js`: Use `adminMiddleware` without `authMiddleware`, rejecting all admin requests.

### WHAT IS LEGACY:
- `kbController.js` and `kbRouter.js` (Supabase pgvector CRUD).
- `vectorUtils.js` (Node-side embedding and chat completion).
- `testController.js` and `testRouter.js` (Supabase login test helpers).
- `server/config/supabase.js` and `client/config/supabase.js` (Supabase JS clients).
- Redis container in `docker-compose.yml`.

### WHAT IS MISSING:
- Continuous process execution or Docker Compose service for the Python FastAPI RAG app.
- Multipart document file upload endpoint in FastAPI and matching file upload UI in React.
- PDF and DOCX parsers in Python ingestion.
- Refresh token mechanism in Node auth.
- Dynamic document IDs in Python ingestion.

---

# 16. NEXT STEPS

The following are the **top 5 highest-priority implementation steps**, ordered strictly by dependency:

### Step 1: Fix Node Environment & Resolve Python Port Collision
- **What to change:**
  1. Add `JWT_SECRET=super_secret_jwt_key_assistiq_2026` to `server/.env`.
  2. Change `RAG_SERVICE_URL` in `server/.env` and `ragClient.js` to port `8001` (e.g. `http://127.0.0.1:8001`).
  3. Run FastAPI on port `8001` (`uvicorn app.main:app --port 8001`).
- **Why we change it:** Resolves the immediate startup crash of the Node server and eliminates the port collision between ChromaDB (8000) and FastAPI.
- **Files affected:**
  - `server/.env`
  - `server/utils/ragClient.js`
- **What to test afterward:**
  - Run `node src/server.js` and verify it starts and prints `Server running at http://localhost:5180`.
  - Run `node testRagClient.js` and verify it returns a successful response from FastAPI on port `8001`.

### Step 2: Migrate Frontend Authentication from Supabase to Node Backend
- **What to change:**
  1. Rewrite `client/api/auth.js` to send `POST /auth/register` and `POST /auth/login` to the Node API via Axios instead of `supabase.auth`.
  2. Store the returned JWT (`access_token`) and user object in `localStorage`.
  3. Rewrite `client/src/contexts/AuthContext.jsx` to initialize auth state from `localStorage` on mount instead of `supabase.auth.onAuthStateChange`.
  4. Update `client/api/api.js` request interceptor to read the token directly from `localStorage`.
- **Why we change it:** Enables users to register and log in through the actual application database (PostgreSQL), and sends valid JWTs to Node protected routes.
- **Files affected:**
  - `client/api/auth.js`
  - `client/src/contexts/AuthContext.jsx`
  - `client/api/api.js`
- **What to test afterward:**
  - Register a new user via the React UI `/auth`. Verify a record is created in PostgreSQL (`SELECT * FROM profiles`).
  - Log in via `/auth`. Verify JWT is stored in browser `localStorage` and profile loads without 401 errors.

### Step 3: Align Chat Message Flow & Unify on PostgreSQL + Python RAG
- **What to change:**
  1. Modify `client/src/pages/ChatPage.jsx` to send messages exclusively via HTTP `chatAPI.sendMessage(session.id, msg)`.
  2. Either update `server/sockets/socket.js` to authenticate via Node JWT, query PostgreSQL, and call `queryRAG`, or temporarily disable socket messaging in `ChatPage.jsx` until the HTTP flow is proven.
- **Why we change it:** Eliminates the split-brain state where WebSocket calls write to Supabase and bypass PostgreSQL and ChromaDB.
- **Files affected:**
  - `client/src/pages/ChatPage.jsx`
  - `server/sockets/socket.js`
- **What to test afterward:**
  - Send a chat message in the UI. Verify user message and AI response appear in the UI and are stored in PostgreSQL (`SELECT * FROM messages`).

### Step 4: Implement Multipart File Ingestion Endpoint in Python RAG
- **What to change:**
  1. Add an `UploadFile` endpoint (`POST /ingest-file`) in `rag-service/app/main.py` using `fastapi.UploadFile`.
  2. Update `rag-service/app/ingestion.py` to generate unique `document_id` values (e.g. filename + timestamp or UUID) instead of the hardcoded `"handbook"`.
  3. Add file reading for `.txt` (and optionally `pypdf` for `.pdf`).
- **Why we change it:** Replaces arbitrary server-side path reading with real file upload capabilities and stops subsequent ingestions from overwriting chunk IDs in Chroma.
- **Files affected:**
  - `rag-service/app/main.py`
  - `rag-service/app/ingestion.py`
  - `rag-service/app/document_loader.py`
- **What to test afterward:**
  - Send a POST request to `/ingest-file` via `curl` with a multipart form file.
  - Verify chunks and embeddings are stored in ChromaDB under the new dynamic document ID.

### Step 5: Clean Up Legacy Supabase Controllers & Fix Startup Schema Checks
- **What to change:**
  1. In `server/controllers/supabaseController.js`, remove `'knowledge_base'` from the checked tables list. Rename file to `dbCheckController.js`.
  2. Remove legacy routes `kbRouter.js`, `testRouter.js`, and `supaRouter.js` from `server/src/server.js`.
  3. Uninstall `@supabase/supabase-js` from `server/package.json` and `client/package.json`.
- **Why we change it:** Purges obsolete code, stops deceptive startup warnings about missing `knowledge_base` tables, and fully closes the Supabase migration.
- **Files affected:**
  - `server/controllers/supabaseController.js`
  - `server/src/server.js`
  - `server/package.json`
  - `client/package.json`
- **What to test afterward:**
  - Run the Node server. Verify `PostgreSQL Connection: Successful` is printed with no warnings.
  - Verify no `@supabase/supabase-js` imports exist anywhere in the active build.
