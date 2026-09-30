# 1. Executive Summary

This is a small Node.js/Express API with Supabase-backed authentication and database access, Socket.IO chat, and a text-entry knowledge base that calls a locally hosted Ollama instance for embeddings and generation.

It is **not a document-ingestion RAG system**: there is no file upload, parser, OCR, or chunking pipeline. Knowledge-base entries are manually submitted as title/content records and embedded as one vector each. Retrieval is intended to use Supabase PostgreSQL with pgvector, but the repository’s setup SQL defines a different RPC function and argument names than the application calls. Whether a separately configured live database happens to provide the expected function is **unknown**.

The largest concerns are:

- The server’s configured Supabase key in the inspected local environment appears to be a **publishable key**, not a service-role key. The server Supabase client does not forward the authenticated user’s JWT to its database queries. Under the RLS policies documented in the README, many server-side reads and writes are therefore likely to fail.
- The README’s database setup SQL allows profile owners to update their own profile, while a trigger copies role changes into auth metadata. If deployed as written, this appears to permit self-promotion to admin.
- Public knowledge-base search and generation routes, plus public test login routes, have no authentication or rate limiting.
- Socket.IO permits wildcard origins. The Express API only allows a localhost frontend origin.
- No production deployment, test suite, migration system, structured logging, rate limiting, or background workers are present.

No files were modified and no application tests were run. Runtime behavior requiring a live Supabase project or Ollama instance is marked **UNKNOWN**.

**Status terms:** Implemented and working means the code path is present and internally connected; it does not mean external services were available to verify at runtime. Incomplete means an implementation exists but lacks important behavior or configuration. Problematic means code or documented configuration has a concrete flaw. Placeholder/stub means the endpoint or behavior is mostly a placeholder. Not implemented means no corresponding code was found. Unknown means the repository cannot establish the live-system behavior.

# 2. Current Technology Stack

| Area | Current implementation |
|---|---|
| Backend runtime | Node.js, CommonJS modules; README requires Node 18+, but `package.json` does not declare an engine version |
| HTTP framework | Express 5 |
| Realtime | Socket.IO 4 |
| Database | Supabase-hosted PostgreSQL, according to the README; actual remote schema and policies are **UNKNOWN** |
| Vector storage | pgvector in the same PostgreSQL database, documented as `VECTOR(768)`; no separate vector database |
| Embeddings | Ollama HTTP API, hardcoded model `nomic-embed-text`; code checks for 768 dimensions |
| LLM | Ollama HTTP API, hardcoded model `mistral` |
| OCR/document processing | None found. **OCR is NOT currently implemented.** |
| Authentication | Supabase Auth email/password; Bearer access tokens verified using `supabase.auth.getUser(token)` |
| External services | Supabase Auth/PostgREST/RPC; a local Ollama server at `http://localhost:11434` |
| Deployment | Local development instructions only; no Docker, Compose, migration, CI, or production server configuration found |

The server-side Supabase client is created in [server/config/supabase.js](server/config/supabase.js). Embedding, search, and generation calls are in [server/utils/vectorUtils.js](server/utils/vectorUtils.js). The README’s technology and schema descriptions are documentation, not evidence of the current live Supabase configuration: [README.md](README.md).

# 3. Repository Structure

```text
AssistIQ/
├── LICENSE
├── README.md
├── client/
│   ├── .env
│   ├── package.json
│   ├── api/
│   │   ├── api.js
│   │   ├── auth.js
│   │   ├── chat.js
│   │   ├── health.js
│   │   ├── index.js
│   │   ├── kb.js
│   │   ├── session.js
│   │   └── test.js
│   ├── config/supabase.js
│   ├── socket/socket.js
│   └── src/
│       ├── App.jsx, App.css, index.css, main.jsx
│       ├── components/
│       ├── contexts/
│       └── pages/
└── server/
    ├── .env
    ├── .gitignore
    ├── package.json
    ├── config/supabase.js
    ├── controllers/
    │   ├── authController.js
    │   ├── chatController.js
    │   ├── kbController.js
    │   ├── sessionController.js
    │   ├── supabaseController.js
    │   └── testController.js
    ├── middleware/
    │   ├── adminMiddleware.js
    │   └── authMiddleware.js
    ├── routes/
    │   ├── authRouter.js
    │   ├── chatRouter.js
    │   ├── healthRouter.js
    │   ├── kbRouter.js
    │   ├── sessionRouter.js
    │   ├── supaRouter.js
    │   └── testRouter.js
    ├── sockets/socket.js
    ├── src/server.js
    └── utils/
        ├── test.js
        └── vectorUtils.js
```

There are no backend migrations, database model/schema files, dedicated service layer, document-processing modules, test directory, Docker files, Compose files, or deployment manifests in the inspected structure. `node_modules` exists locally but is excluded from this source inventory.

The active server entry point is [server/src/server.js](server/src/server.js), not the `main` path declared by the server package manifest. Its routes are mounted under `/api`.

# 4. Current Architecture

```text
React client
   ├── Supabase JS ──────────────────────────────> Supabase Auth
   ├── Axios + Bearer token ──────────────────────> Express API
   └── Socket.IO + auth token ────────────────────> Socket.IO server
                                                       │
                                  ┌────────────────────┴───────────────────┐
                                  │                                        │
                           Auth/session/chat                    KB/search/generation
                                  │                                        │
                                  └──────────────> Supabase <──────────────┘
                                                   PostgreSQL
                                                   pgvector (documented)
                                                      ▲
                                                      │ RPC search
                                                      │
                                              Ollama local HTTP
                                           embeddings + Mistral chat
```

There is no distinct service layer: route files connect directly to controllers, and the KB controller calls `vectorUtils` and Supabase. The HTTP entry point and route mounts are in [server/src/server.js](server/src/server.js).

| Component | Responsibility and flow | Inputs/outputs and dependencies |
|---|---|---|
| Server bootstrap | Creates Express and HTTP servers, installs CORS/body parsers, mounts routes, creates Socket.IO, listens on `PORT` | Depends on environment and all routers; calls `startupCheck()` without awaiting it |
| Supabase config | Creates one shared Supabase client | Requires `SUPABASE_PROJECT_URL` and `SUPABASE_SECRET_KEY`; all database/auth controllers import it |
| Auth middleware | Reads Bearer token, asks Supabase Auth to validate it, attaches user to `req.user` | Input: `Authorization`; output: request user or 401/500; [server/middleware/authMiddleware.js](server/middleware/authMiddleware.js) |
| Admin middleware | Validates token, queries profile role, falls back to app metadata, requires role `admin` | Input: Bearer token; output: authorized request or 401/403/500; [server/middleware/adminMiddleware.js](server/middleware/adminMiddleware.js) |
| Session controller | Creates/resolves sessions and lists the caller’s current session or all sessions for admins | Supabase `chat_sessions`; [server/controllers/sessionController.js](server/controllers/sessionController.js) |
| Chat controller | Checks ownership, persists messages, calls KB search and generation, returns or stores AI response | Supabase `chat_sessions`/`messages`, KB controller; [server/controllers/chatController.js](server/controllers/chatController.js) |
| KB controller | CRUD for text entries, calls embedding generation, performs retrieval, forwards resolution to LLM | `knowledge_base`, Ollama, RPC; [server/controllers/kbController.js](server/controllers/kbController.js) |
| Vector utilities | Generates embeddings, invokes the database RPC, calls Ollama chat | Hardcoded Ollama URL/models; [server/utils/vectorUtils.js](server/utils/vectorUtils.js) |
| Socket handler | Authenticates socket connections and processes `send_message` events | Supabase ownership lookup, message persistence, KB functions; [server/sockets/socket.js](server/sockets/socket.js) |
| Health/schema handlers | Basic process liveness and database table-access checks | Public routes; [server/controllers/supabaseController.js](server/controllers/supabaseController.js) |

