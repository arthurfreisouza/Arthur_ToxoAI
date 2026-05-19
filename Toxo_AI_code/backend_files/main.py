import os
import shutil
from contextlib import asynccontextmanager
from datetime import timedelta
from typing import List, Optional

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from openai import OpenAI
from pydantic import BaseModel
from sqlalchemy.orm import Session

from auth import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    Token,
    UserCreate,
    UserLogin,
    UserResponse,
    create_access_token,
    get_password_hash,
    verify_password,
    verify_token,
)
from database import get_db, init_db
from models import Document, User
from rag import UPLOAD_DIR, create_or_update_vector_store, get_relevant_context, rebuild_vector_store

HF_API_TOKEN = os.environ.get("HF_API_TOKEN", "")
HF_MODEL_ID = "meta-llama/Llama-3.1-8B-Instruct:novita"

hf_client = OpenAI(
    base_url="https://router.huggingface.co/v1",
    api_key=HF_API_TOKEN or "placeholder",
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="ToxoAI Chat API", version="2.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://mychatbotproject.uk",
        "https://www.mychatbotproject.uk",
        "http://localhost:8080",
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

security = HTTPBearer()


# ── Shared dependency ─────────────────────────────────────────────────────────

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    username = verify_token(credentials.credentials)
    if not username:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class HistoryMessage(BaseModel):
    role: str
    content: str


class ChatMessage(BaseModel):
    message: str
    history: List[HistoryMessage] = []
    system_prompt: Optional[str] = None
    temperature: float = 0.7
    top_p: float = 0.95
    max_tokens: int = 500


class ChatResponse(BaseModel):
    response: str


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/")
def root():
    return {"message": "ToxoAI API", "version": "2.0.0"}


@app.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(user: UserCreate, db: Session = Depends(get_db)):
    if db.query(User).filter(User.username == user.username).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Username already registered"
        )
    if db.query(User).filter(User.email == user.email).first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Email already registered"
        )
    db_user = User(
        username=user.username,
        email=user.email,
        hashed_password=get_password_hash(user.password),
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user


@app.post("/login", response_model=Token)
def login(user_credentials: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == user_credentials.username).first()
    if not user or not verify_password(user_credentials.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Inactive user")

    access_token = create_access_token(
        data={"sub": user.username},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    return {"access_token": access_token, "token_type": "bearer"}


@app.get("/me", response_model=UserResponse)
def me(current_user: User = Depends(get_current_user)):
    return current_user


@app.post("/upload")
def upload_document(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    UPLOAD_DIR.mkdir(exist_ok=True)
    file_path = str(UPLOAD_DIR / f"{current_user.id}_{file.filename}")

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    try:
        create_or_update_vector_store(current_user.id, file_path)
    except Exception as e:
        os.remove(file_path)
        raise HTTPException(status_code=500, detail=f"Failed to index document: {e}")

    db_doc = Document(
        filename=file.filename, content_type=file.content_type, user_id=current_user.id
    )
    db.add(db_doc)
    db.commit()
    return {"message": f"Successfully uploaded and indexed {file.filename}"}


@app.get("/documents")
def get_documents(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    docs = db.query(Document).filter(Document.user_id == current_user.id).all()
    return [{"id": d.id, "filename": d.filename, "content_type": d.content_type} for d in docs]


@app.delete("/documents/{doc_id}")
def delete_document(
    doc_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    doc = db.query(Document).filter(
        Document.id == doc_id, Document.user_id == current_user.id
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    file_path = str(UPLOAD_DIR / f"{current_user.id}_{doc.filename}")
    if os.path.exists(file_path):
        os.remove(file_path)

    db.delete(doc)
    db.commit()

    remaining = db.query(Document).filter(Document.user_id == current_user.id).all()
    remaining_paths = [str(UPLOAD_DIR / f"{current_user.id}_{d.filename}") for d in remaining]
    rebuild_vector_store(current_user.id, remaining_paths)

    return {"message": "Document deleted"}


DEFAULT_SYSTEM_PROMPT = """You are ToxoAI, an educational AI assistant specialising in HIV testing, prevention, and health information.

Guidelines:
- Provide accurate, factual information about HIV testing
- Cover testing methods, accuracy, timelines, and what to expect
- Recommend consulting healthcare professionals for personal medical advice
- Be compassionate and non-judgmental
- Do not provide personal medical diagnoses
- Focus on education and prevention
- Keep responses concise and clear"""


@app.post("/chat", response_model=ChatResponse)
def chat(
    chat_request: ChatMessage,
    current_user: User = Depends(get_current_user),
):
    if not HF_API_TOKEN:
        raise HTTPException(status_code=503, detail="Chat service not configured (missing HF_API_TOKEN)")

    system_prompt = chat_request.system_prompt or DEFAULT_SYSTEM_PROMPT

    rag_context = get_relevant_context(chat_request.message, current_user.id)
    if rag_context:
        system_prompt += f"\n\nRelevant context from the user's uploaded documents:\n{rag_context}"

    messages: list[dict] = [{"role": "system", "content": system_prompt}]
    for h in chat_request.history:
        if h.role in ("user", "assistant"):
            messages.append({"role": h.role, "content": h.content})
    messages.append({"role": "user", "content": chat_request.message})

    try:
        completion = hf_client.chat.completions.create(
            model=HF_MODEL_ID,
            messages=messages,
            temperature=chat_request.temperature,
            top_p=chat_request.top_p,
            max_tokens=chat_request.max_tokens,
        )
        return ChatResponse(response=completion.choices[0].message.content.strip())
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI service error: {e}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
