<p align="center">
  <img src="client/public/assistIQ.png" alt="AssistIQ Logo" width="80" />
</p>

<h1 align="center">AssistIQ</h1>
<p align="center"><b>AI-Powered Customer Support Chatbot</b></p>
<p align="center">
  Intelligent, real-time customer support powered by local LLMs via Ollama, vector-based knowledge retrieval, and a premium glassmorphic UI.
</p>

---

## ✨ Highlights

| Feature | Description |
|---|---|
| 🤖 Local AI | Runs entirely on your machine — **Mistral** for chat, **nomic-embed-text** for embeddings via Ollama |
| 🔍 Semantic Search | Vector-based knowledge base search using pgvector + Supabase |
| ⚡ Real-Time | WebSocket messaging with Socket.IO, automatic HTTP fallback |
| 🛡️ Role-Based Access | Admin & user roles with protected routes on both frontend and backend |
| 📚 Knowledge Base | Admin panel for full CRUD management of KB entries with auto-generated embeddings |
| 🎨 Premium UI | Dark-mode glassmorphism design with micro-animations, responsive across devices |
| ✅ Session Management | Users can resolve support tickets; admins can view all sessions |

---

## 🏗️ Tech Stack

### Frontend
- **React 19** with Vite 7
- **React Router v7** for client-side routing
- **Axios** for API requests
- **Socket.IO Client** for real-time messaging
- **Supabase JS** for authentication
- **Lucide React** for icons
- **Vanilla CSS** with custom design system (glassmorphism, CSS variables)

### Backend
- **Node.js** with Express 5
- **Socket.IO** for WebSocket communication
- **Supabase** for database (PostgreSQL + pgvector) and authentication
- **Ollama** for local LLM inference (Mistral + nomic-embed-text)
- **JWT** for token-based auth middleware

### Database (Supabase)
Four tables power the application:

