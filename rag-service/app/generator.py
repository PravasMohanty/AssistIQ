import requests


class Generator:

    def __init__(
        self,
        model: str = "mistral",
        ollama_url: str = "http://localhost:11434"
    ):
        self.model = model
        self.ollama_url = ollama_url

    def generate(self, question: str, context: str):

        prompt = f"""
You are a customer support assistant.

Answer the user's question using only the information
provided in the context below.

If the context does not contain enough information to
answer the question, say that you do not have enough
information.

Context:
{context}

Question:
{question}

Answer:
"""

        response = requests.post(
            f"{self.ollama_url}/api/generate",
            json={
                "model": self.model,
                "prompt": prompt,
                "stream": False
            },
            timeout=120
        )

        response.raise_for_status()

        return response.json()["response"]

if __name__ == "__main__":

    generator = Generator()

    context = """
    TechCorp allows eligible employees to work remotely
    for up to three days per week.
    """

    question = "How many days can employees work remotely?"

    answer = generator.generate(
        question,
        context
    )

    print("\nQuestion:")
    print(question)

    print("\nAnswer:")
    print(answer)