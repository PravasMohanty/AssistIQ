import chromadb

from app.embedder import Embedder


class ChromaStore:

    def __init__(
        self,
        host: str = "localhost",
        port: int = 8000,
        collection_name: str = "assistiq_chunks"
    ):
        self.client = chromadb.HttpClient(
            host=host,
            port=port
        )

        self.collection = self.client.get_or_create_collection(
            name=collection_name,
            metadata={"hnsw:space": "cosine"}
        )

        self.embedder = Embedder()

    def add_chunks(self, chunks, document_id):
        if not chunks:
            return 0

        # Purge any existing chunks for this document to avoid duplicates
        try:
            self.collection.delete(where={"document_id": document_id})
        except Exception:
            pass

        ids = []
        documents = []
        embeddings = []
        metadatas = []

        for document_index, chunk in enumerate(chunks):
            chunk_id = f"{document_id}_chunk_{document_index}"
            embedding = self.embedder.embed(chunk["text"])

            ids.append(chunk_id)
            documents.append(chunk["text"])
            embeddings.append(embedding)

            metadatas.append({
                "document_id": document_id,
                "section": chunk["section"],
                "section_chunk_index": chunk["chunk_index"],
                "document_chunk_index": document_index
            })

        self.collection.upsert(
            ids=ids,
            documents=documents,
            embeddings=embeddings,
            metadatas=metadatas
        )

        return len(chunks)

    def delete_document(self, document_id: str):
        try:
            self.collection.delete(where={"document_id": document_id})
            return True
        except Exception as e:
            print(f"Error deleting document {document_id}: {e}")
            return False

    def get_document_chunks_count(self, document_id: str) -> int:
        try:
            results = self.collection.get(where={"document_id": document_id})
            return len(results.get("ids", []))
        except Exception:
            return 0


if __name__ == "__main__":

    store = ChromaStore()

    test_chunks = [
        {
            "text": "Employees may work remotely up to three days per week.",
            "section": "Remote Work Policy",
            "chunk_index": 0
        },
        {
            "text": "Employees receive health insurance and paid leave.",
            "section": "Benefits Overview",
            "chunk_index": 0
        }
    ]

    count = store.add_chunks(
        test_chunks,
        document_id="test_document"
    )

    print(f"Added {count} chunks to Chroma")
    print(f"Collection now contains {store.collection.count()} items")