import chromadb

from app.embedder import Embedder


class Retriever:

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

        self.collection = self.client.get_collection(
            name=collection_name
        )

        self.embedder = Embedder()

    def search(self, query: str, top_k: int = 5):

        query_embedding = self.embedder.embed(query)

        results = self.collection.query(
            query_embeddings=[query_embedding],
            n_results=top_k
        )

        return results

if __name__ == "__main__":

    retriever = Retriever()

    query = "How many days can employees work remotely?"

    results = retriever.search(query, top_k=5)

    documents = results["documents"][0]
    metadatas = results["metadatas"][0]
    distances = results["distances"][0]

    print(f"\nQuery: {query}")
    print("=" * 60)

    for i, (document, metadata, distance) in enumerate(
        zip(documents, metadatas, distances),
        start=1
    ):
        print(f"\nResult {i}")
        print(f"Section: {metadata['section']}")
        print(f"Distance: {distance}")
        print(f"Text: {document}")