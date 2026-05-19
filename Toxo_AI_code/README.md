# ToxoAI — HIV Testing Assistant

A full-stack AI chat application with RAG (Retrieval-Augmented Generation) for HIV testing education. Users register, log in, optionally upload personal documents, and chat with a Llama-3.1-based assistant that uses those documents as context.

## Features

### Backend
- User registration and login with JWT authentication
- Password hashing with bcrypt
- SQLite database (SQLAlchemy ORM)
- Per-user document upload (PDF, TXT — max 10 MB)
- RAG pipeline: documents chunked → embedded → stored in FAISS per user
- AI chat endpoint backed by HuggingFace (Llama-3.1-8B-Instruct)
- Sliding-window rate limiting on the chat endpoint (30 req/min)
- CORS scoped to `mychatbotproject.uk` and localhost

### Frontend
- Auth page (sign in / register) with tab switching
- Chat UI with markdown rendering, typing indicator, copy-to-clipboard
- Document sidebar with upload and inline delete confirmation
- Toast notification system
- Conversation persistence across page refreshes (localStorage)
- Mobile-responsive with slide-in sidebar and hamburger button
- New Chat button to start a fresh conversation

## Project Structure

```
Toxo_AI_code/
├── backend_files/
│   ├── main.py        # FastAPI app — all endpoints
│   ├── rag.py         # LangChain RAG pipeline, FAISS vector store management
│   ├── auth.py        # JWT handling, password hashing, Pydantic schemas
│   ├── models.py      # SQLAlchemy User and Document models
│   ├── database.py    # SQLite engine and session dependency
│   ├── uploads/       # Uploaded files: {user_id}_{filename}
│   └── vector_stores/ # Per-user FAISS indexes: user_{id}/
├── frontend_files/
│   ├── index.html     # Single-page app shell
│   ├── style.css      # All styles (auth card, chat UI, responsive)
│   └── app.js         # Auth flow, API calls, markdown renderer, UI logic
├── deploy/
│   └── creating_VM.yaml
├── .env.example       # Environment variable template
└── requirements.txt   # Python dependencies
```

## Installation

### 1. Create and activate a virtual environment

```bash
python3 -m venv toxoenv
source toxoenv/bin/activate        # Linux / macOS
# toxoenv\Scripts\activate         # Windows
```

### 2. Install dependencies

```bash
pip install -r requirements.txt
```

### 3. Configure environment variables

```bash
cp .env.example .env
# Edit .env and fill in HF_API_TOKEN and SECRET_KEY
```

## Running the Application

### Start the backend

Run from inside `backend_files/`:

```bash
cd backend_files
python main.py
```

Or using uvicorn directly:

```bash
cd backend_files
uvicorn main:app --reload --port 8000
```

The API will be available at `http://localhost:8000`.  
Interactive docs: `http://localhost:8000/docs`

### Serve the frontend locally

```bash
cd frontend_files
python3 -m http.server 8080
# Visit http://localhost:8080
```

> The frontend points to `https://mychatbotproject.uk` as the API base URL.  
> Change `API_URL` in `app.js` to `http://localhost:8000` for local development.

## API Endpoints

### Public

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | API info |
| GET | `/health` | Health check — returns `{"status": "ok"}` |
| POST | `/register` | Create a new user account |
| POST | `/login` | Authenticate and receive a JWT |

#### POST `/register`

```json
// Request
{ "username": "john_doe", "email": "john@example.com", "password": "securepass123" }

// Response 201
{ "id": 1, "username": "john_doe", "email": "john@example.com", "is_active": true }
```

Username rules: 3–30 characters, letters/numbers/hyphens/underscores only.  
Password minimum: 8 characters.

#### POST `/login`

```json
// Request
{ "username": "john_doe", "password": "securepass123" }

// Response 200
{ "access_token": "eyJ...", "token_type": "bearer" }
```

### Authenticated (Bearer token required)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/me` | Current user info |
| POST | `/upload` | Upload a PDF or TXT document (max 10 MB) |
| GET | `/documents` | List the user's uploaded documents |
| DELETE | `/documents/{doc_id}` | Delete a document and rebuild FAISS index |
| POST | `/chat` | Send a message and receive an AI response |

#### POST `/chat`

```json
// Request
{
  "message": "What HIV tests are available?",
  "history": [
    { "role": "user",      "content": "..." },
    { "role": "assistant", "content": "..." }
  ],
  "temperature": 0.7,
  "top_p": 0.95,
  "max_tokens": 800
}

// Response 200
{ "response": "There are several types of HIV tests..." }
```

Rate limit: 30 requests per 60 seconds per user. Returns HTTP 429 when exceeded.

## Testing with curl

```bash
# Register
curl -X POST "http://localhost:8000/register" \
  -H "Content-Type: application/json" \
  -d '{"username": "testuser", "email": "test@example.com", "password": "testpass123"}'

# Login
curl -X POST "http://localhost:8000/login" \
  -H "Content-Type: application/json" \
  -d '{"username": "testuser", "password": "testpass123"}'

# Authenticated request (replace TOKEN)
TOKEN="eyJ..."
curl "http://localhost:8000/me" -H "Authorization: Bearer $TOKEN"

# Upload a document
curl -X POST "http://localhost:8000/upload" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@path/to/document.pdf"

# Chat
curl -X POST "http://localhost:8000/chat" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "What is HIV testing?", "temperature": 0.7, "max_tokens": 800}'
```

## Security Notes

> These are already handled, documented here for awareness:
- JWT `SECRET_KEY` is read from the `SECRET_KEY` environment variable — **never hard-code it**
- HuggingFace token is read from `HF_API_TOKEN` environment variable
- File uploads are validated for content type (PDF/TXT), extension, and size (≤ 10 MB)
- CORS is restricted to `mychatbotproject.uk` and localhost — not open to all origins
- Rate limiting is active on the chat endpoint

> Still recommended for a production hardening pass:
- Migrate from SQLite to PostgreSQL for concurrent writes
- Add HTTPS termination at the reverse proxy (nginx)
- Use a secrets manager (e.g. AWS Secrets Manager) instead of `.env`

## Technologies

| Layer | Technology |
|-------|-----------|
| API framework | FastAPI |
| ORM | SQLAlchemy |
| Database | SQLite |
| Auth | python-jose (JWT), passlib (bcrypt) |
| AI client | openai SDK (pointed at HuggingFace router) |
| LLM | meta-llama/Llama-3.1-8B-Instruct (via HuggingFace) |
| RAG | LangChain, FAISS, sentence-transformers |
| PDF parsing | pypdf |
| Server | Uvicorn |
| Frontend | HTML5, CSS3, Vanilla JavaScript |

## License

MIT