Errors are generally caught in individual controller methods and converted to JSON or socket errors. There is no centralized error handler, request validation framework, or service abstraction.

# 5. API Inventory

The following are the **22 Express routes actually mounted**. Request/response shapes are inferred from the implementation; there are no formal request schemas or OpenAPI definitions.

| Method | Endpoint | Purpose | Auth | Request | Response | Implementation Status |
|---|---|---|---|---|---|---|
| POST | `/api/auth/register` | Supabase signup | None | `{email,password,name?}` | 201 `{message,user}` | Implemented; basic required-field checks |
| POST | `/api/auth/login` | Supabase password login | None | `{email,password}` | `{message,user,access_token}` | Implemented; no local input validation |
| GET | `/api/auth/profile` | Return current user basics | Bearer | None | `{id,email,name,role}` | Implemented |
| POST | `/api/auth/logout` | Acknowledge logout | Bearer | None | `{message}` | Placeholder; does not revoke session |
| GET | `/api/chat/:id` | Read session messages | Bearer + ownership | Path session ID | `{status,data}` | Implemented, unpaginated |
| POST | `/api/chat/send/:id` | Send a message and generate a reply | Bearer + ownership + active session | `{message}` | `{status,response}` | Implemented, synchronous request path |
| POST | `/api/kb/add` | Add KB entry | Admin | `{title,content,type,metadata?}` | 201 `{status,message,data}` | Implemented for text entries |
| GET | `/api/kb/entries` | List KB entries | Admin | None | `{status,entries}` | Implemented, unpaginated |
| POST | `/api/kb/entry` | Add KB entry (alternate route) | Admin | Same as `/add` | Same as `/add` | Implemented duplicate route |
| PUT | `/api/kb/entry/:id` | Update KB entry and possibly re-embed | Admin | Partial `{title?,content?,type?,metadata?}` | `{status,message,data}` | Implemented, validation incomplete |
| DELETE | `/api/kb/entry/:id` | Delete KB entry | Admin | Path ID | `{status,message}` | Implemented |
| POST | `/api/kb/sync` | Re-embed all KB entries | Admin | None | `{status,message,synced}` | Implemented but serial, unbounded |
| POST | `/api/kb/search` | Embed query and retrieve results | **None** | `{query}` | `{status,context}` | Implemented; RPC compatibility unverified |
| POST | `/api/kb/resolve` | Generate from caller-supplied context | **None** | `{query,content}` | `{status,result}` | Implemented but publicly callable |
| POST | `/api/session/create` | Resolve prior active sessions and create one | Bearer | None | `{status,data}` | Implemented; non-transactional |
| GET | `/api/session/current` | Get latest active session | Bearer | None | `{status,data|null}` | Implemented |
| GET | `/api/session/` | List all sessions | Bearer + admin | None | `{status,sessions}` | Implemented, unpaginated |
| POST | `/api/session/resolve` | Resolve an owned session | Bearer + ownership | `{session_id}` | `{status,data}` | Implemented |
| GET | `/api/health/` | Basic process liveness | None | None | `{message}` | Implemented as liveness only |
| GET | `/api/test-supabase` | Check table accessibility | None | None | `{status,message,tables}` | Diagnostic endpoint exposed publicly |
| POST | `/api/test/user-login` | Login and return token for testing | None | `{email,password}` | `{user,token}` | Diagnostic endpoint; sensitive/public |
| POST | `/api/test/admin-login` | Login and report admin metadata | None | `{email,password}` | `{is_admin,user,token}` | Diagnostic endpoint; sensitive/public |

Route definitions are in [server/routes/authRouter.js](server/routes/authRouter.js), [server/routes/chatRouter.js](server/routes/chatRouter.js), [server/routes/kbRouter.js](server/routes/kbRouter.js), [server/routes/sessionRouter.js](server/routes/sessionRouter.js), [server/routes/healthRouter.js](server/routes/healthRouter.js), [server/routes/supaRouter.js](server/routes/supaRouter.js), and [server/routes/testRouter.js](server/routes/testRouter.js).

**Validation, statuses, and notable endpoint issues:**

- Auth signup returns 400 for missing email/password or Supabase errors, 201 on success, and 500 on caught failure. Login does not check required fields before calling Supabase; it returns 401 for Supabase errors and 500 for caught exceptions.
- Chat reads return 404 for missing session, 403 for another user’s session, and 500 for database errors. Sending checks non-empty message, ownership, and active status; it returns 400 for a resolved session. It persists the user message before retrieval/generation, so later failures can leave an unmatched user message.
- KB create validates title/content/type and allows only `instruction` and `qa`; metadata must be a non-array object. Update validates type but does not validate metadata/title/content as thoroughly. Search requires non-empty query. Resolve requires string `query` and `content`.
- `POST /api/kb/resolve` has no auth middleware despite comments/client assumptions. The client sends a `context` property rather than the server-required `content`, so the provided client helper does not match this endpoint’s request contract: [client/api/kb.js](client/api/kb.js).
- KB update may fail to fetch the current entry while regenerating a partial update; that fetch error is ignored and missing values can be embedded as empty strings. Delete reports success even if no matching row was deleted, if the database returns no error.
- Session creation updates existing active sessions and inserts a new one in separate operations. Concurrent requests can leave multiple active sessions. Admin session and KB listings have no pagination.
- Socket chat checks session ownership but does **not** check that the session is active; HTTP chat does.
- The client advertises routes not present on the server: health `/status`, `/database`, `/all`; session `GET /:id`, `DELETE /:id`, `PATCH /:id`; test `/auth`, `/database`, `/socket`. Client helpers for these will 404. See [client/api/health.js](client/api/health.js), [client/api/session.js](client/api/session.js), and [client/api/test.js](client/api/test.js).
- The README’s chat route documentation also differs from the mounted paths. Its API list should not be treated as the source of truth: [README.md](README.md).

# 6. Document Ingestion Pipeline

There is **no document-upload ingestion pipeline**.

