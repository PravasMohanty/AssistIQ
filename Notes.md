# AssistIQ — Guided Notes for Understanding the Whole Project

This is a teaching document for someone who is new to the frontend and wants to understand what **every important folder and file does**, how the pieces talk to one another, and what happens after a user clicks a button.

It describes the code currently present in this repository. It does not assume you already understand React, APIs, databases, authentication, or RAG.

---

## 1. Start with the big idea

AssistIQ is a customer-support chat application. A user signs in, sends a question, and receives an AI-generated answer based on documents uploaded by an administrator.

The project is split into three applications and three supporting services:

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ Your web browser                                                         │
│ React frontend, served by Vite (normally http://localhost:5173)          │
│                                                                          │
│ Auth page • Chat page • Admin pages • CSS • Socket.IO client             │
└─────────────────────────────┬────────────────────────────────────────────┘
                              │
                HTTP requests │  WebSocket events
                              ▼
┌──────────────────────────────────────────────────────────────────────────┐
│ Node.js / Express server (normally http://localhost:5180)                │
│                                                                          │
│ Authentication • permissions • sessions • message persistence            │
│ REST API routes • Socket.IO server • file upload handling                │
└───────────┬─────────────────────────────────────┬────────────────────────┘
            │                                     │
            │ SQL                                 │ HTTP
            ▼                                     ▼
┌──────────────────────────┐       ┌──────────────────────────────────────┐
│ PostgreSQL                │       │ Python FastAPI RAG service (:8001)  │
│ users / sessions /        │       │ document ingestion and answer flow  │
│ chat message history      │       └──────────────┬───────────────┬───────┘
└──────────────────────────┘                      │               │
                                                    ▼               ▼
                                          ┌──────────────┐  ┌─────────────┐
                                          │ ChromaDB     │  │ Ollama      │
                                          │ embeddings / │  │ embeddings  │
                                          │ text chunks  │  │ + Mistral   │
                                          └──────────────┘  └─────────────┘
```

The important ownership rule is:

- The **browser** is responsible for displaying screens and collecting user input.
- The **Express server** is responsible for deciding who is allowed to do something and saving chat/account data.
- The **RAG service** is responsible for turning documents into searchable chunks and asking the AI model for an answer.
- **PostgreSQL** stores normal relational data. **ChromaDB** stores vectors used for semantic document search.

The browser never connects directly to PostgreSQL, ChromaDB, or Ollama. That is important: database passwords and service details stay on the server side.

---

## 2. A few terms used throughout these notes

| Term | Plain-English meaning in this project |
|---|---|
| Frontend / client | The code executed in the user's browser. In this repository it is the `client/` folder. |
| Backend / server | Code that runs outside the browser. Here that is the Express app in `server/`. |
| API | A URL-based agreement: the frontend makes a request and the server returns data. For example, `POST /api/auth/login`. |
| REST / HTTP | The usual request-response web model. A browser sends one request and receives one response. |
| Socket.IO / WebSocket | A long-lived connection. Either the client or server can send messages after it has connected. Used for the preferred chat path. |
| Component | A reusable React function that returns user-interface description (JSX). |
| JSX | HTML-like syntax inside JavaScript, such as `<button>Send</button>`. React turns it into DOM updates. |
| State | A value React remembers between renders, for example the text typed into a message box. |
| Context | A way to share app-wide state, such as the signed-in user, without passing props through every component. |
| JWT | A signed login token. The browser sends it with later requests so the server can identify the user. |
| Middleware | A small server function that runs before a route controller, commonly to authenticate or authorize a request. |
| Controller | A server function that performs one route's real work and sends the response. |
| RAG | Retrieval-Augmented Generation. The system retrieves relevant document text first, then supplies that text to the language model while it produces an answer. |
| Embedding / vector | A long list of numbers representing the meaning of text. Similar meanings tend to have vectors close together. |

---

## 3. Repository map: where to look first

```text
AssistIQ/
├── README.md                  Quick start and ordinary project guide
├── architecture.md            Technical architecture and implementation notes
├── Notes.md                   This beginner-oriented walkthrough
├── docker-compose.yml         Starts PostgreSQL, Redis, and ChromaDB containers
│
├── client/                    Everything that runs in the browser
│   ├── index.html             Initial HTML shell Vite serves
│   ├── package.json           Client dependencies and scripts
│   ├── api/                   Small wrappers around backend HTTP endpoints
│   ├── socket/                Socket.IO connection singleton
│   ├── public/                Static files served unchanged
│   └── src/                   React application source files
│
├── server/                    Node.js Express and Socket.IO application
│   ├── src/server.js          Backend entry point
│   ├── routes/                Maps URL paths to controllers
│   ├── controllers/           Implements request behavior
│   ├── middleware/            Auth, role, and file-upload checks
│   ├── sockets/               Real-time Socket.IO chat behavior
│   ├── config/                Database connection and SQL schema
│   └── utils/                 RAG HTTP client and older utility code
│
└── rag-service/               Python service responsible for RAG
    ├── app/main.py            FastAPI entry point
    └── app/                   Loading, chunking, embedding, search, generation
```

If you are new to the project, read code in this order:

1. This section and the frontend sections below.
2. `client/index.html` → `client/src/main.jsx` → `client/src/App.jsx`.
3. `client/src/contexts/AuthContext.jsx`.
4. The page you care about: `AuthPage.jsx`, `ChatPage.jsx`, or `AdminPage.jsx`.
5. The API module that page imports, for example `client/api/chat.js`.
6. The matching route in `server/routes/`, then its controller in `server/controllers/`.
7. If it is a chat or KB action, continue into `server/utils/ragClient.js` and `rag-service/app/`.

---

## 4. Before code runs: programs and ports

Four processes need to run for the whole application to work locally:

| Process | Purpose | Default address |
|---|---|---|
| Vite | Serves the React development site, rebuilds when frontend files change. | `http://localhost:5173` |
| Express + Socket.IO | Handles login, API calls, chats, uploads, and real-time events. | `http://localhost:5180` |
| FastAPI RAG service | Handles document ingestion, Chroma retrieval, and AI generation. | `http://127.0.0.1:8001` |
| Ollama | Runs local embedding and language models. | `http://localhost:11434` |

Docker Compose supplies these supporting data services:

| Container | Port | Used for |
|---|---:|---|
| PostgreSQL | 5432 | User accounts, chat sessions, messages. |
| ChromaDB | 8000 | Vectorized RAG document chunks. |
| Redis | 6379 | Started by Compose but not used by current source code. |

### The normal startup order

```powershell
# At project root: database and vector database
docker compose up -d

# First time only: make sure PostgreSQL has the tables in server/config/schema.sql

# One terminal: local models
ollama serve

# A second terminal
cd rag-service
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8001

# A third terminal
cd server
npm install
npm run dev

# A fourth terminal
cd client
npm install
npm run dev
```

The client and server must agree on the server port. The checked-in `client/.env` currently points the browser to port `5001`, whereas `server/src/server.js` uses `5180` unless `PORT` changes it. For the normal setup, use these client settings:

```env
VITE_API_URL=http://localhost:5180/api
VITE_SOCKET_URL=http://localhost:5180
```

Do not put server-only secrets in `client/.env`. In particular, `JWT_SECRET`, `DB_PASSWORD`, and `ADMIN_SIGNUP_CODE` should live in `server/.env`.

---

# Part I — Frontend: from a blank browser tab to a page

## 5. What the frontend is made of

The frontend lives in `client/` and uses **React** plus **Vite**.

- **Vite** is the development/build tool. It serves the project quickly and converts/imports JavaScript modules for the browser.
- **React** organizes the screen as components and updates only the parts of the page whose state changed.
- **React Router** decides which React page to display for a URL such as `/auth` or `/chat`.
- **Axios** makes HTTP requests to the Express API.
- **Socket.IO Client** maintains the optional real-time chat connection.
- **Lucide React** supplies icon components such as `<Send />` and `<Bot />`.
- Plain **CSS** styles the app. There is no Tailwind, component framework, or CSS-in-JS library here.

### `client/package.json`

This is the frontend's manifest. Important sections:

```json
"scripts": {
  "dev": "vite",
  "build": "vite build",
  "lint": "eslint .",
  "preview": "vite preview"
}
```

- `npm run dev` starts the development server.
- `npm run build` produces a production bundle in `client/dist/`.
- `npm run lint` checks the JavaScript/JSX against style/safety rules.
- `npm run preview` locally serves a previously built production bundle.

Dependencies tell you what the source imports. `package-lock.json` records exact installed package versions; it is generated by npm and normally not edited manually.

### `client/vite.config.js`

This enables Vite's React plugin. There is no reverse proxy configuration. That means API calls are not silently forwarded by Vite; `VITE_API_URL` must point directly to Express, and Express must permit the Vite browser origin through CORS.

### `client/index.html`

This is **not** the full UI. It is the very small HTML page Vite initially sends:

```html
<div id="root"></div>
<script type="module" src="/src/main.jsx"></script>
```

The `#root` element is an empty placeholder. React takes control of it. The module script begins the actual app by loading `src/main.jsx`.

The file also provides the browser page title, favicon (`/assistIQ.png`), viewport setup for mobile screens, description, and the Inter font request.

### `client/public/` and `client/src/assets/`

| File | Meaning |
|---|---|
| `public/assistIQ.png` | Public image used as the browser icon in `index.html`. Files under `public` are served directly from the site root. |
| `public/vite.svg` | Standard Vite starter asset. The current UI does not use it. |
| `src/assets/react.svg` | Standard Vite starter asset. The current UI does not import it. |

---

## 6. JavaScript modules, imports, exports, and JSX

Before reading React code, understand the syntax you see everywhere.

### Imports and exports

An `export` lets one file offer something. An `import` lets another file use it.

```js
// file A: named export
export const getToken = () => { /* ... */ }

// file B: named import
import { getToken } from './token'
```

```js
// file A: default export
export default ChatPage

// file B: default import; this local name can be chosen by the importer
import ChatPage from './pages/ChatPage'
```

In this project, `App.jsx`, each page, and most components use a default export. API files mostly export named objects such as `chatAPI`.

### JSX

JSX looks like HTML but runs inside JavaScript:

```jsx
const Welcome = ({ name }) => {
  return <h1>Hello, {name}!</h1>
}
```

- `className` is used instead of HTML's `class`, because `class` is a JavaScript keyword.
- Braces, `{ ... }`, mean “evaluate this JavaScript expression here.”
- A component must use one outer returned element, often a `<div>` or React fragment.
- `onClick={handleSave}` passes a JavaScript function to run when the user clicks.
- `{isAdmin && <AdminPanel />}` means “only render this component when `isAdmin` is true.”

React later turns that JSX description into DOM changes. You do not manually call `document.createElement` in this application.

---

## 7. The frontend entry chain

The browser's initial call order is:

```text
client/index.html
  → client/src/main.jsx
     → BrowserRouter
     → AuthProvider
     → App
        → selected page/component tree
```

### `client/src/main.jsx`

This is the React entry module:

```jsx
createRoot(document.getElementById('root')).render(
  <BrowserRouter>
    <AuthProvider>
      <App />
    </AuthProvider>
  </BrowserRouter>,
)
```

Read it inside-out:

1. `document.getElementById('root')` finds the empty `<div>` from `index.html`.
2. `createRoot(...)` tells React it controls that DOM location.
3. `<BrowserRouter>` listens to the browser URL and enables client-side navigation without complete page reloads.
4. `<AuthProvider>` provides shared signed-in-user state to every component below it.
5. `<App />` supplies the route definitions and page selection.

It also imports `src/index.css`, which makes the global CSS variables and common styles available application-wide.

---

## 8. React state and hooks used in this app

React calls a component function to calculate what it should display. It calls that function again when its state changes. Hooks are special React functions that make state, effects, references, and shared context available in a function component.

### `useState`: remembered changing values

Example from the chat page:

```jsx
const [inputMessage, setInputMessage] = useState('')
```

- `inputMessage` is the current text.
- `setInputMessage('Hello')` stores a new value and tells React to render again.
- The initial value is `''`, an empty string.

The common input pattern is:

```jsx
<input
  value={inputMessage}
  onChange={(event) => setInputMessage(event.target.value)}
/>
```

This is called a **controlled input**. The input displays exactly what React state says, and typing changes that state.

### `useEffect`: do something after React renders

An effect is used for work outside rendering: fetching data, registering event listeners, creating timers, or connecting to external systems.

```jsx
useEffect(() => {
  initSession()
}, [])
```

The empty dependency list `[]` means “run after this component first appears.” `ChatPage` uses it to load or create a session.

An effect can return cleanup work:

```jsx
useEffect(() => {
  window.addEventListener('event-name', handler)
  return () => window.removeEventListener('event-name', handler)
}, [])
```

`AuthContext` uses exactly this pattern for the custom unauthorized event. `ChatPage` uses it to remove a socket listener and cancel retry timers when the page is left.

### `useRef`: remember a value without causing a render

`ChatPage` uses refs for DOM elements:

```jsx
const inputRef = useRef(null)
const messagesEndRef = useRef(null)
```

It attaches them with `ref={inputRef}` or `ref={messagesEndRef}`. Later it can call:

```js
inputRef.current?.focus()
messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
```

The `?.` means “only do this if the value exists.” This avoids errors during a render where the element is not mounted yet.

### `useCallback`: retain a stable function reference

`ChatPage` wraps `scrollToBottom` in `useCallback`. This tells React to reuse the same function object unless its dependencies change. It prevents unnecessary effect re-runs when that callback appears in an effect dependency list.

### `useContext`: read shared information

The project has an authentication context. Any descendant of `AuthProvider` can ask for it through the custom `useAuth()` hook instead of receiving user data through many component props.

---

## 9. Global app routing: `client/src/App.jsx`

`App.jsx` reads the shared authentication state:

```jsx
const { user, loading } = useAuth()
```

While it is checking whether an existing browser token is valid, it renders `<Loader />`. This prevents a quick flash of the login page before a real signed-in user is restored.

Once loading finishes, it defines these routes:

| URL | What is rendered | Rule |
|---|---|---|
| `/auth` | `AuthPage` | Public login/sign-up page. A signed-in user is redirected away. |
| `/chat` | `ProtectedRoute` → `Layout` → `ChatPage` | Must have an authenticated user. |
| `/admin` | `ProtectedRoute` → `Layout` → `AdminRoute` → `AdminPage` | Must have `role === 'admin'`. |
| `/admin/kb` | `ProtectedRoute` → `Layout` → `AdminRoute` → `KBUploadPage` | Must have `role === 'admin'`. |
| any other URL | `<Navigate>` | Redirects to `/auth`, `/chat`, or `/admin` based on current auth state. |

### Why there are two guard components

`ProtectedRoute.jsx` is the first guard:

```text
not loading + no user  → redirect to /auth
user exists            → render its children
```

`AdminRoute.jsx` is the extra guard for admin screens:

```text
no user                → redirect to /auth
user but not admin     → redirect to /chat
admin                  → render its children
```

These are frontend usability guards, not the ultimate security enforcement. A visitor can modify browser code or call an HTTP endpoint manually. Express must—and generally does—apply its own middleware for protected actions.

### `Layout.jsx` and `Navbar.jsx`

`Layout` always renders:

```jsx
<div className="app-layout">
  <Navbar />
  <Outlet />
</div>
```

`<Outlet />` means “render the matched nested route here.” When the current route is `/chat`, the outlet becomes `ChatPage`; when it is `/admin`, it becomes `AdminPage`.

`Navbar` gets `profile`, `logout`, and `isAdmin` from `useAuth()`. It:

- always shows the Chat link;
- conditionally shows Admin and Knowledge Base links only for an admin;
- displays the name/email from the profile;
- calls context `logout()` when the logout button is pressed.

`Loader.jsx` is simply the reusable full-screen spinner used while an auth or route decision is still in progress.

---

## 10. Authentication state: `client/src/contexts/`

There are three files because each has one focused responsibility.

| File | Purpose |
|---|---|
| `contextInstance.js` | Creates the empty `AuthContext` container. |
| `AuthContext.jsx` | Fills that context with real state and functions. |
| `useAuth.js` | Provides a safe convenience hook for consuming the context. |

### `contextInstance.js`

```js
export const AuthContext = createContext(null)
```

At this point there is no user yet. `null` is the default value if a component tries to read the context outside its provider.

### `useAuth.js`

```js
const context = useContext(AuthContext)
if (!context) throw new Error('useAuth must be used within AuthProvider')
return context
```

This catches programming mistakes early. A page cannot quietly run without the auth provider installed around it.

### `AuthContext.jsx`: the application's login memory

It stores three pieces of React state:

| State | Meaning |
|---|---|
| `user` | The current signed-in user record, or `null`. |
| `profile` | Currently the same profile object, kept as a separately named value for UI usage. |
| `loading` | Whether initial session restoration is still happening. |

It exposes these values/functions to every child component:

```text
user, profile, loading,
login(), register(), logout(),
isAdmin, fetchProfile()
```

#### Page refresh / session restoration

When the provider first appears, its effect calls an inner `initializeAuth` function:

```text
1. Is there a JWT in localStorage?
   └─ no: finish loading; user stays null.

2. If yes, GET /api/auth/profile.
   ├─ valid token: set user/profile; attempt Socket.IO connection.
   └─ invalid or expired token: request fails; Axios handles 401 cleanup.

3. Mark loading false so App can choose routes.
```

The browser does not trust an old local JavaScript user object. It asks the server for `/auth/profile`, so the server confirms the token and reads the current profile from PostgreSQL.

#### Login

`login(email, password)` calls `authAPI.login`. On success it receives `{ user, access_token }`, saves the user/profile to React state, then attempts `connectSocket()`. If Socket.IO fails, login still succeeds because ordinary HTTP requests can handle chat as a fallback.

#### Registration

`register(...)` is intentionally simpler: it just asks `authAPI.register` to create an account. Registration does not automatically log in; `AuthPage` changes to sign-in mode and asks the person to sign in afterward.

#### Logout and automatic logout

`logout()` calls `authAPI.logout()` (which clears local storage), clears React state, and disconnects the socket.

There is also an automatic route: Axios dispatches the custom browser event `assistiq:unauthorized` if a request using the current stored token receives 401. `AuthProvider` listens for that event and performs the same local cleanup. This is how a one-hour expired JWT returns the visitor to the signed-out state.

---

## 11. The JWT token file: `client/api/token.js`

This tiny file is important because it centralizes browser token access:

```js
const TOKEN_KEY = 'assistiq_access_token'

getToken()       // localStorage.getItem(TOKEN_KEY)
setToken(token)  // localStorage.setItem(TOKEN_KEY, token)
clearToken()     // localStorage.removeItem(TOKEN_KEY)
```

It also exports:

```js
export const AUTH_UNAUTHORIZED_EVENT = 'assistiq:unauthorized'
```

and `notifyUnauthorized()`, which sends that event on `window`.

What this file **does not** hold:

- It does not generate a JWT.
- It does not hold a database password.
- It does not decide a role.
- It does not decrypt a JWT.

The only thing it persists is the opaque server-issued token string. The server generates and validates that token.

Local storage survives page refreshes, which is why a user stays signed in after refreshing. The security trade-off is that malicious JavaScript injected through an XSS vulnerability could read local storage, so preventing XSS matters.

---

## 12. HTTP API helpers: `client/api/`

The page components do not directly write Axios calls. Instead they call small API modules. This keeps user-interface code focused on state and display while endpoint URLs are kept in one place.

### `api.js`: the shared Axios client

`api.js` creates one Axios instance with:

```js
baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5180/api'
timeout: 150000
```

`import.meta.env.VITE_API_URL` is how Vite exposes a frontend environment variable. Only variables beginning with `VITE_` are exposed to browser code.

The 150-second timeout exists because a local AI answer may take much longer than an ordinary web API call.

#### Request interceptor

Before Axios sends a request, this interceptor runs:

```text
get token from token.js
  → if there is one, add:
    Authorization: Bearer <token>
  → remember the token on the request as _authToken
  → send request
```

Individual requests can pass `skipAuth: true`, used for login and registration because there is no token yet.

#### Response interceptor

After an error response, the interceptor checks:

```text
Was it a 401 Unauthorized response?
Did this request use a token?
Is that still the current local token?
Did the request not opt out of automatic handling?
```

If all answers are yes, it removes that token and sends the unauthorized event. Comparing `_authToken` to the current token matters: an old request must not erase a newer token after the user has already logged in again.

### `auth.js`

This module is used by `AuthContext`.

| Function | Request | Extra behavior |
|---|---|---|
| `register(email, password, name, adminCode)` | `POST /auth/register` | Trims/lowercases email and skips auth. |
| `login(email, password)` | `POST /auth/login` | Validates returned data, then saves `access_token` through `setToken`. |
| `getProfile()` | `GET /auth/profile` | Relies on the shared Axios interceptor to attach JWT. |
| `logout()` | no HTTP request | Clears local token only. |
| `getCurrentUser()` | conditionally calls profile | Convenience helper, unused by rendered pages. |
| `isAuthenticated()` | no network request | Returns whether any local token string exists. |

### `chat.js`

Used by `ChatPage` for HTTP fallback and history:

| Function | Backend request |
|---|---|
| `getMessages(sessionId)` | `GET /api/chat/:sessionId` |
| `sendMessage(sessionId, message)` | `POST /api/chat/send/:sessionId` with `{ message }` |

### `session.js`

The active `ChatPage` calls these methods:

| Function | Request | Why it is used |
|---|---|---|
| `createSession()` | `POST /session/create` | Starts a new active support chat. |
| `getCurrentSession()` | `GET /session/current` | Restores the user’s active chat if one exists. |
| `resolveSession(sessionId)` | `POST /session/resolve` with `{ session_id }` | Marks the chat closed/resolved. |

`AdminPage` uses `getAllSessions()` → `GET /session`, which the server reserves for admins.

The module also declares `getSession`, `deleteSession`, and `updateSessionTitle`. There are no corresponding routes in the current `sessionRouter`, so those helpers would return 404 if called. No current page calls them.

### `kb.js`

This module contains knowledge-base document actions:

| Function | Request | Active page caller |
|---|---|---|
| `getAllEntries()` | `GET /kb/entries` | `AdminPage`, `KBUploadPage` |
| `uploadFile(file)` | multipart `POST /kb/upload` | `KBUploadPage` |
| `deleteEntry(id)` | `DELETE /kb/entry/:id` | Both admin pages |
| `reingestEntry(id)` | `POST /kb/entry/:id/reingest` | Both admin pages |
| `syncEmbeddings()` | `POST /kb/sync` | Both admin pages |
| `search(query, top_k)` | `POST /kb/search` | No rendered page currently calls it. |
| `resolve(query, context)` | `POST /kb/resolve` | No rendered page currently calls it. |

`uploadFile` uses `FormData` because a file cannot be placed directly into normal JSON. The browser formats it as `multipart/form-data` with a field named `file`; Multer on Express reads that field.

### `health.js`, `test.js`, and `index.js`

- `health.js` provides health helper functions. Only `GET /health` exists on the backend; the declared `status`, `database`, and `all` requests do not currently exist.
- `test.js` is a client wrapper for old/development test endpoints. Most declared URLs do not exist; no visible UI imports it.
- `index.js` is a **barrel file**: it re-exports several API and socket modules from one place. It also provides `initializeApp()`, a convenience health/profile/socket initializer. The current app does not use it because `AuthProvider` performs the real initialization.

---

## 13. Real-time connection: `client/socket/socket.js`

This module creates a single shared Socket.IO connection. The variable `socket` starts as `null` and stays module-local:

```js
let socket = null
```

That makes it a singleton: `AuthProvider` and `ChatPage` use the same connection instead of opening duplicate connections.

### Connecting

`connectSocket()`:

1. Returns immediately if a connected socket already exists.
2. Reads the JWT through `getToken()`.
3. Throws if there is no token—anonymous sockets are not allowed.
4. Calls `io(...)` with `auth: { token }`.
5. Allows `websocket` first and `polling` second as a fallback transport.
6. Registers console handlers for connect, disconnect, and socket error.

The server reads this token at `socket.handshake.auth.token`, not from the HTTP `Authorization` header.

### Functions exported by the socket module

| Function | Purpose |
|---|---|
| `connectSocket()` | Open or reuse authenticated connection. |
| `getSocket()` | Return current socket or throw if not initialized. |
| `disconnectSocket()` | Close and forget socket during logout. |
| `sendMessage(chatId, message)` | Emit the `send_message` event. `ChatPage` emits directly in current code but this helper offers the same behavior. |
| `onMessageReceived(callback)` | Register listener for `receive_message`. |
| `offMessageReceived()` | Remove listeners for that event. |

The configured browser socket URL should be the Express server URL, normally `http://localhost:5180`. The code fallback is `http://localhost:5001`, which does not match the server default. Set `VITE_SOCKET_URL` explicitly.

---

## 14. The sign-in screen: `AuthPage.jsx`

`AuthPage` is the `/auth` screen. It is a good simple React page to study because it contains form state, conditionally rendered fields, an async submit handler, errors, and navigation.

### State in this page

| State | What it controls |
|---|---|
| `isLogin` | Whether the form is sign-in (`true`) or sign-up (`false`). |
| `email`, `password`, `name`, `adminCode` | Controlled form field values. |
| `error` | Error message shown after a failed request. |
| `success` | Sign-up confirmation message. |
| `submitting` | Disables the form and replaces the button content with a spinner. |

### What happens when submit is pressed

The form has `onSubmit={handleSubmit}`. Calling `event.preventDefault()` stops the browser from doing a traditional full-page HTML form submission.

```text
If isLogin is true:
  AuthPage → useAuth().login(email, password)
  → authAPI.login → POST /api/auth/login
  → token saved in localStorage
  → context stores user and tries socket
  → page navigates to /admin for admins, otherwise /chat

If isLogin is false:
  AuthPage → useAuth().register(...)
  → POST /api/auth/register
  → success message appears
  → form switches to sign-in mode; user signs in separately
```

The optional admin-code input only appears in sign-up mode. The code is sent to Express, which decides whether it is correct. Hiding or showing it on the frontend is not security; the server-side check is what matters.

`AuthPage.css` supplies the centered glass card, animated colored background circles, icons inside inputs, tabs, form feedback, and mobile-friendly sizing.

---

## 15. The chat screen: `ChatPage.jsx` in detail

`ChatPage` is the most important frontend file. It is the `/chat` page and combines session management, message history, optimistic UI, socket communication, HTTP fallback, timers, and view rendering.

### Chat state

| State | Meaning |
|---|---|
| `session` | Current active chat-session record from PostgreSQL. |
| `messages` | Array of user and AI message objects currently displayed. |
| `loading` | Whether session/history startup is still running. |
| `inputMessage` | Current contents of text input. |
| `sending` | Prevents another send while an answer is outstanding. |
| `aiTyping` | Shows animated typing dots. |
| `aiSlow` | Shows a slow-answer hint after 15 seconds. |
| `socketConnected` | Whether this page successfully registered its real-time receive listener. |
| `connectionError` | Banner text for session/socket problems. |
| `resolved` | Whether the user has marked this support session complete. |
| `resolving` | Disables resolution controls during resolution request. |

### Startup: obtain a session then messages

When the page first mounts, an effect calls `initSession()`.

```text
1. GET /api/session/current
   ├─ active session exists → use it
   └─ no active session or request error → try POST /api/session/create

2. Store the chosen session in `session` state.

3. GET /api/chat/:sessionId.

4. Store the ordered server message rows in `messages` state.

5. Turn off loading; React replaces startup spinner with chat UI.
```

The server response uses `{ status, data }`, so the page carefully accepts `res.session || res.data || res`. That makes the page tolerate a few possible response shapes.

### Socket listener registration

Another effect attempts to call `getSocket()` and check `sock.connected`.

- If successful, it calls `onMessageReceived(handleMessage)` and sets `socketConnected` to true.
- If unavailable, it retries with exponential backoff up to ten times.
- After maximum retries it shows a “standard mode” explanation and lets HTTP fallback handle messages.
- Cleanup removes the listener and cancels a pending retry timer when the page unmounts.

When the server emits `receive_message`, `handleMessage` appends an AI message to the `messages` array and turns off `aiTyping`/`sending`.

### Sending a message

The input form calls `handleSend`. Its full sequence is:

```text
1. Prevent normal form navigation.
2. Trim input; stop if blank, there is no session, or a send is already active.
3. Clear input and set sending / AI typing states.
4. Immediately append a temporary user message to UI.
5. Try connected Socket.IO first.
   ├─ connected → emit send_message { chatId: session.id, message }
   │              wait for receive_message event.
   └─ not connected or unavailable → use HTTP fallback.
6. HTTP fallback POSTs /api/chat/send/:sessionId.
   ├─ answer returned → append AI response to UI.
   └─ request failure/time-out → append a readable error message.
7. Focus the input again.
```

Step 4 is called an **optimistic UI update**: the interface shows the user’s own message immediately instead of waiting for the network. The server still saves the true message; if the page reloads, history comes from PostgreSQL.

### Typing and scrolling effects

- When `messages` or `aiTyping` changes, the page scrolls the bottom marker into view. This keeps the latest message visible.
- When `aiTyping` becomes true, a 15-second timer starts. If the answer still has not arrived, `aiSlow` becomes true and the UI says that the AI is still processing.
- Effects return cleanup functions so an old timer does not update a screen after it has disappeared.

### Resolving and starting another chat

Once there are at least two visible messages and the AI is not typing, a “Are your queries resolved?” card appears. Clicking the positive action:

```text
ChatPage → sessionAPI.resolveSession(session.id)
         → POST /api/session/resolve { session_id }
         → sets resolved = true
         → hides input and shows resolved screen
```

Clicking **Start New Chat** clears local UI state and calls `initSession()` again. The server's creation logic resolves any old active session first, then makes the new one.

### What the JSX is doing when it renders messages

```jsx
{messages.map((msg) => (
  <div key={msg.id} className={msg.sender_role === 'user' ? 'message-user' : 'message-ai'}>
    ...
    {msg.content}
  </div>
))}
```

- `.map(...)` turns every object in an array into one UI element.
- `key={msg.id}` gives React a stable identity for efficient list updates.
- The conditional class changes color/alignment for a user versus AI message.
- The actual message text appears through `{msg.content}`.

`ChatPage.css` contains the page-height layout, message bubbles, avatar styling, animated typing dots, resolve card, welcome state, particles, and mobile styles. CSS changes visual presentation only; it does not affect server behavior.

---

## 16. Admin screens: `AdminPage.jsx` and `KBUploadPage.jsx`

Only a user with `profile.role === 'admin'` can reach these pages through the router. The server repeats the role check before performing document actions.

### `AdminPage.jsx`

This page has two tabs controlled by `activeTab`:

| Tab | What it loads |
|---|---|
| Knowledge Base | `kbAPI.getAllEntries()` → `GET /api/kb/entries` |
| Sessions | `sessionAPI.getAllSessions()` → `GET /api/session/` |

When `activeTab` changes, an effect runs either `loadEntries()` or `loadAllSessions()`.

The knowledge tab lets an admin:

- search already listed documents locally by filename/ID;
- navigate to `/admin/kb` to upload;
- re-ingest one document;
- delete one document after browser confirmation;
- request a re-ingest of every document through Sync All.

The session tab renders an HTML table of all session titles, user IDs, statuses, and created dates. It does not open individual message histories.

`AdminPage.css` provides layout for tabs, document cards, toolbar, search field, and session table. It contains some modal-related styles that are not currently used by the page JSX.

### `KBUploadPage.jsx`

This is the dedicated document-management screen. It adds a drag-and-drop file picker and toast messages.

#### State and helpers

| State/helper | Reason |
|---|---|
| `entries`, `loading`, `searchQuery` | Document inventory state. |
| `selectedFile`, `uploading`, `dragActive` | Upload/dropzone state. |
| `syncingAll`, `reingestingId` | Disable/animate buttons during long RAG work. |
| `toasts`, `addToast()` | Temporary success/error notices. |
| `fileInputRef` | Lets clicking the decorative drop zone trigger the hidden real file input. |

#### Selecting a file

Both a file-input change and a drag/drop event call `handleFileSelection(file)`. It checks the extension and accepts only `.txt` or `.md`. This mirrors—but does not replace—the backend file-type check.

#### Upload sequence

```text
Select .txt/.md
  → handleUpload
  → kbAPI.uploadFile(selectedFile)
  → browser sends multipart/form-data with field name "file"
  → Express receives/saves/ingests it
  → result toast
  → clear input and call loadEntries() to refresh card list
```

The displayed “Chunking & Generating Embeddings via Ollama...” state is appropriate because file ingestion can take a while: every chunk requires an embedding request.

Deleting and re-ingesting similarly call their `kbAPI` functions, show feedback, then refresh the list. `KBUploadPage.css` styles the dropzone, cards, status chips, statistics, toasts, and responsive arrangement.

---

## 17. Frontend styling files: how CSS is organized

| File | What it styles |
|---|---|
| `src/index.css` | Global reset, dark color variables, typography, reusable button/input/card/badge/loader styles, utility classes, animations, base responsive behavior. |
| `src/App.css` | Small application shell class: `.app-layout`. |
| `src/components/Navbar.css` | Sticky navigation bar, links, user area, mobile behavior. |
| `src/pages/AuthPage.css` | Login/sign-up card, background orbs, fields and form feedback. |
| `src/pages/ChatPage.css` | Chat viewport, bubbles, welcome content, input bar, typing animation, resolution UI. |
| `src/pages/AdminPage.css` | Admin tabs, document-card grid, toolbars, sessions table. |
| `src/pages/KBUploadPage.css` | Upload dropzone, document statistics/cards, toast UI. |

`index.css` starts with CSS custom properties such as:

```css
:root {
  --bg-primary: #0a0e1a;
  --accent-primary: #6366f1;
  --text-primary: #f1f5f9;
  --nav-height: 64px;
}
```

A custom property is a reusable named value. For example, `background: var(--bg-primary)` means “use the shared primary background color.” This is why visual colors and spacing can be changed centrally.

Component/page files import their own CSS at the top, for example `import './ChatPage.css'`. Vite includes that CSS in the frontend bundle.

---

# Part II — Backend: how a frontend action reaches the database and AI

## 18. Express entry point: `server/src/server.js`

This is the Node backend starting file. Its order matters:

```text
1. Load server/.env with dotenv.config().
2. Import Express, HTTP, CORS, Socket.IO, routers, and socket setup.
3. Run startupCheck() to inspect PostgreSQL tables.
4. Create Express application.
5. Install CORS and request-body parsing middleware.
6. Mount API routers beneath /api.
7. Create one HTTP server around Express.
8. Attach Socket.IO to that same HTTP server.
9. Call setupSocket(io) to register socket authentication/events.
10. Listen on PORT or 5180.
```

Using a single HTTP server allows ordinary HTTP endpoints and Socket.IO to share one port.

### CORS and body parsing

```js
app.use(cors({ origin: 'http://localhost:5173', credentials: true }))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
```

- CORS answers the browser question “may a web page from port 5173 call this server on another port?”
- `express.json()` parses JSON request bodies into `req.body`.
- `express.urlencoded(...)` parses traditional form-style bodies.
- File uploads are different; Multer handles those routes separately.

### Router mount points

| Mount line | Final URL prefix | Router file |
|---|---|---|
| `app.use('/api', supaRouter)` | `/api` | `routes/supaRouter.js` |
| `app.use('/api/health', healthRouter)` | `/api/health` | `routes/healthRouter.js` |
| `app.use('/api/auth', authRoutes)` | `/api/auth` | `routes/authRouter.js` |
| `app.use('/api/kb', kbRouter)` | `/api/kb` | `routes/kbRouter.js` |
| `app.use('/api/chat', chatRouter)` | `/api/chat` | `routes/chatRouter.js` |
| `app.use('/api/test', testRouter)` | `/api/test` | `routes/testRouter.js` |
| `app.use('/api/session', sessionRouter)` | `/api/session` | `routes/sessionRouter.js` |

For example, `chatRouter.post('/send/:id', ...)` becomes `POST /api/chat/send/:id` because the main server mounted that router at `/api/chat`.

---

## 19. Database configuration and schema

### `server/config/db.js`

This creates one PostgreSQL connection pool using the `pg` library. A pool is a reusable managed group of database connections, rather than opening a brand-new TCP connection for every query.

It reads these environment values, with local defaults where shown:

```text
DB_HOST     default localhost
DB_PORT     default 5432
DB_NAME     default assistiq
DB_USER     default assistiq
DB_PASSWORD default assistiq_password
```

It exports `pool`, which controllers import and use as `pool.query(sql, values)`.

### `server/config/schema.sql`

This file defines three active PostgreSQL tables:

```text
profiles
  id, email, password_hash, name, role, created_at

chat_sessions
  id, user_id, title, status, created_at, updated_at

messages
  id, session_id, sender_role, content, created_at
```

Their relationships are:

```text
one profile       → many chat_sessions
one chat_session  → many messages
```

Foreign keys enforce the relationship. Deleting a profile cascades to its sessions; deleting a session cascades to its messages.

### `server/config/supabase.js`

This creates a Supabase client only if `SUPABASE_PROJECT_URL` and `SUPABASE_SECRET_KEY` exist. It belongs to an older alternate vector-search approach. The active chat and knowledge-base path does not import it; `server/utils/vectorUtils.js` does.

---

## 20. Backend route, middleware, controller pattern

It helps to separate three jobs:

```text
Route:      Which URL/method means which operation?
Middleware: Is request allowed and correctly prepared?
Controller: Do the actual work, query databases/services, return JSON.
```

Example: HTTP chat send

```text
POST /api/chat/send/:id
  → routes/chatRouter.js selects the route
  → authMiddleware verifies Bearer token and sets req.user
  → controllers/chatController.js sendMessage()
  → PostgreSQL + RAG service work
  → JSON response
```

### Authentication middleware: `middleware/authMiddleware.js`

It expects this request header:

```text
Authorization: Bearer eyJ...
```

It:

1. Checks the header exists and starts with `Bearer `.
2. Extracts the token string after the space.
3. Uses `jwt.verify(token, JWT_SECRET)`.
4. Places the decoded JWT payload on `req.user`.
5. Calls `next()` so the controller can run.

If missing, expired, or invalid, it sends a 401 JSON error instead of calling the controller.

### Admin middleware: `middleware/adminMiddleware.js`

This checks `req.user.role === 'admin'`. It normally follows `authMiddleware`, but can authenticate itself if necessary. Non-admin users receive 403 Forbidden. It protects document management and the all-sessions endpoint.

### Upload middleware: `middleware/uploadMiddleware.js`

Multer configures upload behavior:

- creates `rag-service/data` if needed;
- writes uploaded files there;
- accepts `.txt` and `.md` only;
- limits files to 25 MiB;
- sanitizes filenames to letters, numbers, underscore, hyphen, spaces, and dots before converting spaces to underscores.

The router wraps it in `handleUpload`, turning Multer errors into a 400 JSON response.

---

## 21. Authentication backend files

### `routes/authRouter.js`

| Request | Middleware | Controller |
|---|---|---|
| `POST /api/auth/register` | none | `register` |
| `POST /api/auth/login` | none | `login` |
| `GET /api/auth/profile` | auth | `getProfile` |
| `POST /api/auth/logout` | auth | `logout` |

### `controllers/authController.js`

#### Register

```text
Request body: email, password, name, optional adminCode
  → normalize email: trim + lowercase
  → validate email and password presence
  → if adminCode was supplied, compare it safely with server ADMIN_SIGNUP_CODE
  → reject existing email
  → bcrypt.hash(password, 12)
  → INSERT profile row
  → return created public user fields
```

`bcrypt.hash(password, 12)` uses a work factor of 12. The real password is never stored; only the hash is stored.

If a supplied admin code matches the server value, the role becomes `admin`; otherwise an omitted code produces role `user`. The code uses a timing-safe comparison when comparing nonempty codes.

#### Login

```text
Request body: email, password
  → read profile by email
  → bcrypt.compare(provided password, stored password_hash)
  → jwt.sign({ id, email, role }, JWT_SECRET, { expiresIn: '1h' })
  → return public user and access_token
```

The token has a one-hour expiry. It is the value saved by frontend `token.js`.

#### Profile and logout

`getProfile` uses `req.user.id` from authentication middleware to query PostgreSQL and returns the current user profile.

`logout` returns a success JSON message, but JWTs are stateless: it cannot invalidate a token by itself. The current browser logout flow simply removes the local token. A copied token remains valid until expiration unless a future deny-list/revocation system is added.

### Test endpoints

`routes/testRouter.js` exposes `POST /api/test/user-login` and `POST /api/test/admin-login`. `testController.js` calls the real login controller through a small response shim. These are development/testing helpers and should not be public in a production deployment because a successful test login returns a usable token.

---

## 22. Sessions and normal HTTP chat

### `routes/sessionRouter.js` and `controllers/sessionController.js`

The router applies `authMiddleware` to every session route first.

| Request | What controller does |
|---|---|
| `POST /api/session/create` | Resolves every current active session owned by this user, then inserts one new active session named `New Chat`. |
| `GET /api/session/current` | Returns the newest active session for this user, or `data: null`. |
| `POST /api/session/resolve` | Checks session ownership and changes its status to `resolved`. |
| `GET /api/session/` | Requires admin role and lists every session. |

Only `resolveSession` explicitly verifies the owner of a selected session because create/current naturally operate through `req.user.id` and all-sessions is an admin action.

### `routes/chatRouter.js` and `controllers/chatController.js`

| Request | Controller behavior |
|---|---|
| `GET /api/chat/:id` | Verifies session exists and belongs to caller; returns messages ordered oldest to newest. |
| `POST /api/chat/send/:id` | Verifies ownership and active status; saves user message; calls RAG; saves AI answer; returns answer. |

The fallback send path is deliberately straightforward:

```text
Browser HTTP POST
  → insert user message in PostgreSQL
  → queryRAG(message, 5)
  → insert AI message in PostgreSQL
  → response { status: 'success', response: aiAnswer }
```

If RAG fails after the user message was inserted, the current HTTP controller returns 500. That means history can contain a user message with no AI answer; it is an implementation limitation worth keeping in mind.

---

## 23. Real-time chat on the server: `server/sockets/socket.js`

The Socket.IO code runs on the same Express HTTP server but uses socket events rather than request URLs.

### Connection authentication

Before allowing a connection, `io.use(...)`:

```text
read socket.handshake.auth.token
  → jwt.verify(token, process.env.JWT_SECRET)
  → attach { id, email, role } as socket.user
  → permit connection
```

No token or bad token causes the connection to fail.

### The only business chat event

```text
Browser emits:  send_message    { chatId, message }
Server emits:   receive_message { id, chatId, sender_role, content, created_at }
Server may emit:error           { error }
```

The server's `send_message` handler repeats the HTTP safety checks:

1. Make sure `chatId` and a nonempty string message exist.
2. Find session in PostgreSQL.
3. Confirm its `user_id` equals `socket.user.id`.
4. Confirm it is still active.
5. Save the user message.
6. Call RAG.
7. Save AI answer with `RETURNING id, created_at`.
8. Send the saved AI message to that same browser socket.

Unlike the HTTP controller, the socket handler catches a RAG error and turns it into a friendly AI response before saving/emitting it. The current `ChatPage` listens for `receive_message`; it does not currently render the separate Socket.IO `error` event as a visible message.

---

## 24. Knowledge-base API on Express

`routes/kbRouter.js` is the bridge from admin UI to FastAPI.

| Express route | Required access | What happens |
|---|---|---|
| `POST /api/kb/upload` | auth + admin | Parse one `file`, write it locally, ask FastAPI to ingest it. |
| `POST /api/kb/entry` | auth + admin | Alias of upload. |
| `POST /api/kb/add` | auth + admin | Alias of upload. |
| `GET /api/kb/entries` | auth + admin | Ask FastAPI for current disk/Chroma document list. |
| `DELETE /api/kb/entry/:id` | auth + admin | Ask FastAPI to delete document chunks and physical file. |
| `POST /api/kb/entry/:id/reingest` | auth + admin | Ask FastAPI to rebuild one document's chunks. |
| `POST /api/kb/sync` | auth + admin | List then re-ingest every FastAPI document serially. |
| `POST /api/kb/search` | currently no auth | Calls RAG and returns context plus answer. |
| `POST /api/kb/resolve` | currently no auth | Calls RAG and returns answer. |

The two public RAG helper endpoints are commented as “auth-only” in the router but do not actually include `authMiddleware`. This is a real mismatch and should be fixed before public use.

### `controllers/kbController.js`

This controller does not itself embed text or query Chroma. It uses Axios to call the FastAPI service at `RAG_SERVICE_URL` or `http://127.0.0.1:8001`.

For upload:

```text
Multer has already placed file in rag-service/data
  → get saved filename and stem
  → POST FastAPI /ingest
       { file_path: 'data/<filename>', document_id: '<stem>' }
  → return chunk count and file details to browser
```

For document list/deletion/re-ingestion it proxies the FastAPI response and reshapes it for the frontend where useful.

`syncEmbeddings` first gets `/documents`, then loops one document at a time, calling each document's re-ingest endpoint. It returns a total after the whole loop completes. Large document libraries can take a long time because this happens synchronously in one HTTP request.

---

# Part III — Python RAG service and AI answer pipeline

## 25. FastAPI entry: `rag-service/app/main.py`

When started by:

```powershell
uvicorn app.main:app --reload --port 8001
```

Uvicorn imports `app.main`, finds the `app` variable, and serves that FastAPI object.

At import time, the file creates:

```python
ingestion = Ingestion()
rag_pipeline = RAGPipeline()
```

This means the RAG service tries to connect to ChromaDB during startup. The `data/` directory is also created if it does not already exist.

### FastAPI endpoints

| Endpoint | Purpose |
|---|---|
| `GET /health` | Basic `{ "status": "ok" }` response. |
| `GET /documents` | Lists `.txt`/`.md` files from `rag-service/data`, including chunk counts from Chroma. |
| `POST /ingest` | Loads, chunks, embeds, and stores one requested document. |
| `POST /documents/{document_id}/reingest` | Finds a matching file by stem and rebuilds vectors. |
| `DELETE /documents/{document_id}` | Deletes Chroma chunks and matching physical file(s). |
| `POST /query` | Retrieves relevant chunks and asks the language model for an answer. |

`IngestionRequest` and `QueryRequest` are Pydantic models. They describe/validate expected JSON input fields:

```python
class IngestionRequest(BaseModel):
    file_path: str
    document_id: Optional[str] = None

class QueryRequest(BaseModel):
    question: str
    top_k: int = 5
```

---

## 26. Ingestion: turning a document into searchable knowledge

Document ingestion starts when an admin uploads a `.txt` or `.md` file or asks to re-ingest it.

```text
source file
  → document_loader.py reads text
  → chunker.py splits text into labelled sections/chunks
  → embedder.py asks Ollama for one vector per chunk
  → chroma_store.py upserts text, vectors, IDs, metadata
  → ChromaDB collection assistiq_chunks
```

### `document_loader.py`

`load_text_file(file_path)`:

- checks that the path exists;
- permits only `.txt` or `.md` extension;
- reads UTF-8 text;
- raises a clear Python exception when invalid.

### `chunker.py`

This file has three jobs:

1. `split_sections(text)` looks for Markdown headings such as `## Returns` or simple labels such as `Returns:`.
2. If no headings are found, it treats the whole document as one section titled `General`.
3. `chunk_document(sections)` makes chunks from each section.

The default chunk settings are 500 characters per chunk with 100 characters overlapping the next chunk. Overlap means the final 100 characters of one chunk reappear at the start of the next; this helps avoid losing context at a chunk boundary.

A chunk object looks conceptually like:

```python
{
  "text": "the actual portion of document text",
  "section": "Returns Policy",
  "chunk_index": 0
}
```

### `embedder.py`

`Embedder.embed(text)` sends a request to Ollama's embeddings API:

```text
POST http://localhost:11434/api/embeddings
model: nomic-embed-text
prompt: <chunk or question text>
```

Ollama returns an embedding vector. The same embedding model is used for both document chunks and user questions; that is essential because vector distances are meaningful only when vectors come from compatible models.

### `chroma_store.py`

`ChromaStore` connects with Chroma's Python HTTP client to the Docker service at `localhost:8000` and opens/creates the collection named `assistiq_chunks`. Its metadata selects cosine similarity as the vector distance space.

When adding chunks, it:

1. Deletes any existing entries whose `document_id` matches the document being re-ingested.
2. Gives each chunk a deterministic ID such as `handbook_chunk_0`.
3. Embeds the chunk.
4. Builds metadata: document ID, section title, section-local index, document-global index.
5. Calls Chroma `upsert`, which inserts or replaces data with the same IDs.

The document stem is the ID. Therefore two files that sanitize to the same name/stem replace the same logical document; there is no version history currently.

### `ingestion.py`

`Ingestion` is the small coordinator class. `ingest(file_path, document_id)` calls the loader, section splitter, chunk builder, and Chroma store in that order. `delete(document_id)` delegates to Chroma deletion.

### Manual RAG test scripts

| File | What it is for |
|---|---|
| `ingestion_test.py` | Manually prints character count and detected sections for `data/handbook.txt`. |
| `chroma_test.py` | Manually verifies Chroma connectivity and counts collection items. |
| `rag-setup-complete.txt` | Setup marker, not program code. |
| `requirements.txt` | Python dependency lock/list used by `pip install -r`. |

---

## 27. Retrieval and generation: answering a user question

When either Express chat path needs an answer, it uses this chain:

```text
server/utils/ragClient.js
  → POST FastAPI /query { question, top_k: 5 }
  → RAGPipeline.ask(question, top_k)
       → Retriever.search
       → Generator.generate
  → { question, answer, context }
```

### `server/utils/ragClient.js`

This is the active Node-to-Python bridge. `queryRAG(question, top_k)` uses Axios to call the configured RAG service. It is used by:

- `chatController.sendMessage` (HTTP chat fallback),
- `sockets/socket.js` (Socket.IO chat),
- the KB search/resolve helper routes.

### `retriever.py`

`Retriever.search(query, top_k)`:

1. embeds the user question with `nomic-embed-text`;
2. asks Chroma for the nearest `top_k` vectors;
3. returns Chroma's documents, metadata, and distances.

It does not currently reject weak/far-away matches. It always passes the closest results to generation, even if they may not be very relevant.

### `generator.py`

`Generator.generate(question, context)` builds an instruction prompt saying, in essence:

```text
You are a customer-support assistant.
Answer only from the provided context.
If there is insufficient context, say so.
```

It calls Ollama:

```text
POST http://localhost:11434/api/generate
model: mistral
stream: false
```

The resulting `response` string is the AI answer shown in chat.

### `rag_pipeline.py`

This connects retrieval and generation:

```python
results = retriever.search(question, top_k)
documents = results["documents"][0]
context = "\n\n".join(documents)
answer = generator.generate(question, context)
return {"question": question, "answer": answer, "context": documents}
```

The empty line joining chunks gives the language model visually separated pieces of context.

This “answer only from context” rule is a prompt instruction, not mathematical proof that hallucination is impossible. More production-quality RAG usually adds relevance thresholds, source citations, test datasets, answer checks, and perhaps reranking.

---

# Part IV — Every remaining server and project file

## 28. Server utility and legacy files

| File | Explanation |
|---|---|
| `server/utils/vectorUtils.js` | An older alternative RAG design. It creates Ollama embeddings, asks Supabase through an RPC, and directly calls Ollama chat. The live chat path does **not** use it. |
| `server/utils/test.js` | Manual test runner for the older `vectorUtils` design. It loads `server/.env`, creates an embedding, and asks a sample question. |
| `server/testRagClient.js` | Manual Node smoke test for the active FastAPI `/query` client. |
| `server/controllers/supabaseController.js` | Despite name, it verifies active PostgreSQL tables (`profiles`, `chat_sessions`, `messages`) and is called as `startupCheck` from the server entry. |
| `server/routes/supaRouter.js` | Exposes `GET /api/test-supabase`, which actually runs that PostgreSQL schema check. |
| `server/routes/healthRouter.js` | Exposes only `GET /api/health`, returning a basic liveness message. |
| `server/package.json` | Declares backend dependencies and `npm run dev` → `nodemon src/server.js`. The `main: index.js` field is stale because no `index.js` exists. |
| `server/package-lock.json` | Exact backend dependency tree generated by npm. |
| `server/.gitignore` | Ignores `node_modules`. |

## 29. Other repository files

| File | Explanation |
|---|---|
| `docker-compose.yml` | Defines local PostgreSQL, Redis, and Chroma containers and persistent named volumes. It does not run Express, Vite, FastAPI, or Ollama. |
| `client/.env` | Browser-safe configuration values. Only names beginning `VITE_` are exposed to frontend code. |
| `client/.gitignore` | Prevents dependencies, build output, local env files, logs, and editor files from being committed. |
| `client/eslint.config.js` | Lint rules for JavaScript/JSX, React hooks, Vite Fast Refresh, and ignored `dist/`. |
| `rag-service/.gitignore` | Ignores Python cache/venv, local data documents, env files, editor/OS files, and logs. |
| `LICENSE` | MIT license. |
| `README.md` | Short, surface-level setup and usage guide. |
| `architecture.md` | System map, source-of-truth endpoint map, current technical issues, and recommendations. |

---

# Part V — Follow one real action end to end

## 30. Example: a user asks “How do I reset my password?”

This is the most useful sequence to be able to picture:

```text
1. User types text in ChatPage input.
   `onChange` keeps inputMessage state synchronized.

2. User submits form.
   handleSend() validates text/session and immediately renders an optimistic user bubble.

3. Preferred transport: browser Socket.IO emits:
   send_message { chatId, message }

4. Socket.IO server verifies JWT and finds socket.user.

5. Server checks chat_sessions:
   - session exists;
   - session belongs to socket.user;
   - session status is active.

6. Server inserts user text into PostgreSQL messages table.

7. Server calls FastAPI /query through ragClient.js.

8. FastAPI embeds the question with Ollama/nomic-embed-text.

9. Chroma finds five semantically nearest chunks from administrator-uploaded files.

10. FastAPI joins chunks as context and asks Ollama/Mistral to answer only from it.

11. FastAPI returns answer to Express.

12. Express stores AI answer as another PostgreSQL message row.

13. Socket.IO emits receive_message with the saved ID/content/time.

14. ChatPage listener appends AI message state.
    React renders a new AI bubble; its effect scrolls it into view.
```

If the socket did not connect, steps 3 and 13 become a normal Axios `POST /api/chat/send/:id` and JSON response. The database/RAG work is otherwise nearly the same.

## 31. Example: an admin uploads a policy document

```text
1. Admin reaches /admin/kb after router and server role checks.

2. Admin drags a .md or .txt file into KBUploadPage.
   Frontend validates extension and stores File object in selectedFile state.

3. Admin clicks Save to rag-service/data & Ingest.

4. kbAPI.uploadFile builds FormData and POSTs it to /api/kb/upload.

5. Express authMiddleware checks JWT.
   adminMiddleware checks role.
   Multer validates size/type, sanitizes name, saves file to rag-service/data.

6. kbController POSTs /ingest to FastAPI, giving file path and document ID.

7. FastAPI reads file; splits headings; makes overlapping chunks.

8. Each chunk is sent to Ollama/nomic-embed-text.

9. ChromaDB stores chunk text, vector, document ID, section, and indexes.

10. FastAPI returns number of chunks.
    Express forwards success JSON.
    KBUploadPage shows toast and refreshes list.
```

---

## 32. Current limitations you should know before changing code

These are not frontend concepts, but knowing them prevents confusion:

1. **Port mismatch:** client environment currently points to `5001`; Node defaults to `5180`. Align them before expecting the UI to work.
2. **Unauthenticated helper endpoints:** `/api/kb/search`, `/api/kb/resolve`, and `/api/test/*` are not protected in the current router. They should be protected/removed outside development.
3. **RAG service protection:** FastAPI `/ingest` accepts a caller-provided path. It should be private to trusted internal callers and constrained to `rag-service/data` before production deployment.
4. **Socket CORS:** Express HTTP CORS allows the Vite URL, while Socket.IO currently allows any origin. Use a matching explicit allow-list for both in production.
5. **No automated tests:** `npm test` is intentionally a failing placeholder. Current test-like scripts are manual smoke scripts.
6. **No document versioning:** document IDs come from filenames. Uploading a same-stem file replaces prior chunks.
7. **No RAG relevance threshold/citations:** the nearest chunks are always used and their sources are not displayed to the chat user.
8. **Long sync calls:** re-ingesting many or large documents happens serially during an HTTP request and may be slow.

---

## 33. A practical checklist for reading or modifying the frontend

When you see a button and want to understand it:

1. Find its `onClick` or form `onSubmit` in the page JSX.
2. Find the handler function in that same component.
3. Identify state changed using `setSomething(...)`.
4. Identify the API/socket method called.
5. Open the matching file under `client/api/` or `client/socket/`.
6. Copy its request path and find it under `server/routes/`.
7. Read the selected controller.
8. If it calls `queryRAG`, continue to `server/utils/ragClient.js` and Python `rag-service/app/`.
9. Return to the page handler to see how success/error data changes state and therefore changes UI.

When you add a frontend API feature, the usual change path is:

```text
React page/component
  → client/api/newFeature.js or existing API module
  → Express route
  → Express controller
  → middleware if protection is required
  → database/RAG/service behavior
```

Do not rely only on React route guards for security. Any sensitive server behavior must be checked in backend middleware/controllers.

---

## 34. Final mental model

You can understand the whole application as this repeated pattern:

```text
React state explains what the browser displays.

User interaction changes React state and usually triggers an API or socket call.

Express verifies the user, coordinates database/service work, and responds.

For chat knowledge, FastAPI retrieves Chroma document chunks and Ollama writes an answer.

The frontend receives data, puts it into state, and React redraws only the affected UI.
```

For normal chat, remember this concise call chain:

```text
ChatPage
  → Socket.IO or chatAPI
  → Express auth + session check
  → PostgreSQL message rows
  → FastAPI RAG
  → ChromaDB retrieval + Ollama generation
  → Express response/event
  → ChatPage state update
  → rendered AI message
```

That is the central workflow of AssistIQ.
