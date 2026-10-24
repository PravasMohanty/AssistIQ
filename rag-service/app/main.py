import os
from pathlib import Path
from datetime import datetime
from typing import Optional
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from app.ingestion import Ingestion
from app.rag_pipeline import RAGPipeline


app = FastAPI(title="AssistIQ RAG Service")

ingestion = Ingestion()
rag_pipeline = RAGPipeline()

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)


class IngestionRequest(BaseModel):
    file_path: str
    document_id: Optional[str] = None


class QueryRequest(BaseModel):
    question: str
    top_k: int = 5


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/documents")
def list_documents():
    documents = []
    if DATA_DIR.exists():
        for file in DATA_DIR.iterdir():
            if file.is_file() and file.suffix.lower() in [".txt", ".md"]:
                stat = file.stat()
                doc_id = file.stem
                chunks_count = ingestion.store.get_document_chunks_count(doc_id)
                documents.append({
                    "id": doc_id,
                    "filename": file.name,
                    "extension": file.suffix.lower(),
                    "size_bytes": stat.st_size,
                    "modified_at": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                    "chunks_count": chunks_count,
                    "status": "ingested" if chunks_count > 0 else "pending"
                })

    documents.sort(key=lambda d: d["modified_at"], reverse=True)
    return {
        "status": "success",
        "count": len(documents),
        "documents": documents
    }


@app.post("/ingest")
def ingest(request: IngestionRequest):
    # Resolve relative paths relative to rag-service root if needed
    path_obj = Path(request.file_path)
    if not path_obj.is_absolute():
        resolved_path = DATA_DIR.parent / request.file_path
        if not resolved_path.exists():
            resolved_path = path_obj
    else:
        resolved_path = path_obj

    if not resolved_path.exists():
        raise HTTPException(
            status_code=404,
            detail=f"File not found: {request.file_path}"
        )

    doc_id = request.document_id or resolved_path.stem

    try:
        count = ingestion.ingest(
            str(resolved_path),
            document_id=doc_id
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {
        "status": "success",
        "document_id": doc_id,
        "filename": resolved_path.name,
        "chunks_ingested": count
    }


@app.post("/documents/{document_id}/reingest")
def reingest_document(document_id: str):
    # Find matching file in DATA_DIR
    target_file = None
    for file in DATA_DIR.iterdir():
        if file.is_file() and file.stem == document_id:
            target_file = file
            break

    if not target_file:
        raise HTTPException(
            status_code=404,
            detail=f"Document '{document_id}' not found in data directory"
        )

    try:
        count = ingestion.ingest(str(target_file), document_id=document_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    return {
        "status": "success",
        "document_id": document_id,
        "filename": target_file.name,
        "chunks_ingested": count
    }


@app.delete("/documents/{document_id}")
def delete_document(document_id: str):
    # Delete chunks from ChromaDB
    ingestion.delete(document_id)

    # Delete physical file from data directory if exists
    deleted_files = []
    if DATA_DIR.exists():
        for file in DATA_DIR.iterdir():
            if file.is_file() and file.stem == document_id:
                try:
                    file.unlink()
                    deleted_files.append(file.name)
                except Exception as e:
                    print(f"Failed to delete {file}: {e}")

    return {
        "status": "success",
        "message": f"Document '{document_id}' removed from ChromaDB and data directory",
        "deleted_files": deleted_files
    }


@app.post("/query")
def query(request: QueryRequest):
    result = rag_pipeline.ask(
        question=request.question,
        top_k=request.top_k
    )
    return result