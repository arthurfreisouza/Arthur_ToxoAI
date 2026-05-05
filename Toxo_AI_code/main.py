from fastapi import FastAPI, Depends, HTTPException, status, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from datetime import timedelta
from pydantic import BaseModel
from typing import Optional
from openai import OpenAI
import os
import shutil

from database import get_db, init_db
from models import User, Document
from rag import create_or_update_vector_store, get_relevant_context, rebuild_vector_store, delete_vector_store
from auth import (
    UserCreate, 
    UserLogin, 
    Token, 
    UserResponse,
    get_password_hash, 
    verify_password, 
    create_access_token,
    verify_token,
    ACCESS_TOKEN_EXPIRE_MINUTES
)

# Pydantic Models
class ChatMessage(BaseModel):
    message: str
    context: str = "HIV Testing Assistant"
    system_prompt: Optional[str] = None  # Optional: override default system prompt
    temperature: float = 0.7  # Controls randomness (0.0-2.0)
    top_p: float = 0.95  # Nucleus sampling (0.0-1.0)
    max_tokens: int = 500  # Maximum response length

class ChatResponse(BaseModel):
    response: str

# HuggingFace Configuration
HF_API_TOKEN = "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"
HF_MODEL_ID = "meta-llama/Llama-3.1-8B-Instruct:novita"

# Initialize OpenAI client for HuggingFace
hf_client = OpenAI(
    base_url="https://router.huggingface.co/v1",
    api_key=HF_API_TOKEN,
)

# Initialize FastAPI app
app = FastAPI(title="Simple Login System", version="1.0.0")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Security
security = HTTPBearer()


@app.on_event("startup")
def startup_event():
    """Initialize database on startup"""
    init_db()


@app.get("/")
def root():
    """Root endpoint"""
    return {
        "message": "Welcome to the Login System API",
        "endpoints": {
            "register": "/register",
            "login": "/login",
            "me": "/me"
        }
    }


@app.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(user: UserCreate, db: Session = Depends(get_db)):
    """Register a new user"""
    # Check if username already exists
    existing_user = db.query(User).filter(User.username == user.username).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already registered"
        )
    
    # Check if email already exists
    existing_email = db.query(User).filter(User.email == user.email).first()
    if existing_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # Create new user
    hashed_password = get_password_hash(user.password)
    db_user = User(
        username=user.username,
        email=user.email,
        hashed_password=hashed_password
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    
    return db_user


@app.post("/login", response_model=Token)
def login(user_credentials: UserLogin, db: Session = Depends(get_db)):
    """Login user and return JWT token"""
    # Find user
    user = db.query(User).filter(User.username == user_credentials.username).first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Verify password
    if not verify_password(user_credentials.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Check if user is active
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Inactive user"
        )
    
    # Create access token
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.username}, 
        expires_delta=access_token_expires
    )
    
    return {
        "access_token": access_token, 
        "token_type": "bearer"
    }


@app.get("/me", response_model=UserResponse)
def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
):
    """Get current logged-in user information"""
    token = credentials.credentials
    username = verify_token(token)
    
    if username is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    user = db.query(User).filter(User.username == username).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found"
        )
    
    return user


@app.post("/upload")
def upload_document(
    file: UploadFile = File(...),
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
):
    """Upload a document for RAG"""
    token = credentials.credentials
    username = verify_token(token)
    if username is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    
    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    
    os.makedirs("uploads", exist_ok=True)
    file_path = f"uploads/{user.id}_{file.filename}"
    
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # create/update vector store
        create_or_update_vector_store(user.id, file_path)
        
        # save to db
        db_doc = Document(filename=file.filename, content_type=file.content_type, user_id=user.id)
        db.add(db_doc)
        db.commit()
        
        return {"message": f"Successfully uploaded and indexed {file.filename}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/documents")
def get_documents(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
):
    """Get user's uploaded documents"""
    token = credentials.credentials
    username = verify_token(token)
    if not username:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = db.query(User).filter(User.username == username).first()
    
    docs = db.query(Document).filter(Document.user_id == user.id).all()
    return [{"id": d.id, "filename": d.filename, "content_type": d.content_type} for d in docs]


@app.delete("/documents/{doc_id}")
def delete_document(
    doc_id: int,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
):
    """Delete user's uploaded document"""
    token = credentials.credentials
    username = verify_token(token)
    if not username:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = db.query(User).filter(User.username == username).first()
    
    doc = db.query(Document).filter(Document.id == doc_id, Document.user_id == user.id).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
        
    # Delete physical file
    file_path = f"uploads/{user.id}_{doc.filename}"
    if os.path.exists(file_path):
        os.remove(file_path)
        
    db.delete(doc)
    db.commit()
    
    # Rebuild vector store with remaining files     
    remaining_docs = db.query(Document).filter(Document.user_id == user.id).all()
    remaining_paths = [f"uploads/{user.id}_{d.filename}" for d in remaining_docs]
    rebuild_vector_store(user.id, remaining_paths)
    
    return {"message": "Document deleted"}


@app.post("/chat", response_model=ChatResponse)
def chat(
    chat_request: ChatMessage,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
):
    """Chat with HIV Testing Assistant powered by Llama-3.1-8B-Instruct"""
    # Verify user is authenticated
    token = credentials.credentials
    username = verify_token(token)
    
    if username is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    user = db.query(User).filter(User.username == username).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found"
        )
    
    # Create system prompt for HIV Testing Assistant
    default_system_prompt = """You are an HIV Testing Assistant, an educational AI helping users understand HIV testing, prevention, and health information. 
    
    Important guidelines:
    - Provide accurate, factual information about HIV testing
    - Discuss testing methods, accuracy, timeline, and what to expect
    - Suggest consulting healthcare professionals for medical advice
    - Be compassionate and non-judgmental
    - Avoid providing personal medical diagnosis
    - Focus on education and prevention
    - Keep responses concise and helpful"""
    
    # Use custom system prompt if provided, otherwise use default
    system_prompt = chat_request.system_prompt if chat_request.system_prompt else default_system_prompt
    
    # Extract parameters from request
    temperature = chat_request.temperature
    top_p = chat_request.top_p
    max_tokens = chat_request.max_tokens
    user_message = chat_request.message
    
    # RAG Context Retrieval
    rag_context = get_relevant_context(user_message, user.id)
    if rag_context:
        system_prompt += f"\n\nHere is some context extracted from the user's uploaded documents that might be relevant:\n{rag_context}"
    
    try:
        # Call HuggingFace API through OpenAI client
        completion = hf_client.chat.completions.create(
            model=HF_MODEL_ID,
            messages=[
                {
                    "role": "system",
                    "content": system_prompt
                },
                {
                    "role": "user",
                    "content": user_message
                }
            ],
            temperature=temperature,
            top_p=top_p,
            max_tokens=max_tokens,
        )
        
        # Extract response
        response_text = completion.choices[0].message.content.strip()
        
        return ChatResponse(response=response_text)
    
    except Exception as e:
        print(f"Chat error: {str(e)}")
        return ChatResponse(response=f"Sorry, I encountered an error: {str(e)}. Please try again.")



if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
