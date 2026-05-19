import os
import shutil
from pathlib import Path

from langchain_community.document_loaders import PyPDFLoader, TextLoader
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_community.vectorstores import FAISS
from langchain_text_splitters import RecursiveCharacterTextSplitter

BASE_DIR = Path(__file__).parent
UPLOAD_DIR = BASE_DIR / "uploads"
VECTOR_STORE_DIR = BASE_DIR / "vector_stores"

UPLOAD_DIR.mkdir(exist_ok=True)
VECTOR_STORE_DIR.mkdir(exist_ok=True)


def _get_embeddings() -> HuggingFaceEmbeddings:
    return HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")


def get_vector_store_path(user_id: int) -> str:
    return str(VECTOR_STORE_DIR / f"user_{user_id}")


def load_and_process_document(file_path: str):
    if file_path.endswith(".pdf"):
        loader = PyPDFLoader(file_path)
    elif file_path.endswith(".txt"):
        loader = TextLoader(file_path)
    else:
        raise ValueError(f"Unsupported file type: {file_path}")

    documents = loader.load()
    splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
    return splitter.split_documents(documents)


def create_or_update_vector_store(user_id: int, file_path: str):
    vector_store_path = get_vector_store_path(user_id)
    embeddings = _get_embeddings()
    texts = load_and_process_document(file_path)

    if os.path.exists(vector_store_path):
        vector_store = FAISS.load_local(
            vector_store_path, embeddings, allow_dangerous_deserialization=True
        )
        vector_store.add_documents(texts)
    else:
        vector_store = FAISS.from_documents(texts, embeddings)

    vector_store.save_local(vector_store_path)
    return vector_store


def get_retriever(user_id: int):
    vector_store_path = get_vector_store_path(user_id)
    if not os.path.exists(vector_store_path):
        return None
    embeddings = _get_embeddings()
    vector_store = FAISS.load_local(
        vector_store_path, embeddings, allow_dangerous_deserialization=True
    )
    return vector_store.as_retriever(search_kwargs={"k": 5})


def get_relevant_context(query: str, user_id: int) -> str:
    retriever = get_retriever(user_id)
    if not retriever:
        return ""
    docs = retriever.invoke(query)
    return "\n\n".join(doc.page_content for doc in docs)


def delete_vector_store(user_id: int):
    vector_store_path = get_vector_store_path(user_id)
    if os.path.exists(vector_store_path):
        shutil.rmtree(vector_store_path)


def rebuild_vector_store(user_id: int, file_paths: list[str]):
    delete_vector_store(user_id)
    for path in file_paths:
        if os.path.exists(path):
            create_or_update_vector_store(user_id, path)
