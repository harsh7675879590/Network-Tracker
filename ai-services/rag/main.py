"""
NetworkTracker — RAG Chatbot Service

FastAPI-based RAG (Retrieval-Augmented Generation) chatbot service.
Ingests network logs into ChromaDB and answers natural-language queries
about the network with source citations.
"""

import logging
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings

# ── Configuration ──────────────────────────────────────────────

class Settings(BaseSettings):
    chromadb_host: str = "localhost"
    chromadb_port: int = 8000
    collection_name: str = "network_logs"
    openai_api_key: str = ""
    openai_model: str = "gpt-3.5-turbo"
    otel_exporter_otlp_endpoint: str = "http://localhost:4317"
    log_level: str = "INFO"

    class Config:
        env_prefix = "RAG_"


settings = Settings()

# ── Logging ────────────────────────────────────────────────────

logging.basicConfig(
    level=getattr(logging, settings.log_level.upper()),
    format='{"timestamp":"%(asctime)s","level":"%(levelname)s","service":"rag-service","message":"%(message)s"}',
)
logger = logging.getLogger("rag-service")

# ── Pydantic Models (matching rag-service.yaml contract) ──────

class ContextFilters(BaseModel):
    time_range: Optional[dict] = None
    log_sources: Optional[list[str]] = None


class RagQueryRequest(BaseModel):
    question: str
    context_filters: Optional[ContextFilters] = None
    max_sources: int = Field(default=5, ge=1, le=20)


class SourceCitation(BaseModel):
    log_reference: str
    content_snippet: Optional[str] = None
    relevance_score: float = Field(ge=0, le=1)
    metadata: Optional[dict[str, Any]] = None


class RagQueryResponse(BaseModel):
    answer: str
    sources: list[SourceCitation]
    confidence: Optional[float] = Field(default=None, ge=0, le=1)
    processing_time_ms: Optional[int] = None


class LogEntry(BaseModel):
    content: str
    source: Optional[str] = None
    timestamp: Optional[str] = None
    metadata: Optional[dict[str, Any]] = None


class IngestRequest(BaseModel):
    logs: list[LogEntry]
    collection_name: str = "network_logs"


class IngestResponse(BaseModel):
    status: str
    documents_processed: int
    chunks_created: int
    collection_name: str


class HealthResponse(BaseModel):
    status: str
    chromadb_connected: bool
    llm_available: bool
    version: str


class ErrorResponse(BaseModel):
    error: str
    message: str
    timestamp: str
    details: Optional[dict[str, Any]] = None


# ── ChromaDB Client ───────────────────────────────────────────

import chromadb

def get_chroma_client():
    """Get or create the ChromaDB client."""
    try:
        client = chromadb.HttpClient(
            host=settings.chromadb_host,
            port=settings.chromadb_port
        )
        return client
    except Exception as e:
        logger.error(f"Failed to connect to ChromaDB: {e}")
        return None


def get_collection(client, collection_name: str = None):
    """Get or create the ChromaDB collection."""
    name = collection_name or settings.collection_name
    try:
        return client.get_or_create_collection(
            name=name,
            metadata={"hnsw:space": "cosine"}
        )
    except Exception as e:
        logger.error(f"Failed to get/create collection: {e}")
        raise


# ── Simple text chunking ──────────────────────────────────────

def chunk_text(text: str, chunk_size: int = 500, overlap: int = 50) -> list[str]:
    """Split text into overlapping chunks for embedding."""
    if len(text) <= chunk_size:
        return [text]

    chunks = []
    start = 0
    while start < len(text):
        end = min(start + chunk_size, len(text))
        chunks.append(text[start:end])
        start += chunk_size - overlap
    return chunks


# ── FastAPI App ────────────────────────────────────────────────

app = FastAPI(
    title="NetworkTracker RAG Chatbot Service",
    version="1.0.0",
    description="RAG chatbot for querying network logs via natural language.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/query", response_model=RagQueryResponse)