The actual knowledge-entry flow is:

1. Admin sends JSON `{title,content,type,metadata?}` to `/api/kb/add` or `/api/kb/entry`.
2. `addKbContent` validates required fields and allowed type.
3. `generateEmbedding` embeds the concatenated string `${title} ${content}`.
4. The controller inserts title, content, type, metadata, and vector into `knowledge_base`.

This is implemented in [server/controllers/kbController.js](server/controllers/kbController.js) and [server/utils/vectorUtils.js](server/utils/vectorUtils.js).

| Requested stage | Actual status |
|---|---|
| Document upload / multipart handling | Not implemented |
| File size, MIME, extension validation | Not implemented |
| File type detection | Not implemented |
| Text extraction | Not implemented |
| OCR | Not implemented |
| Cleaning / normalization | Not implemented |
| Document metadata extraction | Not implemented; caller can supply arbitrary JSON metadata |
| Chunking | Not implemented; one KB entry is embedded as one text |
| Embedding | Implemented for a text entry |
| Vector storage | Implemented as an embedding column write, contingent on database schema/RLS |

No PDF, scanned PDF, DOCX, TXT file, HTML, image, PPTX, or CSV file parser is implemented. A user can paste text into a KB entry, but that is not file-format support.

# 7. OCR Pipeline

**OCR is NOT currently implemented.**

No OCR engine, PDF renderer, image preprocessor, rotation/deskew logic, language selection, confidence scoring, or OCR error handling was found. OCR dependencies are also absent from the server manifest. The entry point and backend modules contain no document/image-processing path: [server/package.json](server/package.json), [server/controllers/kbController.js](server/controllers/kbController.js).

# 8. Document Parsing

No document parser is implemented. The application stores text submitted directly in a JSON request.

There is no parser for PDF, DOCX, HTML, image, PPTX, or CSV, and no handling for page boundaries, tables, headers/footers, hyperlinks, layout, or embedded images. Consequently, the system does not preserve page numbers, headings, source filenames, section titles, or paragraph boundaries from source documents.

RAG suitability is limited to manually curated text entries. The code does not enrich or validate their structure.

# 9. Chunking

Chunking is **not implemented**. No token/character chunk sizes, overlap, recursive splitting, sentence splitting, semantic splitting, or page/heading-aware logic exists.

Each entry’s title and entire content are concatenated and embedded as a single string. There is no chunk-level metadata or parent/child relationship. Long content may exceed the embedding model’s useful input length; truncation behavior is not controlled by this code.

Illustrative flow of the actual implementation:

```text
Admin entry:
  title = "Returns"
  content = "Returns are accepted within 30 days..."

Embedding input:
  "Returns Returns are accepted within 30 days..."

Stored:
  one knowledge_base row + one 768-dimensional embedding
```

The example reflects the concatenation performed in [server/controllers/kbController.js](server/controllers/kbController.js); no chunk records are created.

# 10. Embeddings

`generateEmbedding(text)` calls `POST http://localhost:11434/api/embeddings` with model `nomic-embed-text` and the text as `prompt`. It expects `data.embedding` to have exactly 768 elements and throws otherwise. This is in [server/utils/vectorUtils.js](server/utils/vectorUtils.js).

- **Model/provider:** Ollama local server, `nomic-embed-text`.
- **Dimensions:** Code enforces 768. Actual live model output was not tested.
- **Execution:** Each API request waits for generation; network I/O uses asynchronous `fetch`.
- **Batching/caching:** None. Bulk sync embeds entries sequentially.
- **Normalization:** No application-side vector normalization.
- **Timeout:** Embedding fetch has a 15-second abort timeout.
- **Error handling:** Embedding network/status/dimension failures throw; controller responses vary between generic and exposed messages.
- **GPU/CPU:** Configured outside this repository; **unknown**.

Embedding calls occur during KB create, content/title update, and admin sync. Query embedding occurs in `_searchKb`. The RPC call then passes the vector as `query_embedding`; there is no separate vector service.

# 11. Vector Database

The intended vector store is PostgreSQL/pgvector in Supabase—not a standalone vector database. The README SQL documents `knowledge_base.embedding VECTOR(768)`, cosine-distance indexing, and an RPC named `match_documents`: [README.md](README.md).

The application instead calls RPC `search_knowledge_base` with arguments `query_embedding` and `top_k`: [server/utils/vectorUtils.js](server/utils/vectorUtils.js). The repository contains no definition of `search_knowledge_base`; the README defines `match_documents(query_embedding, match_count, filter_type)`. **This is a concrete repository-level incompatibility:** a database created from the documented SQL will not provide the RPC that the application calls, absent an untracked/manual database function.

Other observed behavior:

- Inserts and updates store vectors directly on `knowledge_base`.
- Retrieval default `topK` is 5.
- No similarity threshold is applied in application code.
- No namespace, tenant, user, or document-owner filtering is applied.
- Updates regenerate the vector when title/content is changed.
- Deletes remove the knowledge-base row; there is no document-to-chunk propagation because documents/chunks do not exist.
- Duplicate detection/upsert behavior is absent.
- Actual live schema, indexes, RPC, persistence, and policies are **UNKNOWN**.

The README includes a vector cosine index and GIN text indexes, but application retrieval does not invoke those GIN indexes or keyword search. The README’s setup SQL also ends with an apparently stray `$$;` after the final update, which would make the pasted SQL invalid as written. It is documentation, not a migration system.

# 12. Retrieval

The path is:

1. `_searchKb(query)` trims and embeds the query.
2. In parallel, it calls the vector RPC and fetches **all** `instruction` entries.
3. It removes instruction IDs already in vector results.
4. It returns `{instructions, relevant}`.
5. Chat serializes that object to JSON and passes it to generation.

This is in [server/controllers/kbController.js](server/controllers/kbController.js).

Implemented: intended dense semantic retrieval via pgvector and a separate fetch of all instruction entries. The result limit is 5 for vector search by default. Actual retrieval success is **unknown** because the RPC function name/arguments conflict with the README setup.

Absent: keyword search in application code, hybrid retrieval, query expansion, multiple-query retrieval, metadata filters, similarity threshold, reranking, contextual compression, parent-child retrieval, and recursive retrieval. No relevance evaluation is performed.

# 13. Reranking

Reranking is **absent**. Search results are used directly; there is no reranking model, scoring stage, top-N selection after reranking, or reranker integration point.

# 14. LLM / Generation

`resolveQuery(query, content)` calls `POST http://localhost:11434/api/chat` using model `mistral`, `stream: false`, and two messages:

- **System:** A fixed customer-support instruction containing interpolated context, requests concise/professional answers, says to refer only to supplied context, and prohibits internet scavenging.
- **User:** The raw query.

The actual prompt template and request are in [server/utils/vectorUtils.js](server/utils/vectorUtils.js).

