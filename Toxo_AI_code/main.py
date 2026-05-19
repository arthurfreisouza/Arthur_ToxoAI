"""
Entry point for running uvicorn from the project root:
    uvicorn main:app --reload
or:
    python main.py
"""
import sys
import os

# Add backend_files to the path so all relative imports inside it resolve correctly
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "backend_files"))

from main import app  # noqa: F401  — re-exports backend_files/main.py's app

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