async def query_knowledge_base(request: RagQueryRequest):
    """
    Query the network knowledge base with a natural-language question.
    Retrieves relevant log entries from ChromaDB and generates an answer.
    """
    start_time = time.time()
    logger.info(f"Query received: {request.question}")

    client = get_chroma_client()
    if client is None:
        raise HTTPException(status_code=500, detail="ChromaDB is unavailable")

    try:
        collection = get_collection(client)

        # Query ChromaDB for relevant documents
        results = collection.query(
            query_texts=[request.question],
            n_results=request.max_sources,
        )

        # Build source citations from results
        sources = []
        context_parts = []

        if results and results["documents"] and results["documents"][0]:
            for i, doc in enumerate(results["documents"][0]):
                score = 1.0 - (results["distances"][0][i] if results["distances"] else 0)
                metadata = results["metadatas"][0][i] if results["metadatas"] else {}

                sources.append(SourceCitation(
                    log_reference=results["ids"][0][i],
                    content_snippet=doc[:200],
                    relevance_score=round(max(0, min(1, score)), 4),
                    metadata=metadata,
                ))
                context_parts.append(doc)

        # Generate answer using context
        # v1: Simple context-based response (no external LLM dependency)
        if context_parts:
            context = "\n---\n".join(context_parts)
            answer = (
                f"Based on the network logs, here is what I found regarding your question "
                f"'{request.question}':\n\n"
                f"The following relevant log entries were identified:\n\n"
            )
            for i, part in enumerate(context_parts[:3], 1):
                answer += f"{i}. {part[:300]}\n\n"
            answer += (
                "Note: This is an automated analysis based on retrieved log entries. "
                "For a more detailed AI-generated analysis, ensure an LLM API key is configured."
            )
            confidence = sum(s.relevance_score for s in sources) / len(sources) if sources else 0.0
        else:
            answer = (
                "I couldn't find any relevant network log entries for your question. "
                "Please try rephrasing your query or ensure that relevant logs have been ingested."
            )
            confidence = 0.0

        processing_time = int((time.time() - start_time) * 1000)

        return RagQueryResponse(
            answer=answer,
            sources=sources,
            confidence=round(confidence, 4),
            processing_time_ms=processing_time,
        )

    except Exception as e:
        logger.error(f"Query processing failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/ingest", response_model=IngestResponse, status_code=202)
async def ingest_logs(request: IngestRequest):
    """
    Ingest network logs into ChromaDB.
    Chunks the logs, generates embeddings, and upserts into the collection.
    """
    logger.info(f"Ingesting {len(request.logs)} log entries into {request.collection_name}")

    client = get_chroma_client()
    if client is None:
        raise HTTPException(status_code=500, detail="ChromaDB is unavailable")

    try:
        collection = get_collection(client, request.collection_name)

        all_documents = []
        all_ids = []
        all_metadatas = []

        for log_entry in request.logs:
            chunks = chunk_text(log_entry.content)
            for j, chunk in enumerate(chunks):
                doc_id = f"{uuid.uuid4()}"
                all_documents.append(chunk)
                all_ids.append(doc_id)
                all_metadatas.append({
                    "source": log_entry.source or "unknown",
                    "timestamp": log_entry.timestamp or datetime.now(timezone.utc).isoformat(),
                    "chunk_index": j,
                    **(log_entry.metadata or {}),
                })

        # Upsert into ChromaDB (ChromaDB handles embedding generation)
        if all_documents:
            # Batch upsert in chunks of 100
            batch_size = 100
            for i in range(0, len(all_documents), batch_size):
                end = min(i + batch_size, len(all_documents))
                collection.upsert(
                    documents=all_documents[i:end],
                    ids=all_ids[i:end],
                    metadatas=all_metadatas[i:end],
                )

        logger.info(f"Ingested {len(request.logs)} logs, created {len(all_documents)} chunks")

        return IngestResponse(
            status="completed",
            documents_processed=len(request.logs),
            chunks_created=len(all_documents),
            collection_name=request.collection_name,
        )

    except Exception as e:
        logger.error(f"Ingestion failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check including ChromaDB connectivity."""
    chromadb_connected = False
    try:
        client = get_chroma_client()
        if client:
            client.heartbeat()
            chromadb_connected = True
    except Exception:
        pass

    # Check if LLM API key is configured
    llm_available = bool(settings.openai_api_key)

    status = "healthy" if chromadb_connected else "degraded"

    return HealthResponse(
        status=status,
        chromadb_connected=chromadb_connected,
        llm_available=llm_available,
        version="1.0.0",
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8100)
