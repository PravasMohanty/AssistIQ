import requests


class Embedder:

    def __init__(
        self,
        model: str = "nomic-embed-text",
        ollama_url: str = "http://localhost:11434"
    ):
        self.model = model
        self.ollama_url = ollama_url

    def embed(self, text: str):
        response = requests.post(
            f"{self.ollama_url}/api/embeddings",
            json={
                "model": self.model,
                "prompt": text
            },
            timeout=60
        )

        response.raise_for_status()

        return response.json()["embedding"]


if __name__ == "__main__":

    embedder = Embedder()

    text = "Employees may work remotely up to three days per week."

    vector = embedder.embed(text)

    print(f"Vector type: {type(vector)}")
    print(f"Vector dimensions: {len(vector)}")
    print(f"First 10 values: {vector[:10]}")