| Table | Purpose |
|---|---|
| `profiles` | User profiles with roles (`user` / `admin`) |
| `chat_sessions` | Support sessions with status tracking (`active` / `resolved`) |
| `messages` | Chat messages linked to sessions |
| `knowledge_base` | KB entries with vector embeddings for semantic search |

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [Ollama](https://ollama.ai/) installed and running
- A [Supabase](https://supabase.com/) project with pgvector enabled

### 1. Clone the Repository

```bash
git clone https://github.com/YOUR_USERNAME/AssistIQ.git
cd AssistIQ
```

### 2. Set Up Ollama

Install Ollama from [ollama.ai](https://ollama.ai/), then pull the required models:

```bash
# Start the Ollama server
ollama serve

# In a new terminal, pull the models
ollama pull mistral            # Chat model (~4GB)
ollama pull nomic-embed-text   # Embedding model (~270MB)
```

> **Note:** Ollama must be running on `http://localhost:11434` before starting the server. The first pull may take a few minutes depending on your internet speed.

### 3. Set Up Supabase

1. Create a new Supabase project at [supabase.com](https://supabase.com/)
2. Enable the **pgvector** extension in your database (SQL Editor → `CREATE EXTENSION IF NOT EXISTS vector;`)
3. Create the required tables:

```sql
-- Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- Profiles table
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  name TEXT,
  role TEXT DEFAULT 'user',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chat sessions table
CREATE TABLE chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT DEFAULT 'New Chat',
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Messages table
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES chat_sessions(id) ON DELETE CASCADE,
  sender_role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Knowledge base table with vector embeddings
CREATE TABLE knowledge_base (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  type TEXT DEFAULT 'qa',
  metadata JSONB,
  embedding VECTOR(768),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Vector similarity search function
CREATE OR REPLACE FUNCTION search_knowledge_base(query_embedding VECTOR(768), top_k INT DEFAULT 5)
RETURNS TABLE (id UUID, title TEXT, content TEXT, type TEXT, metadata JSONB, similarity FLOAT)
LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  SELECT kb.id, kb.title, kb.content, kb.type, kb.metadata,
         1 - (kb.embedding <=> query_embedding) AS similarity
  FROM knowledge_base kb
  ORDER BY kb.embedding <=> query_embedding
  LIMIT top_k;
END;
$$;
```

### 4. Configure Environment Variables

**Server** (`server/.env`):

```env
PORT=5180
SUPABASE_PROJECT_URL="https://YOUR_PROJECT.supabase.co"
ANON_PUBLIC_KEY="your-anon-key"
SECRET_SERVICE_ROLE_KEY="your-service-role-key"
HUGGINGFACE_TOKEN="your-hf-token"   # Optional, for HuggingFace fallback
```

**Client** (`client/.env`):

```env
VITE_SUPABASE_URL="https://YOUR_PROJECT.supabase.co"
VITE_SUPABASE_ANON_KEY="your-anon-key"
VITE_API_URL="http://localhost:5180/api"
VITE_SOCKET_URL="http://localhost:5180"
```

### 5. Install Dependencies

```bash
# Install server dependencies
cd server
npm install

# Install client dependencies
cd ../client
npm install
```

### 6. Start the Application

You need **three terminals** running simultaneously:

```bash
# Terminal 1 — Ollama (if not already running)
ollama serve

# Terminal 2 — Backend server
cd server
npm run dev

# Terminal 3 — Frontend dev server
cd client
npm run dev
```

The app will be available at **http://localhost:5173**

---

## 🧑‍💼 User Features

| Feature | Description |
|---|---|
| **Sign Up / Login** | Secure authentication via Supabase Auth |
| **Real-Time Chat** | Send messages and receive AI responses in real time via WebSocket |
| **Session Management** | Active session tracking with the ability to resolve/close tickets |
| **Resolve Prompt** | After receiving a response, users are prompted: *"Are your queries resolved?"* |
| **New Chat** | After resolving, users can start a fresh support session |
| **Suggestion Chips** | Pre-built common questions for quick interaction |
| **HTTP Fallback** | If WebSocket fails, chat gracefully falls back to standard HTTP |

## 🔐 Admin Features

Accessible at `/admin` for users with the `admin` role.

| Feature | Description |
|---|---|
| **Knowledge Base CRUD** | Add, edit, and delete KB entries (Q&A or Instruction types) |
| **Auto Embeddings** | Vector embeddings are generated automatically when adding/updating entries |
| **Sync Embeddings** | Bulk re-generate embeddings for all entries (useful after model changes) |
| **Session Monitoring** | View all user chat sessions with status (active/resolved), dates, and IDs |
| **Search & Filter** | Search through KB entries by title or content |

---

## 📁 Project Structure

```
AssistIQ/
├── client/                     # React frontend (Vite)
│   ├── api/                    # API service modules (auth, chat, kb, session)
│   ├── config/                 # Supabase client config
│   ├── socket/                 # Socket.IO client setup
│   ├── src/
│   │   ├── components/         # Navbar, ProtectedRoute
│   │   ├── contexts/           # AuthContext (auth state management)
│   │   └── pages/              # AuthPage, ChatPage, AdminPage + CSS
│   └── index.html
│
└── server/                     # Node.js backend (Express)
    ├── config/                 # Supabase server config
    ├── controllers/            # Route handlers (auth, chat, kb, session)
    ├── middleware/              # Auth & admin middleware
    ├── routes/                 # Express routers
    ├── sockets/                # Socket.IO event handlers
    ├── utils/                  # Vector utilities (embeddings, search, LLM)
    └── src/server.js           # Entry point
```

---

## 🔧 How It Works

### The AI Pipeline

```
User Message
     │
     ▼
┌─────────────┐     ┌──────────────────┐     ┌───────────────┐
│  Socket.IO   │────▶│  Knowledge Base   │────▶│   Mistral LLM  │
│  or HTTP     │     │  Semantic Search  │     │  (via Ollama)   │
└─────────────┘     └──────────────────┘     └───────────────┘
                           │                         │
                    nomic-embed-text           Contextual AI
                    generates query            response using
                    embedding, pgvector        KB context only
                    finds similar entries
```

1. **User sends a message** via WebSocket (or HTTP fallback)
2. **Semantic search** — The message is converted to a 768-dim vector using `nomic-embed-text` and matched against KB entries via pgvector similarity search
3. **Context injection** — Matching KB entries + system instructions are passed as context to Mistral
4. **AI response** — Mistral generates a response grounded in the knowledge base, not from internet or hallucination
5. **Response delivery** — Sent back via WebSocket in real time

### Authentication Flow

```
Login → Supabase Auth → JWT Token → API Requests (Bearer Token)
                                         │
                              ┌──────────┴──────────┐
                              │                     │
                        authMiddleware         adminMiddleware
                        (all users)            (admin only)
```

---

## 🎨 Design System

The UI is built with a custom CSS design system featuring:
- **Dark mode** with carefully tuned color variables
- **Glassmorphism** cards with blur and translucent borders
- **Micro-animations** — message slide-ins, typing indicators, icon pops
- **Responsive layout** — works on desktop and mobile
- **Lucide icons** — consistent, beautiful SVG icon library

---

## 📜 API Endpoints

### Auth
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/login` | No | Login with email/password |
| POST | `/api/auth/register` | No | Register new user |
| GET | `/api/auth/profile` | Yes | Get current user profile |
| POST | `/api/auth/logout` | Yes | Logout confirmation |

### Chat
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/chat/send` | Yes | Send message (HTTP fallback) |
| GET | `/api/chat/messages/:id` | Yes | Get messages for a session |

### Sessions
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/session/create` | Yes | Create new chat session |
| GET | `/api/session/current` | Yes | Get current active session |
| POST | `/api/session/resolve` | Yes | Resolve/close a session |
| GET | `/api/session/` | Admin | Get all sessions |

### Knowledge Base
| Method | Endpoint | Auth | Description |
|---|---|---|---|
| POST | `/api/kb/add` | Admin | Add KB entry |
| GET | `/api/kb/entries` | Admin | Get all KB entries |
| PUT | `/api/kb/entry/:id` | Admin | Update KB entry |
| DELETE | `/api/kb/entry/:id` | Admin | Delete KB entry |
| POST | `/api/kb/search` | Yes | Semantic search |
| POST | `/api/kb/resolve` | Yes | Resolve query with context |
| POST | `/api/kb/sync` | Admin | Re-sync all embeddings |

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes (`git commit -m 'Add my feature'`)
4. Push to the branch (`git push origin feature/my-feature`)
5. Open a Pull Request

---

## 📄 License

This project is open-source and available under the [MIT License](LICENSE).

---

<p align="center">
  Built with ❤️ using React, Express, Supabase, and Ollama
</p>
