# AssistIQ — Architecture

> Canonical architecture and audit document — consolidated on 2026-10-24 from the prior architecture/audit files and rechecked against the current source tree. It describes current code, not an intended future design. Configuration values and credentials are intentionally not reproduced.

## 1. The application in one view

AssistIQ is a three-process support-chat application, with Docker-hosted infrastructure:

```text
Browser (React + Vite, :5173)
  │
  ├── HTTP /api/* with Bearer JWT ────────────────┐
  └── Socket.IO with JWT in handshake.auth.token ─┤
                                                 ▼
Express + Socket.IO server (PORT, :5180 default) ── PostgreSQL (:5432)
  │                                      profiles / sessions / messages
  │ HTTP, RAG_SERVICE_URL (default :8001)
  ▼
FastAPI RAG service (:8001)
  ├── ChromaDB HTTP (:8000)      vector chunks + metadata
  └── Ollama HTTP (:11434)       nomic-embed-text + mistral

Docker Compose starts PostgreSQL, Redis, and ChromaDB.
Redis is provisioned but is not used anywhere in the application code.
```

There are two separate persistence responsibilities:

| Concern | Actual store | Code path |
|---|---|---|
| Accounts, roles, chat sessions, chat messages | PostgreSQL | Node server (`pg`) |
| Uploaded source documents | `rag-service/data/` on disk | Multer + FastAPI |
| Embeddings and document chunks | ChromaDB | FastAPI RAG service |
| Session token in the browser | `localStorage` | `client/api/token.js` |

