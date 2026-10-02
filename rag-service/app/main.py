from fastapi import FastAPI
from pydantic import BaseModel

from app.ingestion import Ingestion
from app.rag_pipeline import RAGPipeline


app = FastAPI(title="AssistIQ RAG Service")

ingestion = Ingestion()
rag_pipeline = RAGPipeline()


class IngestionRequest(BaseModel):
    file_path: str


class QueryRequest(BaseModel):
    question: str
    top_k: int = 5


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/ingest")
def ingest(request: IngestionRequest):

    count = ingestion.ingest(
        request.file_path
    )

    return {
        "status": "success",
        "chunks_ingested": count
    }


@app.post("/query")
def query(request: QueryRequest):

    result = rag_pipeline.ask(
        question=request.question,
        top_k=request.top_k
    )

    return result