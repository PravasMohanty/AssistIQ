from app.retriever import Retriever
from app.generator import Generator


class RAGPipeline:

    def __init__(self):
        self.retriever = Retriever()
        self.generator = Generator()

    def ask(self, question: str, top_k: int = 5):

        # 1. Retrieve relevant chunks
        results = self.retriever.search(
            question,
            top_k=top_k
        )

        documents = results["documents"][0]

        # 2. Build context
        context = "\n\n".join(documents)

        # 3. Generate answer
        answer = self.generator.generate(
            question,
            context
        )

        return {
            "question": question,
            "answer": answer,
            "context": documents
        }


if __name__ == "__main__":

    pipeline = RAGPipeline()

    question = "When do performance reviews happen?"

    result = pipeline.ask(question)

    print("\nQuestion:")
    print(result["question"])

    print("\nAnswer:")
    print(result["answer"])

    print("\nRetrieved Context:")
    print("=" * 60)

    for i, document in enumerate(
        result["context"],
        start=1
    ):
        print(f"\nChunk {i}:")
        print(document)