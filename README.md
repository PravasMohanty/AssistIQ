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
git clone https://github.com/PravasMohanty/AssistIQ.git
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

-- ============================================================
-- CLEANUP: Drop existing objects (if any)
-- ============================================================

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS on_profile_role_change ON public.profiles;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.sync_role_to_metadata() CASCADE;
DROP FUNCTION IF EXISTS match_documents(vector, int) CASCADE;
DROP TABLE IF EXISTS public.messages CASCADE;
DROP TABLE IF EXISTS public.chat_sessions CASCADE;
DROP TABLE IF EXISTS public.knowledge_base CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

-- ============================================================
-- EXTENSIONS
-- ============================================================

-- Enable pgvector for embeddings and similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
-- TABLE: profiles
-- ============================================================
-- Stores user profile information linked to Supabase auth.users
-- Automatically created when a new user signs up

CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  name TEXT,
  email TEXT UNIQUE NOT NULL,
  role TEXT DEFAULT 'customer' CHECK (role IN ('customer', 'admin', 'support')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- RLS Policies for profiles
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- ============================================================
-- TABLE: chat_sessions
-- ============================================================
-- Stores chat conversation sessions

CREATE TABLE public.chat_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  title TEXT DEFAULT 'New Chat',
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'resolved', 'archived')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security
ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for chat_sessions
CREATE POLICY "Users can view their own sessions"
  ON public.chat_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own sessions"
  ON public.chat_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own sessions"
  ON public.chat_sessions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own sessions"
  ON public.chat_sessions FOR DELETE
  USING (auth.uid() = user_id);

-- Index for faster user queries
CREATE INDEX idx_chat_sessions_user_id ON public.chat_sessions(user_id);
CREATE INDEX idx_chat_sessions_status ON public.chat_sessions(status);

-- ============================================================
-- TABLE: messages
-- ============================================================
-- Stores individual messages within chat sessions

CREATE TABLE public.messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID REFERENCES public.chat_sessions(id) ON DELETE CASCADE NOT NULL,
  sender_role TEXT CHECK (sender_role IN ('user', 'ai')) NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies for messages (users can only see messages from their sessions)
CREATE POLICY "Users can view messages from their sessions"
  ON public.messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.chat_sessions
      WHERE chat_sessions.id = messages.session_id
      AND chat_sessions.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert messages to their sessions"
  ON public.messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.chat_sessions
      WHERE chat_sessions.id = messages.session_id
      AND chat_sessions.user_id = auth.uid()
    )
  );

-- Indexes for faster queries
CREATE INDEX idx_messages_session_id ON public.messages(session_id);
CREATE INDEX idx_messages_created_at ON public.messages(created_at);

-- ============================================================
-- TABLE: knowledge_base
-- ============================================================
-- Stores knowledge base articles with vector embeddings for semantic search

CREATE TABLE public.knowledge_base (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  type TEXT DEFAULT 'qa' CHECK (type IN ('instruction', 'qa', 'faq', 'documentation')),
  metadata JSONB DEFAULT '{}'::jsonb,
  embedding VECTOR(768),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security
ALTER TABLE public.knowledge_base ENABLE ROW LEVEL SECURITY;

-- RLS Policies for knowledge_base (read-only for authenticated users)
CREATE POLICY "Authenticated users can view knowledge base"
  ON public.knowledge_base FOR SELECT
  TO authenticated
  USING (true);

-- Index for fast vector similarity search
CREATE INDEX knowledge_base_embedding_idx
  ON public.knowledge_base
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Index for text search
CREATE INDEX idx_knowledge_base_title ON public.knowledge_base USING gin(to_tsvector('english', title));
CREATE INDEX idx_knowledge_base_content ON public.knowledge_base USING gin(to_tsvector('english', content));

-- ============================================================
-- FUNCTION: match_documents
-- ============================================================
-- Performs semantic similarity search on knowledge base using vector embeddings

CREATE OR REPLACE FUNCTION match_documents(
  query_embedding VECTOR(768),
  match_count INT DEFAULT 5,
  filter_type TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  content TEXT,
  type TEXT,
  metadata JSONB,
  similarity FLOAT
)
LANGUAGE SQL STABLE AS $$
  SELECT
    kb.id,
    kb.title,
    kb.content,
    kb.type,
    kb.metadata,
    1 - (kb.embedding <=> query_embedding) AS similarity
  FROM public.knowledge_base kb
  WHERE 
    CASE 
      WHEN filter_type IS NOT NULL THEN kb.type = filter_type
      ELSE true
    END
  ORDER BY kb.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- ============================================================
-- TRIGGER FUNCTION: handle_new_user
-- ============================================================
-- Automatically creates a profile when a new user signs up

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert profile with default role
  INSERT INTO public.profiles (id, name, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', ''),
    NEW.email,
    'customer'
  );
  
  -- Also sync role to auth.users metadata
  UPDATE auth.users
  SET raw_app_meta_data = 
    COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', 'customer')
  WHERE id = NEW.id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for new user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- TRIGGER FUNCTION: sync_role_to_metadata
-- ============================================================
-- Syncs role changes from profiles table to auth.users metadata
-- This ensures role is always available in the JWT token

CREATE OR REPLACE FUNCTION public.sync_role_to_metadata()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE auth.users
  SET raw_app_meta_data = 
    COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', NEW.role)
  WHERE id = NEW.id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for role changes
CREATE TRIGGER on_profile_role_change
  AFTER INSERT OR UPDATE OF role ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_role_to_metadata();

-- ============================================================
-- FUNCTION: update_updated_at_column
-- ============================================================
-- Updates the updated_at timestamp automatically

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add updated_at triggers
CREATE TRIGGER update_chat_sessions_updated_at
  BEFORE UPDATE ON public.chat_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_knowledge_base_updated_at
  BEFORE UPDATE ON public.knowledge_base
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- DATA MIGRATION: Restore existing users
-- ============================================================
-- If there are existing auth.users without profiles, create them

INSERT INTO public.profiles (id, name, email, role)
SELECT 
  id, 
  COALESCE(raw_user_meta_data->>'name', ''),
  email,
  'customer'
FROM auth.users
WHERE id NOT IN (SELECT id FROM public.profiles)
ON CONFLICT (id) DO NOTHING;

-- Sync all existing users' roles to metadata
UPDATE auth.users u
SET raw_app_meta_data = 
  COALESCE(raw_app_meta_data, '{}'::jsonb) || 
  jsonb_build_object('role', COALESCE(p.role, 'customer'))
FROM public.profiles p
WHERE u.id = p.id
  AND (raw_app_meta_data->>'role' IS NULL OR raw_app_meta_data->>'role' != p.role);
$$;
```

### 4. Configure Environment Variables

**Server** (`server/.env`):

```env
PORT=5180
SUPABASE_PROJECT_URL="https://YOUR_PROJECT.supabase.co"
ANON_PUBLIC_KEY="your-anon-key"
SECRET_SERVICE_ROLE_KEY="your-service-role-key"
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
│  Socket.IO  │────▶│  Knowledge Base  │ ──▶│   Mistral LLM │
│  or HTTP    │     │  Semantic Search │     │  (via Ollama) │
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