The active application does **not** use Supabase for normal login, chat, document ingestion, or RAG. Supabase-related utilities remain in the repository as legacy/test code; see [Legacy and mismatched code](#14-legacy-mismatched-or-unreachable-code).

## 2. What starts what

### Infrastructure

`docker-compose.yml` is the infrastructure entry point. `docker compose up` starts:

| Service | Port | Persistent volume | Used by |
|---|---:|---|---|
| `postgres` (PostgreSQL 16) | 5432 | `postgres_data` | Express server |
| `redis` (Redis 7 Alpine) | 6379 | `redis_data` | Nothing in the current source |
| `chroma` (ChromaDB) | 8000 | `chroma_data` | FastAPI RAG service |

PostgreSQL must be initialized with `server/config/schema.sql`; the compose file creates the database/user but does not mount or automatically execute this schema.

### Application processes

| Start location | Command / entry point | Result |
|---|---|---|
| `server/` | `npm run dev` → `nodemon src/server.js` | Loads `.env`, runs the DB schema check, starts Express and Socket.IO on `PORT` or `5180`. |
| `client/` | `npm run dev` → `vite` | Serves `index.html`, normally on `5173`, and begins at `src/main.jsx`. |
| `rag-service/` | `uvicorn app.main:app --reload --port 8001` | Starts FastAPI and creates `Ingestion`/`RAGPipeline` instances. |
| Ollama | `ollama serve` | Provides the local model API on `11434`; the project expects `nomic-embed-text` and `mistral`. |

Important environment inputs are:

| Process | Variables actually read | Default where present |
|---|---|---|
| Client | `VITE_API_URL`, `VITE_SOCKET_URL` | `http://localhost:5180/api`, socket fallback `http://localhost:5001` |
| Express | `PORT`, `JWT_SECRET`, `ADMIN_SIGNUP_CODE`, `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `RAG_SERVICE_URL` | `5180`, local PostgreSQL credentials, `http://127.0.0.1:8001` |
| Legacy Supabase utility only | `SUPABASE_PROJECT_URL`, `SUPABASE_SECRET_KEY` | no default — throws if that module is loaded without them |
| RAG service | no environment variables are read | Chroma `localhost:8000`, Ollama `localhost:11434` are hard-coded defaults |

The current `client/.env` overrides both browser URLs to port `5001`, while the Node server itself defaults to `5180`. Therefore, this workspace will target `5001` unless that file is changed or the server is deliberately run on `5001`; this is a configuration mismatch, not a Vite proxy. The same client environment file contains an `ADMIN_SIGNUP_CODE` entry. It is not read by any client source and, because it lacks a `VITE_` prefix, Vite will not expose it through `import.meta.env`; nevertheless, admin-signup configuration belongs only in `server/.env`, not in the client directory.

## 3. Frontend boot and route flow

### Exact browser boot chain

```text
client/index.html
  └─ <script type="module" src="/src/main.jsx">
       └─ src/main.jsx
            ├─ createRoot(#root)
            ├─ BrowserRouter
            ├─ AuthProvider
            └─ App
                 └─ src/App.jsx chooses a route/page
```

`client/index.html` supplies the root DOM element, document metadata, Google Inter font, icon, and the module script. `src/main.jsx` imports the global design system (`src/index.css`) and wraps the entire UI in `BrowserRouter` and `AuthProvider`.

`src/App.jsx` reads `{ user, loading }` from the auth context. It shows `Loader` while session recovery is running, then registers these routes:

| URL | Render path | Access decision |
|---|---|---|
| `/auth` | `AuthPage` | Public. Redirects an already-known admin to `/admin`, every other known user to `/chat`. |
| `/chat` | `ProtectedRoute` → `Layout` → `ChatPage` | Must have a user. |
| `/admin` | `ProtectedRoute` → `Layout` → `AdminRoute` → `AdminPage` | Must be an authenticated `admin`. |
| `/admin/kb` | `ProtectedRoute` → `Layout` → `AdminRoute` → `KBUploadPage` | Must be an authenticated `admin`. |
| any other URL | `Navigate` | Redirects to the appropriate route based on `user` and role. |

`Layout` always renders `Navbar` and an `Outlet`. `ProtectedRoute` sends an unauthenticated visitor to `/auth`; `AdminRoute` additionally sends a non-admin to `/chat`. These are UX guards. Express middleware remains the real authority for API access.

### Authentication restoration on page load

`AuthProvider` is the frontend’s state owner. On mount it:

1. Checks `getToken()` from `client/api/token.js`.
2. If no token exists, finishes loading without a user.
3. If it exists, calls `authAPI.getProfile()` (`GET /api/auth/profile`).
4. A valid profile becomes both `user` and `profile`, then it attempts `connectSocket()`.
5. If profile lookup returns `401`, the Axios response interceptor clears the matching token and dispatches the browser event `assistiq:unauthorized`. `AuthProvider` listens for that event, clears React auth state, and disconnects Socket.IO.

If a socket cannot be connected, HTTP login and chat still work. Socket failure is deliberately non-fatal during restoration and login.

## 4. `token.js`, Axios, and browser authentication

`client/api/token.js` contains no secret, user profile, role, or token-generation logic. It is a small wrapper around browser storage:

```text
constant key: "assistiq_access_token"
getToken()             read that key from localStorage
setToken(token)        write the JWT to localStorage
clearToken()           remove it from localStorage
notifyUnauthorized()   dispatch window event "assistiq:unauthorized"
```

The JWT itself is issued by Express after login. Its signed payload is `{ id, email, role }` and it expires after one hour. The client should not regard the payload as its authority: it restores the profile from the server.

`client/api/api.js` creates the one Axios client used by all API modules:

- Base URL: `VITE_API_URL`, otherwise `http://localhost:5180/api`.
- Timeout: 150 seconds, to allow a slow local LLM answer.
- Request interceptor: reads `token.js` and attaches `Authorization: Bearer <JWT>` unless the request uses `skipAuth`. It also saves the token used on the request as `_authToken`.
- Response interceptor: if a request that used the **current** token receives `401`, it clears that token and sends the `assistiq:unauthorized` event. Login calls opt out, so a bad password does not log out a pre-existing session during the request.

`authAPI.logout()` only clears browser storage. It does **not** call the existing server `POST /api/auth/logout` endpoint, and the server endpoint only returns a confirmation because tokens are stateless. There is no server-side token revocation list.

## 5. Frontend files and who calls whom

### API and socket modules (`client/api/`, `client/socket/`)

| File | Purpose and actual callers |
|---|---|
| `api/api.js` | Shared Axios instance/interceptors. Imported by every API module. |
| `api/token.js` | Browser token storage + unauthorized event. Used by `api.js`, `auth.js`, `AuthContext.jsx`, and socket setup. |
| `api/auth.js` | `register`, `login`, `getProfile`, `logout`, `getCurrentUser`, `isAuthenticated`. Used by `AuthContext.jsx`; login persists the received token. |
| `api/session.js` | Declares create/current/list/resolve plus three unsupported session helpers. `ChatPage` uses create, current, resolve; `AdminPage` uses list. |
| `api/chat.js` | `getMessages` and HTTP `sendMessage`. Used only by `ChatPage`. |
| `api/kb.js` | KB search/resolve/list/upload/delete/re-ingest/sync methods. `AdminPage` and `KBUploadPage` use list/delete/re-ingest/sync; `KBUploadPage` additionally uses upload. |
| `api/health.js` | Declares one working health request and three missing server routes. Not imported by a rendered page. |
| `api/test.js` | Declares endpoints that do not match most of `testRouter`; no rendered page imports it. |
| `api/index.js` | Barrel exports plus an `initializeApp()` convenience function. Nothing imports/calls it in the current app. |
| `socket/socket.js` | Process-wide singleton Socket.IO client. `AuthProvider` opens/closes it; `ChatPage` obtains it and registers receives. |

`connectSocket()` reads the JWT, calls `io(VITE_SOCKET_URL || 'http://localhost:5001', { auth: { token }, transports: ['websocket', 'polling'] })`, and installs connect/disconnect/error console handlers. Normally `VITE_SOCKET_URL` must be `http://localhost:5180`; otherwise its fallback port is inconsistent with the Express default.

### Components, context, and pages (`client/src/`)

| File | Responsibility |
|---|---|
| `main.jsx` | React entry point; creates the app root and applies global providers. |
| `App.jsx` | The route table and role-based redirects. |
| `App.css` | Minimal app shell layout. |
| `index.css` | Global reset, dark theme variables, reusable buttons/inputs/badges/cards/loader/animations, and responsive defaults. |
| `contexts/contextInstance.js` | Creates the `AuthContext` object separately to avoid cyclic imports. |
| `contexts/AuthContext.jsx` | Owns `user`, `profile`, `loading`, login/register/logout, profile fetch, socket lifecycle, and unauthorized-event response. |
| `contexts/useAuth.js` | Safe `useContext` wrapper that throws when used outside `AuthProvider`. |
| `components/Layout.jsx` | Renders `Navbar` plus the nested route `Outlet`. |
| `components/ProtectedRoute.jsx` | Blocks a missing user, otherwise renders children / `Outlet`. |
| `components/AdminRoute.jsx` | Blocks a missing user or non-admin role. |
| `components/Navbar.jsx` | Common navigation. Shows admin and KB links only when `isAdmin`; invokes context logout. |
| `components/Loader.jsx` | Global circular loading view. |
| `components/Navbar.css` | Sticky responsive navbar presentation. |
| `pages/AuthPage.jsx` | Sign-in / sign-up form; invokes auth context and navigates after login. |
| `pages/ChatPage.jsx` | Current-session selection, message history, socket-first chat, HTTP fallback, resolved-session UI. |
| `pages/AdminPage.jsx` | Admin dashboard with a document tab and an all-sessions tab. |
| `pages/KBUploadPage.jsx` | Full admin document upload/list/search/re-index/delete workflow with toast feedback. |
| `pages/AuthPage.css` | Auth layout, animated background, form/card styles. |
| `pages/ChatPage.css` | Chat viewport, messages, typing/resolution states, animation, mobile layout. |
| `pages/AdminPage.css` | Dashboard tabs, KB card grid, sessions table, responsive layout. Some modal/card selectors are currently unused by the JSX. |
| `pages/KBUploadPage.css` | Upload dropzone, document cards, stats, toast, and responsive styles. |
| `assets/react.svg` | Starter Vite asset; not imported by the application. |

`client/public/assistIQ.png` is the public logo/favicon loaded by `index.html`. `client/public/vite.svg` is a Vite starter asset and is not referenced by the current UI.

### User sign-up and login flow

```text
AuthPage submit
  ├─ sign up: useAuth.register → authAPI.register
  │    → POST /api/auth/register
  │    → success message; user manually signs in afterward
  │
  └─ sign in: useAuth.login → authAPI.login
       → POST /api/auth/login
       → token.js stores access_token
       → AuthProvider stores returned user and tries Socket.IO
       → AuthPage navigates to /admin or /chat according to returned role
```

On registration, name/email/password and an optional `adminCode` go to Express. A nonempty admin code is checked against server-only `ADMIN_SIGNUP_CODE` with a timing-safe comparison; a matching code makes role `admin`, otherwise the new role is `user`.

### Chat flow — exactly what happens

```text
ChatPage mount
  ├─ GET /api/session/current
  ├─ if data is null: POST /api/session/create
  └─ GET /api/chat/:sessionId to hydrate messages

User sends a message
  ├─ optimistically renders the user message
  ├─ preferred: Socket.IO "send_message" { chatId, message }
  │    └─ receives Socket.IO "receive_message" with saved AI row
  └─ fallback: POST /api/chat/send/:sessionId { message }
       └─ renders returned response
```

`ChatPage` retries listener registration up to 10 times while waiting for the singleton socket to become connected. It shows a standard-mode banner if that fails. It sets a typing state immediately, shows a slow-response hint after 15 seconds, and disables the input while a send is outstanding.

In either transport, Express first verifies the session belongs to the authenticated user and is `active`, saves the user message, asks the RAG service, saves the AI message, then returns/emits the AI answer. Message history comes from PostgreSQL on a later page load.

After at least two rendered messages, the page offers to resolve the ticket. `POST /api/session/resolve` marks it resolved. Clicking **Start New Chat** runs the mount procedure again; creating a session also resolves any other active session for that same user first.

### Admin knowledge-base flow

```text
KBUploadPage / AdminPage
  → kbAPI (Axios + Bearer token)
  → Express /api/kb route
  → KB controller proxies to FastAPI (:8001)
  → FastAPI reads/writes rag-service/data and ChromaDB (:8000)
  → Ollama embeds chunks when ingestion/re-ingestion occurs
```

Only admins can access document list/upload/delete/re-ingest/sync routes. Upload uses multipart field name `file`, accepts only `.txt` and `.md`, limits size to 25 MiB, sanitizes the filename, writes it to `rag-service/data`, then calls FastAPI `/ingest`. Delete asks for browser confirmation, then FastAPI deletes matching Chroma chunks and physical files with the same stem. Sync loops through every discovered document and re-ingests each one.

## 6. Express server, routing, and middleware

`server/src/server.js` is the Node runtime entry point. It first calls `dotenv.config()`, creates Express, runs `startupCheck()` asynchronously, applies CORS for `http://localhost:5173` with credentials, enables JSON and URL-encoded bodies, mounts routers, creates an HTTP server, attaches Socket.IO, calls `setupSocket(io)`, and listens on the configured port.

### Mounted route map: the source of truth

| HTTP endpoint | Middleware | Controller / effect |
|---|---|---|
| `GET /api/test-supabase` | none | `supaRouter` → `testConnection`; despite the name, checks PostgreSQL tables. |
| `GET /api/health` | none | Returns `{ message: 'Server is running' }`. |
| `POST /api/auth/register` | none | Creates a PostgreSQL profile. |
| `POST /api/auth/login` | none | Checks bcrypt hash and returns profile + JWT. |
| `GET /api/auth/profile` | `authMiddleware` | Reads current profile from PostgreSQL. |
| `POST /api/auth/logout` | `authMiddleware` | Stateless acknowledgement only. |
| `POST /api/session/create` | `authMiddleware` | Resolves this user’s current active sessions, then creates one. |
| `GET /api/session/current` | `authMiddleware` | Gets newest active session or `data: null`. |
| `POST /api/session/resolve` | `authMiddleware` | Ownership-checks and resolves `body.session_id`. |
| `GET /api/session/` | `authMiddleware`, `adminMiddleware` | Lists all sessions. |
| `GET /api/chat/:id` | `authMiddleware` | Ownership-checks then gets ordered messages. |
| `POST /api/chat/send/:id` | `authMiddleware` | HTTP chat fallback: persist user message → RAG → persist AI answer. |
| `POST /api/kb/upload`, `/entry`, or `/add` | auth, admin, Multer | Saves one uploaded file then FastAPI ingests it. Three aliases share one action. |
| `GET /api/kb/entries` | auth, admin | Proxies FastAPI document inventory. |
| `DELETE /api/kb/entry/:id` | auth, admin | Removes FastAPI document/chunks. |
| `POST /api/kb/entry/:id/reingest` | auth, admin | Proxies FastAPI re-ingestion. |
| `POST /api/kb/sync` | auth, admin | Re-ingests every FastAPI-listed document, one at a time. |
| `POST /api/kb/search` | **none** | Calls RAG and returns its context + answer. |
| `POST /api/kb/resolve` | **none** | Calls RAG and returns its answer. |
| `POST /api/test/user-login` | none | Reuses login controller, returns a testing-shaped response. |
| `POST /api/test/admin-login` | none | Reuses login and requires the returned role to be admin. |

Route order matters: e.g. `chatRouter.get('/:id')` and `chatRouter.post('/send/:id')` do not collide because they use different methods. No generic Express error handler is installed; each controller catches its own errors.

### Middleware responsibilities

| File | Behaviour |
|---|---|
| `middleware/authMiddleware.js` | Requires `Authorization: Bearer <JWT>`, verifies with `JWT_SECRET`, stores decoded payload in `req.user`, differentiates expired/invalid/missing token as 401 responses. |
| `middleware/adminMiddleware.js` | Uses `req.user` when auth middleware has already supplied it; otherwise can independently parse/verify a Bearer token. It permits only `req.user.role === 'admin'`; otherwise 403. |
| `middleware/uploadMiddleware.js` | Creates `rag-service/data` if absent; configures Multer disk storage, filename sanitization, `.txt`/`.md` filter, and 25 MiB maximum. |

## 7. Server directories and files

### `server/config/`

| File | What it does |
|---|---|
| `db.js` | Creates and exports one `pg.Pool`. Uses DB environment variables with local compose-compatible defaults, and logs unexpected pool errors. |
| `schema.sql` | PostgreSQL schema: `profiles`, `chat_sessions`, `messages`; foreign keys and indexes. Must be applied separately. |
| `supabase.js` | Legacy helper that creates a Supabase client from required env vars. No live route imports it. It is imported only by `utils/vectorUtils.js`. |

### `server/controllers/`

| File | What it does |
|---|---|
| `authController.js` | Validates/normalizes email, hashes passwords with bcrypt cost 12, creates profiles, logs users in, signs a 1-hour JWT, reads profiles, and gives a stateless logout response. Throws at module load if `JWT_SECRET` is absent. |
| `sessionController.js` | Creates, gets, resolves, and admin-lists PostgreSQL chat sessions. It never uses the RAG service. |
| `chatController.js` | Owns HTTP chat history and fallback send. It validates ownership/status, writes both message rows, calls `queryRAG`, and returns the answer. |
| `kbController.js` | Node-to-FastAPI adapter for all document actions and direct RAG helper endpoints. It is the only active path from the Node server to RAG document management. |
| `supabaseController.js` | Misnamed PostgreSQL schema verifier/startup checker. It tests access to `profiles`, `chat_sessions`, and `messages`. |
| `testController.js` | Test-only wrapper that invokes the real login controller using a response shim and optionally checks for `admin` role. |

### `server/routes/`

| File | Mount point | Calls |
|---|---|---|
| `authRouter.js` | `/api/auth` | Auth controller, adding auth middleware to profile/logout. |
| `sessionRouter.js` | `/api/session` | Applies auth to all routes, admin guard only to the all-sessions listing. |
| `chatRouter.js` | `/api/chat` | Applies auth to history and HTTP send. |
| `kbRouter.js` | `/api/kb` | Wires Multer and both auth/role guards to document management. Search/resolve have no guard. |
| `healthRouter.js` | `/api/health` | One simple liveness response. |
| `supaRouter.js` | `/api` | Exposes the misleading `/test-supabase` PostgreSQL check. |
| `testRouter.js` | `/api/test` | Exposes user/admin login test endpoints. |

### `server/sockets/socket.js`

Socket.IO uses the same `JWT_SECRET`, but receives the token from `socket.handshake.auth.token` rather than an HTTP header. Its middleware verifies it and creates `socket.user` with id/email/role.

On connection, the only domain event is:

```text
client  -- send_message { chatId, message } --> server
server  -- receive_message { id, chatId, sender_role, content, created_at } --> same client
server  -- error { error } --> same client on validation/processing failures
```

The handler performs the same ownership/status checks and database/RAG/persistence sequence as HTTP chat. The socket path catches RAG failure and stores/emits a friendly fallback answer; the HTTP controller instead turns any RAG error into a 500 response. The frontend `ChatPage` registers `receive_message` but does not consume the custom Socket.IO `error` event beyond the socket module’s console logging.

### `server/utils/` and root-level server scripts

| File | Status and purpose |
|---|---|
| `utils/ragClient.js` | Active. `queryRAG(question, top_k)` POSTs `/query` to FastAPI and returns its response. Used by HTTP chat, socket chat, and KB query helper routes. |
| `utils/vectorUtils.js` | Legacy alternate Supabase + Ollama RAG implementation: generates embeddings, RPC-searches Supabase, and calls Mistral directly. Not in the active message path. |
| `utils/test.js` | Manual executable test for that legacy `vectorUtils` pipeline. |
| `testRagClient.js` | Manual executable test for the active FastAPI client. |
| `package.json` | Declares the Node dependencies and `dev` script. `main: index.js` is inaccurate; there is no `index.js`, while the dev script correctly uses `src/server.js`. |
| `package-lock.json` | Locked dependency tree, generated by npm. |

## 8. PostgreSQL data model

`server/config/schema.sql` creates the active relational model:

```text
profiles
  id UUID PK
  email UNIQUE NOT NULL
  password_hash NOT NULL
  name
  role default "user"
  created_at

profiles 1 ──< chat_sessions
                 id UUID PK
                 user_id FK → profiles.id (cascade delete)
                 title default "New Chat"
                 status default "active"
                 created_at / updated_at

chat_sessions 1 ──< messages
                       id UUID PK
                       session_id FK → chat_sessions.id (cascade delete)
                       sender_role
                       content
                       created_at
```

Indexes exist on `chat_sessions.user_id`, `chat_sessions.status`, `messages.session_id`, and `messages.created_at`. The schema does not constrain `sender_role` or `status` to enumerated values; controllers conventionally use `user`/`ai` and `active`/`resolved`.

The server never stores a JWT in PostgreSQL. Passwords are stored only as bcrypt hashes; the plaintext password is not persisted.

## 9. RAG service: document ingestion and answering

### FastAPI entry point

`rag-service/app/main.py` creates `FastAPI(title='AssistIQ RAG Service')`, then eagerly constructs:

- `Ingestion()` → creates `ChromaStore()` → connects to Chroma and creates/reuses collection `assistiq_chunks` with cosine space.
- `RAGPipeline()` → creates `Retriever()` (requires that collection) and `Generator()`.

It makes `rag-service/data/` if missing and exposes:

| FastAPI endpoint | Operation |
|---|---|
| `GET /health` | Returns `{ status: 'ok' }`. |
| `GET /documents` | Lists `.txt` and `.md` files on disk, pairing each file stem with its Chroma chunk count. |
| `POST /ingest` | Resolves a path, ingests it, and returns document ID/name/chunk count. |
| `POST /documents/{document_id}/reingest` | Finds a file whose stem matches, then replaces its chunks. |
| `DELETE /documents/{document_id}` | Deletes vector chunks, then every data file with that stem. |
| `POST /query` | Retrieves nearest chunks and generates an answer. |

### Ingestion path in detail

```text
Admin chooses .txt/.md file
  → browser multipart POST /api/kb/upload
  → Multer stores sanitized filename in rag-service/data
  → Node POSTs { file_path: "data/<filename>", document_id: file stem } to FastAPI /ingest
  → Ingestion.ingest
       → document_loader.load_text_file (UTF-8 / .txt or .md only)
       → chunker.split_sections (Markdown or `Heading:` sections; fallback whole file)
       → chunker.chunk_document
          → 500-character chunks with 100-character overlap within each section
       → ChromaStore.add_chunks
          → delete old chunks with matching document_id
          → call Ollama nomic-embed-text once per chunk
          → upsert chunk text, 768-D vector, and metadata into Chroma
```

Each Chroma metadata object contains `document_id`, `section`, `section_chunk_index`, and `document_chunk_index`. Its ID is deterministic: `<document_id>_chunk_<document_index>`. Re-ingestion removes the old document’s chunks first, avoiding duplicates.

### Answering path in detail

```text
Chat controller or socket handler
  → server/utils/ragClient.queryRAG(question, top_k=5)
  → FastAPI POST /query
  → RAGPipeline.ask
       → Retriever embeds question using Ollama nomic-embed-text
       → Chroma collection.query(..., n_results=top_k)
       → joins returned chunk documents with blank lines
       → Generator sends strict context-only prompt to Ollama mistral
  → { question, answer, context: [chunk text, ...] }
  → Express persists/returns answer
```

`Generator` asks the model to answer only from the retrieved context and say it lacks enough information when context is insufficient. This is prompt guidance, not a hard retrieval score threshold: the current `Retriever` always requests `top_k` nearest chunks and does not filter by distance.

### `rag-service/app/` file inventory

| File | Responsibility |
|---|---|
| `main.py` | FastAPI process, document CRUD endpoints, `/query`. |
| `ingestion.py` | Orchestrates load → sections → chunks → Chroma and delete. |
| `document_loader.py` | Validates `.txt`/`.md` and reads UTF-8 text. |
| `chunker.py` | Section parsing and fixed-size overlapping chunk creation. |
| `embedder.py` | `requests` client for Ollama `/api/embeddings`, model `nomic-embed-text`, 60-second timeout. |
| `chroma_store.py` | Chroma HTTP collection ownership, chunk upsert/delete/count. |
| `retriever.py` | Embeds the user question and runs Chroma nearest-neighbor query. |
| `generator.py` | Sends the context-only prompt to Ollama `/api/generate`, model `mistral`, 120-second timeout. |
| `rag_pipeline.py` | Combines retriever and generator; exposes `ask`. |
| `ingestion_test.py` | Manual loader/section parsing check for `data/handbook.txt`. |
| `chroma_test.py` | Manual Chroma connectivity/count check. |

`rag-service/requirements.txt` pins the Python environment. It includes FastAPI, Uvicorn, ChromaDB, Requests, and their transitive/development packages. `rag-setup-complete.txt` is a setup marker, not executable application code.

## 10. API contract versus frontend declarations

This table highlights discrepancies so a reader knows what will actually execute rather than treating every client helper as live.

| Client declaration | Server reality |
|---|---|
| `healthAPI.check()` → `GET /health` | Works: server mounted health router returns liveness. |
| `healthAPI.getStatus/getDatabase/checkAll()` | **No corresponding Express routes**; each gives 404. |
| `testAPI.testAuth()` → `GET /test/auth` | **No route**; test router has only POST `/user-login` and `/admin-login`. |
| `testAPI.adminLogin()` → `POST /test/admin-login` | Works. |
| `testAPI.testDatabase/testSocket/testEndpoint()` | **No matching routes**. |
| `sessionAPI.getSession/deleteSession/updateSessionTitle()` | **No matching routes**; only create/current/resolve/list are mounted. |
| `kbAPI.resolve(query, context)` | Endpoint works but the server ignores supplied `context`; it only destructures `query` and reruns RAG. |
| KB router comment says search/resolve are auth-only | Actual router applies **no auth middleware** to them. |
| `authAPI.logout()` | Only local token removal; it does not invoke server logout. |
| Client Socket fallback | Defaults to port `5001`, whereas the Node server defaults to `5180`; deployment needs `VITE_SOCKET_URL`. |

## 11. Security boundaries and current behavior

| Boundary | Current implementation |
|---|---|
| Password | bcrypt hash at cost 12; account lookup uses normalized lowercase email. |
| HTTP auth | JWT in `Authorization` header, verified on protected routes. |
| Socket auth | Same JWT verified at connection handshake. |
| Admin access | JWT role checked client-side for navigation and server-side for protected admin routes. |
| Data ownership | Chat history/send/resolve query session owner before acting. Admin list intentionally spans all users. |
| File uploads | Admin-only, `.txt`/`.md` filter, 25 MiB Multer cap, sanitized disk filename. |
| Browser token | Stored in localStorage. It survives refresh but would be readable by injected JavaScript in an XSS compromise. |
| Logout | Browser-only removal; copied JWT remains valid until its one-hour expiry. |
| RAG helper endpoints | `/api/kb/search` and `/api/kb/resolve` currently lack authentication despite comments saying otherwise. |

## 12. Configuration, build, and documentation files

| File | Role |
|---|---|
| `client/package.json` | Client scripts/dependencies: Vite, React, router, Axios, Socket.IO client, Lucide, ESLint. |
| `client/package-lock.json` | Locked client dependency tree. |
| `client/.env` | Current browser endpoint overrides; see the port/security note in [What starts what](#2-what-starts-what). |
| `client/.gitignore` | Ignores Vite output, dependencies, editor files, logs, and `.env`. |
| `client/vite.config.js` | Enables React Vite plugin; no proxy is configured. Hence browser calls need `VITE_API_URL` and Express CORS must allow the browser origin. |
| `client/eslint.config.js` | Flat ESLint configuration for JS/JSX and React hooks/Fast Refresh. |
| `server/package.json` | Server dependencies and nodemon dev command. |
| `server/package-lock.json` | Locked server dependency tree. |
| `server/.gitignore` | Ignores `node_modules`. There is no checked-in server `.env`; it is expected locally by the server. |
| `rag-service/.gitignore` | Ignores Python caches/environments, secrets, logs, and local `data/` documents. |
| `docker-compose.yml` | Local infrastructure definitions and persistent volumes. |
| `README.md` | User-facing project overview, prerequisites, local setup, configuration, and main usage routes. |
| `LICENSE` | MIT license text. |

## 13. End-to-end sequences

### A. First visit / sign in

```text
Vite serves index.html
  → main.jsx mounts AuthProvider + App
  → AuthProvider reads localStorage token
     ├─ absent: App sends visitor to /auth
     └─ present: GET /api/auth/profile
          ├─ valid: store profile, attempt Socket.IO, route according to role
          └─ invalid/expired 401: Axios clears token, context becomes signed out
```

### B. An ordinary support question using real-time transport

```text
ChatPage → session current/create → history
  → send_message (Socket.IO)
  → Node validates JWT then session ownership/status
  → PostgreSQL INSERT user message
  → Node POST FastAPI /query
  → FastAPI embeds question in Ollama
  → Chroma returns nearest text chunks
  → Mistral generates context-grounded answer in Ollama
  → PostgreSQL INSERT AI message
  → Node emits receive_message → ChatPage renders it
```

### C. Same question when Socket.IO is unavailable

```text
ChatPage detects no connected socket
  → POST /api/chat/send/:sessionId
  → same validation, PostgreSQL persistence, FastAPI/Chroma/Ollama RAG work
  → JSON { status: "success", response: "..." }
  → ChatPage appends the response locally
```

### D. An admin uploads a handbook

```text
KBUploadPage file input
  → multipart POST /api/kb/upload (Bearer JWT)
  → authMiddleware → adminMiddleware → Multer
  → file lands in rag-service/data
  → kbController POSTs FastAPI /ingest
  → loader → section splitter → 500/100 chunker
  → Ollama embeddings → Chroma upsert
  → success JSON flows back to page → page refreshes documents list
```

## 14. Legacy, mismatched, or unreachable code

These items are intentionally called out because they affect maintenance decisions:

1. `server/utils/vectorUtils.js` and `server/config/supabase.js` implement an older Supabase/pgvector route. The active API and chat route call `ragClient.js` and FastAPI/Chroma instead. Running `server/utils/test.js` requires Supabase credentials; normal server start does not import this chain.
2. Earlier project material described a Supabase/pgvector setup. Current message/session/profile code uses PostgreSQL, while knowledge base code uses local files + ChromaDB; neither requires Supabase in the normal runtime path.
3. `docker-compose.yml` starts Redis, but no JavaScript or Python source imports/contacts Redis.
4. Several frontend helpers advertise nonexistent routes, listed in [API contract versus frontend declarations](#10-api-contract-versus-frontend-declarations). The current rendered UI avoids the unsupported session and health/test helpers.
5. `client/api/index.js`’s `initializeApp()` is never called; the real initialization is `AuthProvider`.
6. `server/package.json` names `index.js` as its main file, but the actual runtime entry is `src/server.js` through `npm run dev`.
7. `client/config/supabase.js` is absent from the working tree while Git reports it as deleted. No remaining client source imports it.
8. Existing modified/uncommitted files are part of the workspace state. This architecture document describes their current contents rather than assuming the last commit is authoritative.

## 15. Directory layout at a glance

```text
AssistIQ/
├── client/                    React/Vite browser application
│   ├── api/                   Axios API contract and token utilities
│   ├── public/                Public logo and starter asset
│   ├── socket/                Socket.IO singleton
│   └── src/                   React entry, routes, pages, context, components, CSS
├── server/                    Express + Socket.IO API server
│   ├── config/                PostgreSQL schema/pool; legacy Supabase config
│   ├── controllers/           HTTP request operations
│   ├── middleware/            JWT, admin, upload enforcement
│   ├── routes/                URL-to-controller wiring
│   ├── sockets/               Socket.IO authentication/events
│   ├── src/                   Node entry point
│   └── utils/                 RAG HTTP client + legacy vector utility
├── rag-service/               Python FastAPI RAG microservice
│   └── app/                   Ingestion, vector store, retrieval, generation
├── docker-compose.yml         PostgreSQL / Redis / Chroma containers
└── architecture.md            This architecture map
```

## 16. The shortest mental model

**The frontend never talks directly to PostgreSQL, ChromaDB, Ollama, or FastAPI.** It only uses Express HTTP and Socket.IO. Express owns identity and chat persistence. It delegates KB/document and answer work to the FastAPI RAG service. FastAPI owns document files, Chroma vectors, and calls to Ollama. PostgreSQL owns users, sessions, and durable message history.

That is the real runtime call hierarchy:

```text
React page → client API/socket module → Express route/socket handler
           → PostgreSQL (identity/session/messages)
           → FastAPI RAG service → ChromaDB + Ollama
           ← answer back through Express → page state/UI
```

## 17. Current implementation notes and recommended priorities

### Audit basis and status

This is a static source-code audit, not proof that Docker, PostgreSQL, FastAPI, ChromaDB, or Ollama were running at the time of review. The active design is now coherent at the code-path level: React uses Express-issued JWTs; Express owns profiles/sessions/messages and delegates RAG work to FastAPI; FastAPI uses Chroma and Ollama. The older audits that described active Supabase Auth, a Node-to-Chroma port collision, and no file ingestion are historical and no longer describe the current code.

The project is suitable for local development after its services and environment are configured. It is not production-ready yet because important access-control, reliability, observability, and automation controls are absent.

### Findings

| Priority | Finding | Evidence / consequence |
|---|---|---|
| P0 | Client endpoint mismatch | The checked-in client environment points API and Socket.IO to `:5001`, while Express defaults to `:5180`. A default local startup will call the wrong port unless configuration is aligned. |
| P0 | Unauthenticated inference and token-issuing test paths | `POST /api/kb/search`, `POST /api/kb/resolve`, and both `/api/test/*-login` routes have no auth or rate limit. Search/resolve can consume local inference resources; test login returns a usable token. Remove or protect test routes outside development and add authentication/rate limits. |
| P0 | FastAPI ingestion endpoint trusts a caller-provided path | `POST /ingest` accepts `file_path` and may read any path that exists on the host. Node sends a safe `data/<filename>` path, but the FastAPI endpoint itself has no authentication or containment enforcement. Bind it to a private network and reject paths outside `rag-service/data`. |
| P1 | Loose Socket.IO origin policy | Express CORS permits only `http://localhost:5173`, but Socket.IO uses `origin: '*'`. Configure an explicit allow-list for both transports. |
| P1 | No rate limits, input-size limits, or request validation schema | Login, message, KB, and generation endpoints rely on ad hoc checks. Unbounded or repeated requests can exhaust the local LLM or storage. |
| P1 | Incomplete failure atomicity | HTTP chat writes the user message before RAG. If RAG fails, the request returns 500 and no AI row is written. Upload writes the file before ingestion, so a failed ingest leaves a pending physical file. Make these states explicit or use transactions/jobs. |
| P1 | RAG lacks relevance gate and citations | Retrieval always provides nearest chunks; no similarity threshold, source IDs, citations, reranking, or answer-quality checks reach the browser. Unsupported answers remain possible despite the prompt. |
| P1 | Blocking serial ingestion and sync | Each chunk is embedded synchronously and sync re-ingests documents one-by-one in an HTTP request. Large documents can exceed browser/proxy timeouts and tie up workers. |
| P1 | No automated test suite | `npm test` intentionally fails and the Python/Node test files are manual smoke scripts. Auth, ownership, route contracts, RAG failure cases, and document lifecycle can regress silently. |
| P2 | Operational gaps | Health reports only Express liveness; logs are console-only; there are no request IDs, metrics, readiness checks, migrations, queue/jobs, or production deployment configuration. |
| P2 | Maintenance drift | Redis is unused; legacy Supabase utilities remain; some client helpers name nonexistent endpoints; server `main` points to nonexistent `index.js`; no current UI calls `initializeApp()`. |
| P2 | Filename/document-ID collisions | Upload storage and Chroma document IDs are both based on a sanitized filename stem. Uploading a same-named file overwrites/replaces the existing document rather than creating a versioned record. |

### Recommended order of work

1. Align `client/.env` with the actual Express port, move `ADMIN_SIGNUP_CODE` to `server/.env`, and make the browser origin/socket origin configuration explicit.
2. Protect or remove `/api/test/*`, authenticate and rate-limit KB query helpers, and restrict FastAPI to internal callers and paths under `rag-service/data`.
3. Add request schemas, body/message size limits, secure error handling, and integration tests for authentication, roles, ownership, endpoint contracts, and socket status.
4. Make document ingestion asynchronous with durable status, retries, unique/versioned document IDs, and cleanup/rollback semantics.
5. Improve RAG quality with metadata filters, similarity thresholding, source/citation data, bounded context, evaluation fixtures, and optionally reranking.
6. Add database migration tooling, dependency-aware readiness checks, structured logs/metrics, and a production deployment plan. Remove Redis and legacy Supabase code only after confirming they are not required by any deployment.