There is no conversation history, explicit temperature, max token setting, token counting, context-window management, retry, rate-limit handling, or LLM timeout. The embedding endpoint has a timeout; the chat endpoint does not. A failed HTTP status throws. If the response lacks `message.content`, the code returns a generic fallback string.

The prompt’s “only use context” wording is an instruction, not a grounding guarantee. There is no enforcement or faithfulness check.

# 15. RAG Grounding & Citations

There are no source citations, page references, citation IDs, evidence extraction, answer verification, relevance threshold, or faithfulness checks.

The model receives JSON-serialized retrieved objects, which may contain IDs, titles, and content. The prompt does not require citation of those IDs or validate citations in the answer. It does not explicitly define an “I don’t know” policy.

Expected behavior based on code:

1. **Relevant information exists:** Top vector results plus nonduplicate `instruction` entries are passed to Mistral, assuming RPC works.
2. **No relevant information:** Instructions may still be supplied; if there are no instructions/results, the model is still called with empty context. There is no refusal gate.
3. **Poor results:** No threshold or relevance check; results are passed through.
4. **Conflicting documents:** No conflict detection or precedence policy.
5. **Unrelated question:** The model is still called; the prompt asks it to use only supplied context but does not enforce abstention.

On Socket.IO only, retrieval errors are logged and swallowed; generation proceeds with an empty context. HTTP chat instead catches the failure and returns 500. These behaviors are visible in [server/sockets/socket.js](server/sockets/socket.js) and [server/controllers/chatController.js](server/controllers/chatController.js).

# 16. Conversation / Memory

Conversation persistence exists, but conversational RAG/memory does not.

- Messages are stored in `messages` under a `session_id`.
- `GET /api/chat/:id` retrieves ordered messages after checking session ownership.
- New requests do not load prior messages for prompt construction.
- The LLM receives only the current query and current retrieval context.
- No session summary, history window, previous-question retrieval, or context-window management exists.

Thus, previous messages are available for display but do not influence the next answer. See [server/controllers/chatController.js](server/controllers/chatController.js) and [server/sockets/socket.js](server/sockets/socket.js).

# 17. Database

The only database client in source is Supabase JS. The README documents four PostgreSQL tables:

| Table | Documented role |
|---|---|
| `profiles` | User name/email/role, keyed to auth user |
| `chat_sessions` | User-owned sessions and status |
| `messages` | Messages associated with a session |
| `knowledge_base` | Text entries and pgvector embedding |

The actual database schema is not present as migrations and cannot be independently verified. The schema/policies in [README.md](README.md) are setup instructions, not evidence that they are deployed.

CRUD/query operations are distributed across the auth, chat, session, KB, and Supabase controllers. Supabase’s query builder is used rather than dynamically assembled SQL. The vector search is an RPC. No transaction boundaries or pooling configuration are defined in this repository.

Potential inefficiencies and consistency risks:

- Session resolution and creation are separate non-transactional operations.
- Chat persists the user message before the costly model work; failures can leave partial conversations.
- `syncEmbeddings` fetches all entries and embeds them sequentially, without paging or retry.
- Session/message/KB reads are unpaginated.
- `_searchKb` fetches every instruction entry on each query.
- The README documents indexes for sessions, messages, vector, and text search, but the application’s actual query plan and deployed indexes are **unknown**.
- No indexes are documented for the `type` filter used to fetch instructions.
- No migration or rollback mechanism exists.

# 18. Authentication & Authorization

Supabase Auth handles email/password signup and login. The frontend also signs in directly through Supabase; backend auth routes exist independently. API auth middleware validates the Bearer token by calling Supabase Auth and attaches the returned user.

Authorization observed:

- Profile and logout: authenticated user.
- Chat read/send: authenticated plus application-level session ownership check.
- Session create/current/resolve: authenticated; resolve checks ownership.
- Session list: authenticated and admin.
- KB create/list/update/delete/sync: admin.
- KB search/resolve: **public**, not authenticated.
- Test login endpoints and schema test endpoint: public.
- Socket handshake: token required; message handler checks session ownership.
- No endpoint in this server assigns admin roles.

Role checks are inconsistent: `adminMiddleware` queries `profiles.role` and falls back to `app_metadata.role`; `getProfile` reads app metadata only; Socket.IO stores only app metadata role; test admin login checks app metadata only.

Security concerns:

- Auth middleware exposes the underlying Supabase error message as `details`.
- Public login/test login endpoints have no rate limiting.
- Test login endpoints return access tokens and full user objects.
- The README’s profile update RLS policy allows users to update their own profile without restricting columns. Its trigger copies role changes to auth metadata. If deployed as written, this appears to allow a user to set their own role to admin. The live policy is **unknown**.
- The server Supabase client uses a key loaded from `SUPABASE_SECRET_KEY`, but the inspected local value has a `sb_publishable_`-style prefix, not a service-role-style key. The name of the environment variable does not make it privileged.

# 19. Security

| Area | Finding |
|---|---|
| Secrets | No confirmed service-role secret was found in the inspected server configuration; the local server key appears publishable. The tracked client `.env` contains the public Supabase URL/anon key, which is normally intended for browser use. `client/.gitignore` does not exclude `.env`; `git ls-files` confirms `client/.env` is tracked. Do not put secret keys there. |
| Supabase DB authorization | The backend Supabase client is initialized with the configured key and does not forward each request’s user token on database operations. Auth token validation and DB authorization are separate. Under the README RLS rules, server PostgREST requests may execute as anon and be blocked. Actual behavior depends on live credentials/policies and is **unknown**. |
| CORS | Express allows only `http://localhost:5173`, which blocks typical deployed frontends unless changed. Socket.IO allows `"*"` origins. |
| Public endpoints | `/api/kb/search`, `/api/kb/resolve`, `/api/test-supabase`, and test login routes are public. No rate limits exist. |
| File upload | No upload route exists, so upload-specific path traversal/MIME controls are not applicable yet. |
| Input validation | Some required fields and types are checked, but there is no schema validation, maximum text length beyond parser defaults, or consistent UUID validation. |
| Request size | `express.json()` is installed without an explicit size limit; Express/body-parser defaults apply. No explicit multipart limit exists. |
| Prompt injection | KB text is inserted into the system prompt without a trust boundary or prompt-injection mitigation. `/resolve` accepts arbitrary public caller-supplied context. |
| Tenant/data isolation | Retrieval is global across the KB; there is no tenant or document ownership filter. Session ownership is checked in application code, but database RLS configuration is unverified. |
| Errors | Some auth failures expose provider detail. Most controllers return generic errors, but behavior is inconsistent. |
| SQL injection | No direct user-built SQL strings were found. The RPC SQL definition is only documented in README; the live function cannot be audited here. |
| SSRF/command injection | No user-controlled URL fetch or shell execution was found. Ollama URL is hardcoded. |
| Dependencies | No dependency vulnerability scan was performed; the repository does not provide a security audit result. |
| Debug/docs | No Swagger/docs endpoint or explicit debug mode was found; public diagnostic endpoints remain. |

