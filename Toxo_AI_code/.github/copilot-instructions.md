# Copilot Instructions for Arthur's RAG-Powered Chat Application 🎯

## Global Coding Rules
- Use emojis frequently when appropriate ✨
- Always refer to Arthur by name, even in examples
- When in doubt, ask clarifying questions first

## Architecture Overview 🏗️

This is a **FastAPI + LangChain RAG** application with document-backed conversational AI:

- **Backend**: FastAPI REST API with SQLAlchemy ORM (SQLite)
- **Frontend**: Vanilla JavaScript with token-based auth
- **LLM**: HuggingFace API (Llama-3.1-8B-Instruct via OpenAI client)
- **Vector Store**: FAISS (per-user, stored in `vector_stores/user_{id}/`)
- **Auth**: JWT tokens (30 minute expiry) with bcrypt password hashing

### Data Flow
1. User uploads PDF/TXT → saved to `uploads/{user_id}_{filename}`
2. Document chunked (size=1000, overlap=200) → embedded → stored in FAISS
3. Chat queries retrieve relevant chunks via `get_relevant_context(query, user_id)`
4. LLM receives system prompt + RAG context + user message → response

## Key Files Reference 📁

| File | Purpose |
|------|---------|
| `main.py` | FastAPI app, all endpoints (auth, documents, chat) |
| `rag.py` | LangChain RAG pipeline, FAISS vector store management |
| `auth.py` | JWT token handling, password hashing, Pydantic schemas |
| `models.py` | SQLAlchemy `User` and `Document` models |
| `database.py` | SQLite engine setup, session dependency for FastAPI |
| `app.js` | Frontend auth flow, API communication, token storage |

## Development Workflows 🛠️

### Starting the Backend
```bash
# Activate virtual environment (if not active)
source JMeter_env/bin/activate

# Start FastAPI with auto-reload
python main.py
# OR
uvicorn main:app --reload
```
- API available at `http://localhost:8000`
- Swagger docs at `http://localhost:8000/docs`
- Database auto-initializes on startup via `@app.on_event("startup")`

### Starting the Frontend
```bash
# In separate terminal
python3 -m http.server 8080
# Visit http://localhost:8080
```
- Frontend stores JWT token in `localStorage` under key `"token"`
- All authenticated requests include `Authorization: Bearer {token}` header

### Database/Vector Store Reset
- Delete `users.db` to reset user database
- Delete `vector_stores/` to clear all vector stores
- Delete `uploads/` to clear all uploaded files

## API Endpoints Pattern 🔌

All authenticated endpoints follow this pattern:
```python
@app.post("/endpoint")
def handler(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
):
    token = credentials.credentials
    username = verify_token(token)  # Returns None if invalid
    if not username:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = db.query(User).filter(User.username == username).first()
    # ... rest of handler
```

**Key endpoints:**
- `POST /register` - Create user account
- `POST /login` - Get JWT token
- `GET /me` - Get current user info
- `POST /upload` - Upload document (triggers RAG indexing)
- `GET /documents` - List user's documents
- `DELETE /documents/{doc_id}` - Delete & rebuild FAISS index
- `POST /chat` - Send message with RAG context

## Critical Configuration 🔑

**MUST update for production** (currently in code):
- `auth.py` line 14: `SECRET_KEY` for JWT signing
- `main.py` line 38: `HF_API_TOKEN` for HuggingFace API
- Move all secrets to `.env` file before deployment
- Change CORS `allow_origins=["*"]` to specific domains

## LangChain/RAG Patterns ⚙️

### Vector Store Management
- **Per-user isolation**: Each user gets `vector_stores/user_{user_id}/`
- **Update strategy**: New documents appended to existing FAISS index
- **On deletion**: Remaining documents re-embedded to rebuild vector store
- **Chunk settings**: 1000-char chunks with 200-char overlap (marked TODO - make configurable)

### Chat Context Flow
```python
rag_context = get_relevant_context(query, user.id)  # Returns top 5 chunks
# Context appended to system_prompt before API call to HuggingFace
```

## Important Constraints & Gotchas ⚠️

1. **Hardcoded secrets**: HuggingFace API key in `main.py` - move to `.env`
2. **FAISS persistence**: Vector stores on disk only, no backup - use version control or backup
3. **Document tracking**: DB tracks metadata, filesystem stores actual files - keep in sync
4. **Token expiry**: 30-minute expiry - may need frontend auto-refresh logic
5. **No rate limiting**: Add before production deployment
6. **Email validation**: Currently accepts any string - add proper validation if needed
7. **File organization**: Uploaded files named `{user_id}_{filename}` - important for deletion

## Testing Quick Commands 🧪

```bash
# Register user
curl -X POST "http://localhost:8000/register" \
  -H "Content-Type: application/json" \
  -d '{"username": "arthur", "email": "arthur@test.com", "password": "testpass"}'

# Login
curl -X POST "http://localhost:8000/login" \
  -H "Content-Type: application/json" \
  -d '{"username": "arthur", "password": "testpass"}'

# Use returned token for authenticated endpoints
TOKEN="eyJ..."
curl -X GET "http://localhost:8000/me" \
  -H "Authorization: Bearer $TOKEN"

# Upload a document
curl -X POST "http://localhost:8000/upload" \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@path/to/document.pdf"

# Send a chat message
curl -X POST "http://localhost:8000/chat" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message": "What is HIV testing?", "temperature": 0.7, "top_p": 0.95, "max_tokens": 500}'
```

## Code Style Notes ✨

- **FastAPI patterns**: Always use `Depends()` for dependency injection (db, auth)
- **Validation**: Pydantic models in `auth.py` for request/response schemas
- **Constants**: Define at module level (e.g., `UPLOAD_DIR`, `VECTOR_STORE_DIR`)
- **RAG separation**: Keep concerns separate - load(), process(), embed()
- **Error handling**: Always include meaningful error messages in HTTPException
- **Database queries**: Use SQLAlchemy ORM patterns, filter() instead of raw SQL
