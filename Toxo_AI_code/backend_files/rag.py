import os
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.document_loaders import PyPDFLoader, TextLoader
from langchain_community.vectorstores import FAISS
from langchain_community.embeddings import HuggingFaceEmbeddings

# Directory to store uploaded files and vector stores
UPLOAD_DIR = "uploads"
VECTOR_STORE_DIR = "vector_stores"

# Ensure directories exist
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(VECTOR_STORE_DIR, exist_ok=True)

def get_vector_store_path(user_id: int) -> str:
    """Returns the path to the user's vector store."""
    return os.path.join(VECTOR_STORE_DIR, f"user_{user_id}")

def load_and_process_document(file_path: str):
    """Loads and processes a single document (PDF or TXT)."""
    if file_path.endswith(".pdf"):
        loader = PyPDFLoader(file_path)
    elif file_path.endswith(".txt"):
        loader = TextLoader(file_path)
    else:
        raise ValueError("Unsupported file type")
    
    documents = loader.load()
    text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200) ### TODO: WE NEED TO PASS THIS AS PARAMETERS
    texts = text_splitter.split_documents(documents)
    return texts

def create_or_update_vector_store(user_id: int, file_path: str):
    """Creates or updates a vector store for a user."""
    vector_store_path = get_vector_store_path(user_id)
    embeddings = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")
    
    texts = load_and_process_document(file_path)
    
    if os.path.exists(vector_store_path):
        # Update existing vector store
        vector_store = FAISS.load_local(vector_store_path, embeddings, allow_dangerous_deserialization=True)
        vector_store.add_documents(texts)
    else:
        # Create new vector store
        vector_store = FAISS.from_documents(texts, embeddings)
    
    vector_store.save_local(vector_store_path)
    return vector_store

def get_retriever(user_id: int):
    """Gets the retriever for a user's vector store."""
    vector_store_path = get_vector_store_path(user_id)
    
    if not os.path.exists(vector_store_path):
        return None
        
    embeddings = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")
    vector_store = FAISS.load_local(vector_store_path, embeddings, allow_dangerous_deserialization=True)
    return vector_store.as_retriever(search_kwargs={"k": 5})

def get_relevant_context(query: str, user_id: int) -> str:
    """Retrieves relevant context from the user's documents."""
    retriever = get_retriever(user_id)
    if not retriever:
        return ""
    
    docs = retriever.get_relevant_documents(query)
    context = "\n\n".join([doc.page_content for doc in docs])
    return context

def delete_vector_store(user_id: int):
    import shutil
    vector_store_path = get_vector_store_path(user_id)
    if os.path.exists(vector_store_path):
        shutil.rmtree(vector_store_path)

def rebuild_vector_store(user_id: int, file_paths: list[str]):
    delete_vector_store(user_id)
    if not file_paths:
        return
    for path in file_paths:
        if os.path.exists(path):
            create_or_update_vector_store(user_id, path)