RAG-specific: uploaded-document prompt injection is not applicable because uploads do not exist, but **indirect prompt injection through KB text is possible**. There is no tenant filter, document authorization filter, poisoned-content detection, or separation between trusted instructions and untrusted knowledge content.

# 20. Error Handling

There is no global exception/error middleware or custom exception hierarchy. Controllers generally use `try/catch` and send JSON errors.

Observed weaknesses:

- `authController.register` and `login` use catch blocks without logging the exception.
- Auth middleware includes provider error details in 401 responses.
- `_searchKb` errors are swallowed by Socket.IO; it continues to generate using an empty context.
- HTTP chat returns a generic 500 on downstream errors after potentially persisting the user message.
- LLM request has no timeout or retry.
- `syncEmbeddings` catches per-entry embedding exceptions; database update errors are not logged and only affect the count.
- Session and KB errors are generally logged, but raw error objects may be printed.
- Startup schema check is asynchronous and not awaited before listening. It logs failures but does not prevent startup.
- No centralized handling for rate limits, timeouts, provider outages, or partial operations exists.

# 21. Logging & Observability

Logging consists of `console.log`, `console.warn`, and `console.error`. There is no structured logger, log-level configuration, redaction policy, request ID, correlation ID, latency metric, tracing, or log aggregation configuration.

There are no metrics for LLM latency/tokens, retrieval quality, embedding latency, ingestion, or errors by endpoint. The startup check tests table accessibility; the health endpoint merely returns “Server is running.” This is not production observability.

Some log messages include user email, socket ID, or request details. Embedding logs include the first 80 characters of the text, which could expose submitted content in logs.

# 22. Performance

Likely bottlenecks and constraints:

- Every query requires an embedding network call and then an LLM network call; both run on the request path.
- LLM generation has no timeout. Client Axios timeout is 30 seconds, so client/backend timeout behavior can diverge.
- `syncEmbeddings` processes every entry serially in one HTTP request.
- `_searchKb` fetches all instruction entries each query.
- Message and session lists are unpaginated.
- KB admin listing returns all content.
- No cache exists for embeddings, queries, or LLM answers.
- No background ingestion or model worker exists.
- Ollama is fixed to localhost; in a container or remote deployment, that address would refer to the server’s own network namespace.
- Repeated Supabase client creation does not occur; one module singleton is used.

# 23. Concurrency

Express controller functions are async and await Supabase/Ollama network operations, but all inference remains on the synchronous request lifecycle (not a worker queue). Socket event handlers also await the same work.

There are no background workers, task queues, concurrency limits, or job status records. `syncEmbeddings` is sequential. Multiple concurrent chat requests can independently call Ollama and mutate sessions/messages. Session create has a race between resolving old active sessions and inserting a new one.

# 24. Caching

No Redis or in-memory cache was found. There is no embedding cache, query cache, LLM response cache, document-processing cache, or Supabase result cache implemented in the backend.

# 25. Testing

- Automated test files: **0 found**.
- Automated test cases: **0 found**.
- Approximate coverage: **not measurable**; no test runner or coverage tool is configured.
- One ad hoc script, [server/utils/test.js](server/utils/test.js), invokes embedding and generation smoke checks. It has no assertions and depends on live Ollama/Supabase configuration.
- `npm test` in [server/package.json](server/package.json) is intentionally configured to print “no test specified” and exit with failure.
- The `testController` routes are diagnostic login endpoints, not automated tests.
- No API, auth, RAG, ingestion, OCR, security, or load tests were found.

The smoke script was not executed; live service access was not part of this read-only audit.

# 26. Docker & Deployment

No Dockerfile, Docker Compose file, Kubernetes manifest, deployment config, CI workflow, or production process manager configuration was found.

The server package has a `dev` script using nodemon and a `test` script that exits with failure; it has no production `start` script. The manifest’s `main` points at `index.js`, while the actual bootstrap is `src/server.js`. The README instructs users to run the backend and Ollama locally in separate terminals.

No graceful shutdown handling, production health/readiness distinction, resource limits, or worker process is configured. The available deployment setup is development-oriented.

# 27. Configuration

| Variable | Purpose | Required | Default | Used where |
|---|---|---:|---|---|
| `SUPABASE_PROJECT_URL` | Supabase project URL | Yes | None | [server/config/supabase.js](server/config/supabase.js) |
| `SUPABASE_SECRET_KEY` | Supabase key used by server client | Yes | None | [server/config/supabase.js](server/config/supabase.js); local value appears publishable, not service-role |
| `PORT` | HTTP listen port | No | `5180` | [server/src/server.js](server/src/server.js) |
| `VITE_SUPABASE_URL` | Browser Supabase URL | Required for functional client | None | [client/config/supabase.js](client/config/supabase.js) |
| `VITE_SUPABASE_ANON_KEY` | Browser Supabase public key | Required for functional client | None | [client/config/supabase.js](client/config/supabase.js) |
| `VITE_API_URL` | Browser API base URL | No | `http://localhost:5180/api` | [client/api/api.js](client/api/api.js) |
| `VITE_SOCKET_URL` | Browser socket URL | No | `http://localhost:5180` | [client/socket/socket.js](client/socket/socket.js) |

Ollama URL and model names are hardcoded in [server/utils/vectorUtils.js](server/utils/vectorUtils.js); they are not environment-configurable. No `.env.example` was found. The README’s server variable names (`ANON_PUBLIC_KEY`, `SECRET_SERVICE_ROLE_KEY`) do not match the implementation’s `SUPABASE_SECRET_KEY`. The README also presents a service-role key example, but that is not what the code’s environment variable establishes.

# 28. Dependencies

Server dependencies from [server/package.json](server/package.json):

| Category | Dependency | Observed use |
|---|---|---|
| API | `express` | HTTP server and routers |
| API | `cors` | Express CORS |
| Configuration | `dotenv` | Loads environment variables |
| Realtime | `socket.io` | Socket server |
| Database/auth | `@supabase/supabase-js` | Supabase Auth, database, RPC |
| AI/LLM | `@huggingface/inference` | No import found; appears unused |
| Authentication | `bcryptjs` | No import found; appears unused; password handling delegated to Supabase |
| Authentication | `jsonwebtoken` | No import found; appears unused; JWT validation delegated to Supabase |
| Development | `nodemon` | Dev script |

No document processing, OCR, vector client, test framework, logger, rate-limiter, or queue dependency is present. The frontend packages are React, Vite, Axios, Supabase JS, and Socket.IO client; they are not backend processing dependencies. Both client and server have npm lockfiles.

# 29. Complete Data Flow

**FLOW A — Actual knowledge-entry creation** (not document ingestion):

```text
Admin JSON request
→ POST /api/kb/add or /api/kb/entry
→ adminMiddleware validates Supabase token/role
→ addKbContent validates fields/type/metadata
→ generateEmbedding("${title} ${content}")
→ Ollama /api/embeddings, nomic-embed-text
→ Supabase insert into knowledge_base
→ JSON response
```

