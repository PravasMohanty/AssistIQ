# AssistIQ

AI-powered customer-support chat that answers from an administrator-managed document knowledge base. It uses local Ollama models for embeddings and generation.

For the complete system map, file inventory, request flows, data model, endpoint contracts, implementation notes, and roadmap, read [architecture.md](architecture.md).

## Stack

```text
React + Vite browser
  → Express + Socket.IO API
       → PostgreSQL: users, sessions, messages
       → FastAPI RAG service
            → ChromaDB: vectors
            → Ollama: nomic-embed-text + mistral
```

- React 19, React Router, Axios, Socket.IO client, Lucide
- Express 5, Socket.IO, PostgreSQL (`pg`), bcrypt, JWT, Multer
- FastAPI, ChromaDB, Ollama
- Docker Compose for PostgreSQL, ChromaDB, and an optional currently-unused Redis container

## Prerequisites

- Node.js 18+
- Python 3.10+
- Docker Desktop / Docker Compose
- [Ollama](https://ollama.com/) with both models installed:

```powershell
ollama pull nomic-embed-text
ollama pull mistral
```

## Local setup

### 1. Start infrastructure

From the repository root:

```powershell
docker compose up -d
```

This starts PostgreSQL on `5432`, ChromaDB on `8000`, and Redis on `6379`. Redis is not used by the current application.

Initialize the PostgreSQL schema once, using your preferred PostgreSQL client, with [server/config/schema.sql](server/config/schema.sql). For the compose defaults, this is equivalent to running the SQL file against database `assistiq` as user `assistiq`.

### 2. Configure environment files

Create `server/.env` (never commit it):

```env
PORT=5180
JWT_SECRET=replace-with-a-long-random-secret
ADMIN_SIGNUP_CODE=replace-with-a-separate-admin-signup-code
DB_HOST=localhost
DB_PORT=5432
DB_NAME=assistiq
DB_USER=assistiq
DB_PASSWORD=assistiq_password
RAG_SERVICE_URL=http://127.0.0.1:8001
```

Set the client endpoints in `client/.env` to the same Express process:

```env
VITE_API_URL=http://localhost:5180/api
VITE_SOCKET_URL=http://localhost:5180
```

Do not put `JWT_SECRET`, `ADMIN_SIGNUP_CODE`, database credentials, or any other server secret in `client/.env`.

### 3. Install dependencies

```powershell
cd server
npm install

cd ..\client
npm install

cd ..\rag-service
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

### 4. Run the four required processes

Use separate terminals:

```powershell
# Terminal 1 — Ollama
ollama serve

# Terminal 2 — FastAPI RAG service
cd rag-service
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --port 8001

# Terminal 3 — Express + Socket.IO
cd server
npm run dev

# Terminal 4 — React + Vite
cd client
npm run dev
```

Open the Vite URL shown in the final terminal, normally `http://localhost:5173`.

## How it works

1. Users register or sign in through Express. Express stores bcrypt password hashes in PostgreSQL and returns a one-hour JWT.
2. The browser stores that JWT in local storage, attaches it to API requests, and sends it in the Socket.IO handshake.
3. A chat page obtains or creates one active PostgreSQL session, then sends messages over Socket.IO when connected or through an HTTP fallback.
4. Express checks session ownership, stores the user message, asks FastAPI for a RAG answer, stores the AI answer, and returns it to the browser.
5. FastAPI embeds the query with Ollama, retrieves nearest Chroma chunks, asks Mistral to answer only from those chunks, and returns the answer.
6. Admins upload `.txt` or `.md` documents. The Node server saves them to `rag-service/data`, FastAPI chunks them, Ollama embeds every chunk, and ChromaDB stores the vectors.

## Main routes

| Area | Routes |
|---|---|
| Authentication | `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/profile` |
| Chat | `GET /api/chat/:id`, `POST /api/chat/send/:id`, Socket.IO `send_message` / `receive_message` |
| Sessions | `POST /api/session/create`, `GET /api/session/current`, `POST /api/session/resolve`, admin `GET /api/session/` |
| Knowledge base | Admin upload/list/delete/re-ingest/sync under `/api/kb`; RAG service on `:8001` |

The detailed route/middleware/API compatibility table is in [architecture.md](architecture.md#6-express-server-routing-and-middleware).

## Features

- JWT-authenticated customer and admin accounts
- Socket.IO chat with HTTP fallback
- Session history and issue resolution
- Admin-only document ingestion and knowledge-base management
- Local semantic retrieval and response generation
- Responsive React interface with role-protected routes

## Current limitations

This is a local-development implementation. Before public or production use, address the P0/P1 findings in [the implementation notes](architecture.md#17-current-implementation-notes-and-recommended-priorities): secure the FastAPI ingestion path, remove/protect test and unauthenticated inference routes, add rate limiting and validation, align client/server configuration, and add automated tests and operational controls.

## License

[MIT](LICENSE)
