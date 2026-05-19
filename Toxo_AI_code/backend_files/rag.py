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

# Module-level singleton — the embedding model is expensive to load (~300 MB).
# Re-creating it on every request was a critical performance bug.
_embeddings: HuggingFaceEmbeddings | None = None

# In-memory cache of loaded FAISS stores keyed by user_id.
# Avoids reading from disk on every chat message.
_vector_store_cache: dict[int, FAISS] = {}


def _get_embeddings() -> HuggingFaceEmbeddings:
    global _embeddings
    if _embeddings is None:
        _embeddings = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")
    return _embeddings


def _invalidate_cache(user_id: int) -> None:
    _vector_store_cache.pop(user_id, None)


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


def create_or_update_vector_store(user_id: int, file_path: str) -> FAISS:
    vector_store_path = get_vector_store_path(user_id)
    embeddings = _get_embeddings()
    texts = load_and_process_document(file_path)

    if os.path.exists(vector_store_path):
        store = FAISS.load_local(
            vector_store_path, embeddings, allow_dangerous_deserialization=True
        )
        store.add_documents(texts)
    else:
        store = FAISS.from_documents(texts, embeddings)

    store.save_local(vector_store_path)
    _vector_store_cache[user_id] = store
    return store


def _load_vector_store(user_id: int) -> FAISS | None:
    if user_id in _vector_store_cache:
        return _vector_store_cache[user_id]
    vector_store_path = get_vector_store_path(user_id)
    if not os.path.exists(vector_store_path):
        return None
    store = FAISS.load_local(
        vector_store_path, _get_embeddings(), allow_dangerous_deserialization=True
    )
    _vector_store_cache[user_id] = store
    return store


def get_retriever(user_id: int):
    store = _load_vector_store(user_id)
    return store.as_retriever(search_kwargs={"k": 5}) if store else None


def get_relevant_context(query: str, user_id: int) -> str:
    retriever = get_retriever(user_id)
    if not retriever:
        return ""
    docs = retriever.invoke(query)
    return "\n\n".join(doc.page_content for doc in docs)


def delete_vector_store(user_id: int) -> None:
    _invalidate_cache(user_id)
    vector_store_path = get_vector_store_path(user_id)
    if os.path.exists(vector_store_path):
        shutil.rmtree(vector_store_path)


def rebuild_vector_store(user_id: int, file_paths: list[str]) -> None:
    delete_vector_store(user_id)
    for path in file_paths:
        if os.path.exists(path):
            create_or_update_vector_store(user_id, path)