There is no upload, file validation, parsing, OCR, cleaning, normalization, metadata extraction, or chunking. Sources: [server/routes/kbRouter.js](server/routes/kbRouter.js), [server/controllers/kbController.js](server/controllers/kbController.js), [server/utils/vectorUtils.js](server/utils/vectorUtils.js).

**FLOW B — HTTP user query**:

```text
Question
→ authMiddleware validates Bearer token
→ sendMessage checks session owner and active status
→ insert user message
→ _searchKb embeds query
→ Supabase RPC search_knowledge_base(query_embedding, top_k=5)
  + fetch all instruction entries
→ JSON context construction
→ _resolveKb → Ollama /api/chat, mistral
→ insert AI message
→ HTTP response
```

**FLOW B — Socket user query** is similar, but Socket.IO validates the token at handshake; the event checks session ownership but not active status. Retrieval failure is swallowed and generation continues with empty context. The server emits only the AI response to the socket. Sources: [server/sockets/socket.js](server/sockets/socket.js), [server/controllers/chatController.js](server/controllers/chatController.js), [server/controllers/kbController.js](server/controllers/kbController.js).

Citations, evidence validation, and answer grounding are not stages in either flow.

# 30. Production Readiness Analysis

| Area | Evidence-based assessment |
|---|---|
| Architecture | Small, understandable route/controller layout, but no service layer or separation of transport and business logic beyond controllers. |
| Code quality | Consistent enough to follow, but request contracts differ between client/server, error handling varies, and comments/README are not reliable API documentation. |
| API design | Basic CRUD and chat exist; no OpenAPI, pagination, uniform validation, or consistent status/response conventions. Several client helpers target absent routes. |
| Document ingestion | Not implemented. KB is manual JSON text entry only. |
| OCR | Not implemented. |
| Chunking | Not implemented; one vector per KB entry. |
| Embeddings | Implemented through Ollama with a dimension check and embedding timeout; no batching/cache/configurable provider. |
| Retrieval | Intended dense search plus instructions; likely broken against the README schema due RPC mismatch. No threshold or tenant filter. |
| Reranking | Absent. |
| LLM integration | Basic non-streaming Ollama call; no timeout, retries, token controls, or provider abstraction. |
| RAG grounding | Prompt asks the model to use context, but there is no citation, abstention, relevance, or faithfulness enforcement. |
| Authentication | Supabase token verification and app-level ownership checks exist. Test endpoints and role handling need security review. |
| Security | Important gaps: public expensive endpoints, no rate limiting, wildcard socket CORS, documented role-escalation policy, uncertain server DB privilege/RLS behavior. |
| Database | Supabase access is implemented, but no migration system and no verification of actual schema. README setup has compatibility and SQL issues. |
| Vector database | pgvector is documented but RPC mismatch prevents confidence in retrieval working against the documented setup. |
| Error handling | Local catches exist; no central handler, retries, or consistent provider failure behavior. |
| Logging | Console logging only; content may be logged; no structured observability. |
| Performance | Synchronous end-to-end inference, sequential unbounded embedding sync, no cache or pagination. |
| Scalability | No workers/queues, no concurrency limits, and local Ollama coupling. |
| Testing | No automated tests or coverage. |
| Deployment | Development-oriented; no production start/deploy configuration or operational controls. |

# 31. Critical Gaps

| Gap | Why it matters / affected area | Evidence | Severity |
|---|---|---|---|
| Server key/RLS mismatch risk | Server-side DB operations may run as anon and fail documented RLS rules; impacts sessions, chat, KB, retrieval | Server client uses configured key without forwarding user JWT: [server/config/supabase.js](server/config/supabase.js), [server/middleware/authMiddleware.js](server/middleware/authMiddleware.js); documented RLS: [README.md](README.md) | Critical |
| Potential admin self-promotion in documented schema | A user-update policy permits profile updates and a trigger copies role changes to auth metadata | README profile policy and role-sync trigger: [README.md](README.md) | Critical if deployed as written |
| Vector RPC mismatch | Fresh documented schema defines `match_documents`; code calls `search_knowledge_base` with different argument names | [README.md](README.md), [server/utils/vectorUtils.js](server/utils/vectorUtils.js) | High |
| Public inference endpoints without rate limits | Unauthenticated callers can trigger embedding/RPC/LLM cost and resource use | [server/routes/kbRouter.js](server/routes/kbRouter.js), [server/src/server.js](server/src/server.js) | High |
| No tenant/document retrieval isolation | Retrieval searches global KB with no user or tenant filters | [server/controllers/kbController.js](server/controllers/kbController.js) | High where data is tenant-sensitive |
| No RAG grounding controls | Poor/empty/conflicting retrieval can still produce an answer without citations or abstention | [server/utils/vectorUtils.js](server/utils/vectorUtils.js) | High |
| No input throttling/length policy | Public and authenticated routes can be abused; text size and inference workload are not controlled consistently | [server/src/server.js](server/src/server.js), [server/routes/kbRouter.js](server/routes/kbRouter.js) | High |
| No LLM timeout/retry | A hung Ollama generation can hold HTTP/socket work indefinitely | [server/utils/vectorUtils.js](server/utils/vectorUtils.js) | High |
| Socket session status not checked | Resolved sessions can still receive socket messages, unlike HTTP chat | [server/sockets/socket.js](server/sockets/socket.js), [server/controllers/chatController.js](server/controllers/chatController.js) | Medium |
| No automated tests | Critical auth, retrieval, persistence, and error paths can regress undetected | [server/package.json](server/package.json), [server/utils/test.js](server/utils/test.js) | High |
| Client/server API drift | Several frontend helpers call routes that do not exist; KB resolve payload key differs | [client/api/health.js](client/api/health.js), [client/api/session.js](client/api/session.js), [client/api/test.js](client/api/test.js), [client/api/kb.js](client/api/kb.js) | Medium |
| No production deployment/observability foundation | No deployment config, structured logs, metrics, queue, or production start script | [server/package.json](server/package.json); no deployment artifacts found | High |

# 32. What Is Actually Implemented

- Express API bootstrap and mounted routers.
- Supabase email/password auth integration and Bearer-token verification.
- Application-level ownership checks for HTTP chat/session operations.
- Socket.IO token authentication and message processing.
- Session creation/current-session/resolution and admin session listing.
- Admin text KB CRUD and one embedding per KB entry.
- Ollama embedding generation and basic non-streaming Mistral generation.
- Intended pgvector search RPC integration.
- Message persistence and message-history retrieval.
- Basic health and Supabase table-access diagnostic endpoints.

These are implemented in source, but external service connectivity, actual RLS permissions, and live schema compatibility remain **UNKNOWN**.

# 33. What Is Partially Implemented

