# Copilot Instructions for ToxoAI

## Architecture Overview

This is a **FastAPI + LangChain RAG** application with document-backed conversational AI:

- **Backend**: FastAPI REST API with SQLAlchemy ORM (SQLite)
- **Frontend**: Vanilla JavaScript single-page app with token-based auth
- **LLM**: HuggingFace API (Llama-3.1-8B-Instruct via OpenAI-compatible client)
- **Vector Store**: FAISS (per-user, stored in `backend_files/vector_stores/user_{id}/`)
- **Auth**: JWT tokens (60-minute expiry) with bcrypt password hashing

### Data Flow

1. User uploads PDF/TXT → validated (type + 10 MB limit) → saved to `uploads/{user_id}_{filename}`
2. Document chunked (size=1000, overlap=200) → embedded (sentence-transformers) → stored in FAISS
3. Embedding model and FAISS stores are cached in memory after first load
4. Chat query → top-5 relevant chunks retrieved → appended to system prompt → sent to LLM

## Key Files Reference

| File | Purpose |
|------|---------|
| `backend_files/main.py` | FastAPI app, all endpoints (auth, documents, chat), rate limiter |
| `backend_files/rag.py` | LangChain RAG pipeline, FAISS vector store management, in-memory caches |
| `backend_files/auth.py` | JWT token handling, password hashing, Pydantic request/response schemas |
| `backend_files/models.py` | SQLAlchemy `User` and `Document` models |
| `backend_files/database.py` | SQLite engine setup, `get_db` session dependency |
| `frontend_files/app.js` | Auth flow, API communication, markdown renderer, toast notifications |
| `frontend_files/style.css` | All styles — auth card, chat UI, toasts, mobile responsive |
| `frontend_files/index.html` | Single-page shell — auth page + app shell |

## Development Workflows

### Starting the Backend

```bash
# Activate the project virtual environment
source toxoenv/bin/activate

# Run from backend_files/ — the DB and relative paths depend on CWD
cd backend_files
python main.py
# OR
uvicorn main:app --reload --port 8000
```

- API: `http://localhost:8000`
- Swagger docs: `http://localhost:8000/docs`
- Database initialises on startup via the `lifespan` async context manager (not `@app.on_event`)

### Starting the Frontend

```bash
cd frontend_files
python3 -m http.server 8080
# Visit http://localhost:8080
```

For local dev, change `API_URL` in `app.js` from `https://mychatbotproject.uk` to `http://localhost:8000`.

Frontend stores the JWT in `localStorage` under key `"token"`. All authenticated requests send `Authorization: Bearer {token}`.

Conversation history is persisted in `localStorage` under key `"toxoai_history"`.

### Database / Vector Store Reset

```bash
# Reset users and documents
rm backend_files/users.db

# Clear all vector stores (forces re-indexing on next upload)
rm -rf backend_files/vector_stores/

# Clear uploaded files
rm -rf backend_files/uploads/
```

## API Endpoints

### Public

| Method | Path | Notes |
|--------|------|-------|
| GET | `/health` | Returns `{"status": "ok"}` |
| GET | `/` | API version info |
| POST | `/register` | `username` (3–30 chars, alnum/hyphen/underscore), `password` (≥ 8 chars) |
| POST | `/login` | Returns `{"access_token": "...", "token_type": "bearer"}` |

### Authenticated (Bearer token)

All authenticated endpoints use the `get_current_user` dependency which validates the JWT and returns the `User` ORM object:

```python
@app.post("/endpoint")
def handler(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # current_user is already validated — no manual token check needed
    ...
```

| Method | Path | Notes |
|--------|------|-------|
| GET | `/me` | Returns current user info |
| POST | `/upload` | PDF or TXT only, max 10 MB. Triggers FAISS indexing. |
| GET | `/documents` | Lists user's documents |
| DELETE | `/documents/{doc_id}` | Deletes file + rebuilds FAISS index from remaining docs |
| POST | `/chat` | Rate-limited (30 req/60 s per user). Accepts `message`, `history`, `temperature`, `top_p`, `max_tokens`. |

## Critical Configuration

All secrets are read from environment variables — never hard-coded:

| Variable | File | Notes |
|----------|------|-------|
| `SECRET_KEY` | `auth.py` | JWT signing key — generate with `python -c "import secrets; print(secrets.token_hex(32))"` |
| `HF_API_TOKEN` | `main.py` | HuggingFace API token |

Copy `.env.example` to `.env` and fill both values before running.

CORS is already scoped to `mychatbotproject.uk` and localhost — do not open it to `"*"`.

## LangChain / RAG Patterns

### Caching (important)

Both the embedding model and FAISS stores are cached at module level in `rag.py`:

```python
_embeddings: HuggingFaceEmbeddings | None = None   # loaded once, ~300 MB
_vector_store_cache: dict[int, FAISS] = {}          # keyed by user_id
```

Always call the module functions (`create_or_update_vector_store`, `get_relevant_context`, etc.) — never instantiate `HuggingFaceEmbeddings` directly in other files.

The cache is invalidated (`_invalidate_cache(user_id)`) whenever a vector store is deleted or rebuilt.

### Vector Store Lifecycle

- **Upload**: `create_or_update_vector_store(user_id, file_path)` — appends to existing FAISS or creates new
- **Delete**: `rebuild_vector_store(user_id, remaining_paths)` — clears disk + cache, rebuilds from remaining files
- **Chat**: `get_relevant_context(query, user_id)` — returns top-5 chunk strings joined by `\n\n`

## Rate Limiting

Implemented in `main.py` as a sliding-window counter (no external dependencies):

```python
RATE_LIMIT = 30       # requests
RATE_WINDOW = 60.0    # seconds
```

Applied only to `POST /chat`. Returns HTTP 429 with `"Too many requests"` detail when exceeded.

## Testing Quick Commands

```bash
# Register (password must be ≥ 8 characters)
curl -X POST "http://localhost:8000/register" \
  -H "Content-Type: application/json" \
  -d '{"username": "arthur", "email": "arthur@test.com", "password": "testpass123"}'

# Login
curl -X POST "http://localhost:8000/login" \
  -H "Content-Type: application/json" \
  -d '{"username": "arthur", "password": "testpass123"}'

# Set token
TOKEN="eyJ..."

# Get current user
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

## Code Style Notes

- **FastAPI patterns**: use `Depends()` for all dependencies (db, `get_current_user`)
- **Schemas**: Pydantic models in `auth.py` for request/response validation
- **Constants**: define at module level (`UPLOAD_DIR`, `VECTOR_STORE_DIR`, `RATE_LIMIT`, etc.)
- **RAG separation**: keep load / process / embed / retrieve concerns in `rag.py` only
- **Error handling**: meaningful `detail` strings in every `HTTPException`
- **Database**: SQLAlchemy ORM with `filter()` — no raw SQL
