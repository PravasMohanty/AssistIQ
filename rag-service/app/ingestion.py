from app.document_loader import load_text_file
from app.chunker import split_sections, chunk_document
from app.chroma_store import ChromaStore


from pathlib import Path


class Ingestion:

    def __init__(self):
        self.store = ChromaStore()

    def ingest(self, file_path: str, document_id: str = None):
        # 1. Load document
        text = load_text_file(file_path)

        # 2. Split document into sections
        sections = split_sections(text)

        # 3. Split sections into chunks
        chunks = chunk_document(sections)

        # 4. Store chunks and embeddings in Chroma
        if not document_id:
            document_id = Path(file_path).stem

        count = self.store.add_chunks(chunks, document_id)
        return count

    def delete(self, document_id: str):
        return self.store.delete_document(document_id)


if __name__ == "__main__":

    ingestion = Ingestion()

    count = ingestion.ingest(
        "data/handbook.txt"
    )

    print(f"Ingested {count} chunks into Chroma")