- **RAG:** query embedding, intended dense search, prompt-based context use; no reliable schema match, threshold, reranking, citations, or evaluation.
- **Chat sessions:** persistence and ownership checks; no history in generation, no pagination, and socket status check differs from HTTP.
- **Admin authorization:** role checks exist, but sources of role are inconsistent and the documented profile policy is unsafe.
- **Knowledge management:** CRUD applies to text rows, not uploaded documents; update validation and sync behavior are incomplete.
- **Health checks:** liveness is present; dependency readiness and operational health are not.
- **Tests:** one manual smoke script exists, but no assertions or automated suite.
- **Logout:** client Supabase logout exists; server logout endpoint only acknowledges the request.

# 34. What Is Missing

Absent from the repository:

- File upload, document parsing, OCR, layout extraction, metadata enrichment, and chunking.
- Reranking, hybrid retrieval, similarity thresholds, query expansion, and contextual compression.
- Citation generation/validation, abstention policy, grounding evaluation, and conflict handling.
- Tenant-aware KB/document isolation.
- Async ingestion workers, queue, retries, and ingestion status.
- Document versioning and deletion propagation across chunks/vectors.
- Rate limiting, structured request validation, and explicit inference-size limits.
- Automated tests, coverage, RAG evaluation, and load/security tests.
- Central logging, metrics, tracing, request IDs, and alerting.
- Cache, production deployment configuration, migrations, and database schema verification.

# 35. Proposed Production Architecture

**Proposed architecture only; no repository changes were made.**

```text
Authenticated upload
→ API validates ownership, type, size, and request
→ Object storage stores original file
→ Queue records ingestion job/status
→ Worker extracts text and layout
→ OCR for scanned/image content
→ Cleaning and metadata extraction
→ Page/heading-aware chunking with source metadata
→ Batched embedding generation
→ PostgreSQL metadata + vector storage
→ Hybrid dense/keyword retrieval with tenant/document filters
→ Reranking
→ Context assembly with source IDs/pages
→ LLM with bounded context, timeout, retry policy
→ Citation/grounding validation and abstention
→ Persisted answer + sources
→ API/socket response
```

Recommended components and rationale:

- **PostgreSQL/Supabase:** retain relational auth/session data; add explicit migrations, validated RLS policies, and a deliberate server authorization model.
- **Object storage:** needed to retain uploaded originals safely and support reprocessing/versioning.
- **Background queue/workers:** needed because parsing, OCR, and embedding should not hold a chat/API request open; workers also allow bounded retries and job status.
- **OCR/layout-aware parser:** add only when the product needs scanned PDFs, images, tables, or faithful page/heading references.
- **Chunk storage and metadata:** keep document ID, tenant ID, filename, page, section, and chunk ID with each searchable unit.
- **Vector + keyword retrieval:** hybrid retrieval addresses semantic misses and exact terms; apply tenant/document filters before ranking.
- **Reranker:** use after retrieval to improve relevance before passing a bounded context to the LLM.
- **Redis:** add if needed for rate limits, short-lived job/cache state, or coordination; it does not replace durable PostgreSQL records.
- **Observability/evaluation:** log correlation IDs and stage latency without logging raw sensitive text; add retrieval/answer quality evaluation before claiming grounding.
- **Security:** restrict CORS, rate-limit login/search/generation, validate all input, isolate tenants in database policies and retrieval, treat retrieved content as untrusted, and avoid exposing privileged keys.

# 36. Prioritized Implementation Roadmap

Effort is relative: **S** small, **M** medium, **L** large. These are recommendations, not changes made.

## PHASE 1 — Fix existing foundations

1. **Resolve server Supabase authorization model.**  
   **Priority:** Critical  
   **Reason:** Current server client appears to use a publishable key and does not forward user JWTs to DB operations; documented RLS can block legitimate operations. Decide between deliberate service-role access with strict application checks or user-token-scoped DB access.  
   **Files/components affected:** [server/config/supabase.js](server/config/supabase.js), [server/middleware/authMiddleware.js](server/middleware/authMiddleware.js), [server/middleware/adminMiddleware.js](server/middleware/adminMiddleware.js), Supabase policies.  
   **Expected benefit:** Predictable database authorization and reduced accidental privilege exposure.  
   **Complexity:** M

2. **Fix and verify database schema/RPC setup.**  
   **Priority:** Critical  
   **Reason:** Application RPC and README SQL disagree; documented SQL also contains a likely trailing delimiter error.  
   **Files/components affected:** [server/utils/vectorUtils.js](server/utils/vectorUtils.js), [README.md](README.md), new migration/schema management.  
   **Expected benefit:** Search works against a reproducible schema.  
   **Complexity:** M

3. **Correct role management and policies.**  
   **Priority:** Critical  
   **Reason:** README policy appears to allow self-editing role, and role sources are inconsistent.  
   **Files/components affected:** Supabase RLS/functions, [server/middleware/adminMiddleware.js](server/middleware/adminMiddleware.js), [server/controllers/authController.js](server/controllers/authController.js).  
   **Expected benefit:** Prevent user privilege escalation and align role decisions.  
   **Complexity:** M

4. **Add contract tests and reconcile client/server routes.**  
   **Priority:** High  
   **Reason:** Multiple client helper endpoints are absent and KB resolve payload names differ.  
   **Files/components affected:** [server/routes/authRouter.js](server/routes/authRouter.js), [client/api/health.js](client/api/health.js), [client/api/kb.js](client/api/kb.js), [client/api/session.js](client/api/session.js), [client/api/test.js](client/api/test.js), new automated tests.  
   **Expected benefit:** Detect and prevent broken frontend/backend calls.  
   **Complexity:** M

## PHASE 2 — Improve document ingestion

1. **Define upload policy and store originals in object storage.**  
   **Priority:** High if document ingestion is a product requirement  
   **Reason:** There is no file ingestion path or durable source document.  
   **Files/components affected:** New upload API, object storage configuration, document metadata schema.  
   **Expected benefit:** Safe, repeatable ingestion of source files.  
   **Complexity:** L

2. **Add parsing, OCR, and chunking as worker stages.**  
   **Priority:** High if PDFs/scanned documents are required  
   **Reason:** No extraction, OCR, normalization, or chunking exists.  
   **Files/components affected:** New parser/OCR worker modules, queue, chunk schema, [server/controllers/kbController.js](server/controllers/kbController.js).  
   **Expected benefit:** Support actual source documents while preserving page/section provenance.  
   **Complexity:** L

3. **Add ingestion status, retries, and deletion/version propagation.**  
   **Priority:** High  
   **Reason:** There are no jobs, retries, status tracking, or document versions.  
   **Files/components affected:** Worker/queue, document/chunk tables, admin API.  
   **Expected benefit:** Recoverable operations and consistent document lifecycle.  
   **Complexity:** L

## PHASE 3 — Improve retrieval

1. **Add metadata/tenant filters and retrieval thresholding.**  
   **Priority:** Critical for multi-tenant/private data  
   **Reason:** Current retrieval is global and accepts every top result regardless of similarity.  
   **Files/components affected:** [server/controllers/kbController.js](server/controllers/kbController.js), database RPC/schema, RLS.  
   **Expected benefit:** Prevent cross-tenant retrieval and reduce irrelevant context.  
   **Complexity:** M

2. **Introduce hybrid retrieval and reranking.**  
   **Priority:** High  
   **Reason:** Current system uses only intended dense retrieval; exact-match terms can be missed.  
   **Files/components affected:** Vector RPC/search layer, retrieval service, model configuration.  
   **Expected benefit:** Better recall and relevance ordering.  
   **Complexity:** L

## PHASE 4 — Improve generation/grounding

1. **Construct bounded context with source IDs/page metadata; require and validate citations.**  
   **Priority:** High  
   **Reason:** Current prompt provides no reliable citations or grounding checks.  
   **Files/components affected:** Retrieval/context builder, [server/utils/vectorUtils.js](server/utils/vectorUtils.js), message response schema.  
   **Expected benefit:** Answers become auditable and source-linked.  
   **Complexity:** M

2. **Add explicit abstention and conflict behavior.**  
   **Priority:** High  
   **Reason:** Empty/poor/conflicting retrieval still reaches the LLM without a decision policy.  
   **Files/components affected:** Retrieval quality gate, prompt/generation layer.  
   **Expected benefit:** Fewer unsupported answers.  
   **Complexity:** M

3. **Set generation timeout, bounded retries, token/context limits.**  
   **Priority:** High  
   **Reason:** LLM call can hang and context size is uncontrolled.  
   **Files/components affected:** [server/utils/vectorUtils.js](server/utils/vectorUtils.js), API error handling.  
   **Expected benefit:** Predictable latency and failure behavior.  
   **Complexity:** S–M

## PHASE 5 — Security

1. **Restrict origins and rate-limit auth/search/generation/test routes.**  
   **Priority:** Critical  
   **Reason:** Public inference/test endpoints and wildcard socket CORS increase abuse exposure.  
   **Files/components affected:** [server/src/server.js](server/src/server.js), [server/routes/kbRouter.js](server/routes/kbRouter.js), [server/routes/testRouter.js](server/routes/testRouter.js), socket setup.  
   **Expected benefit:** Reduced unauthorized use and resource exhaustion.  
   **Complexity:** M

2. **Remove or secure public diagnostic login endpoints; minimize error detail.**  
   **Priority:** High  
   **Reason:** Public endpoints return access tokens and provider details.  
   **Files/components affected:** [server/routes/testRouter.js](server/routes/testRouter.js), [server/controllers/testController.js](server/controllers/testController.js), [server/middleware/authMiddleware.js](server/middleware/authMiddleware.js).  
   **Expected benefit:** Reduce credential abuse and token disclosure.  
   **Complexity:** S

3. **Enforce request schemas, string limits, and socket session status.**  
   **Priority:** High  
   **Reason:** Validation is inconsistent, and socket can message resolved sessions.  
   **Files/components affected:** [server/controllers/chatController.js](server/controllers/chatController.js), [server/controllers/kbController.js](server/controllers/kbController.js), [server/sockets/socket.js](server/sockets/socket.js), [server/src/server.js](server/src/server.js).  
   **Expected benefit:** More predictable, abuse-resistant input handling.  
   **Complexity:** M

4. **Treat retrieved content as untrusted and isolate tenant data.**  
   **Priority:** Critical for private/tenant data  
   **Reason:** KB instructions/content are inserted into the prompt without injection controls or tenant filters.  
   **Files/components affected:** Retrieval/context builder, database policies, document metadata.  
   **Expected benefit:** Reduced indirect prompt injection and cross-tenant leakage risk.  
   **Complexity:** L

## PHASE 6 — Observability

1. **Add structured logs, request IDs, and stage latency/error metrics.**  
   **Priority:** High  
   **Reason:** Current console logs cannot reliably trace API, retrieval, and LLM failures; raw text fragments may be logged.  
   **Files/components affected:** [server/src/server.js](server/src/server.js), controllers, [server/utils/vectorUtils.js](server/utils/vectorUtils.js), logging/metrics provider.  
   **Expected benefit:** Faster incident diagnosis without exposing user content.  
   **Complexity:** M

2. **Separate liveness from dependency readiness.**  
   **Priority:** Medium  
   **Reason:** Current health endpoint only reports process liveness.  
   **Files/components affected:** [server/routes/healthRouter.js](server/routes/healthRouter.js), [server/controllers/supabaseController.js](server/controllers/supabaseController.js).  
   **Expected benefit:** Deployment systems can distinguish a live process from usable dependencies.  
   **Complexity:** S

## PHASE 7 — Scalability

1. **Move ingestion/sync work to bounded workers and queue.**  
   **Priority:** High when KB volume grows  
   **Reason:** Sync is serial and tied to one HTTP request; there is no job tracking.  
   **Files/components affected:** KB sync endpoint/controller, new queue and worker components.  
   **Expected benefit:** Resilient, scalable ingestion with bounded concurrency.  
   **Complexity:** L

2. **Add pagination and tune database/vector indexes against actual query plans.**  
   **Priority:** Medium  
   **Reason:** Listings are unbounded and database schema/indexes are unverified.  
   **Files/components affected:** Session/chat/KB controllers and migrations.  
   **Expected benefit:** Lower memory/response costs and predictable database load.  
   **Complexity:** M

3. **Add cache only for measured repeat work.**  
   **Priority:** Medium  
   **Reason:** There is currently no cache; caching can reduce repeated embedding/LLM cost but requires invalidation rules.  
   **Files/components affected:** Retrieval/generation layer, optionally Redis.  
   **Expected benefit:** Lower latency and provider load for repeated requests.  
   **Complexity:** M

## PHASE 8 — Evaluation

1. **Build automated unit/integration tests for auth, RLS, chat, and RPC behavior.**  
   **Priority:** Critical  
   **Reason:** There are no automated tests, despite security-sensitive authorization and persistence flows.  
   **Files/components affected:** New test suite, controllers/middleware, Supabase test setup.  
   **Expected benefit:** Catch permission, route-contract, and partial-write regressions.  
   **Complexity:** M–L

2. **Add retrieval and answer-quality evaluation sets.**  
   **Priority:** High  
   **Reason:** No evidence currently measures retrieval relevance, citations, or answer faithfulness.  
   **Files/components affected:** Evaluation harness, representative KB/query fixtures, retrieval/generation pipeline.  
   **Expected benefit:** Measurable RAG quality and safer model/config changes.  
   **Complexity:** M–L

**Bottom line:** the repository implements a basic authenticated chat application with a manually curated text KB and an Ollama-based retrieval/generation attempt. It does not currently implement document ingestion or production-grade RAG controls. The RPC/schema mismatch and server database authorization setup should be resolved before relying on retrieval or database behavior.
