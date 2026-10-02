import chromadb

client = chromadb.HttpClient(
    host="localhost",
    port=8000
)

print("Connected to Chroma")

collection = client.get_or_create_collection(
    name="assistiq_chunks",
    metadata={"hnsw:space": "cosine"}
)

print(f"Collection: {collection.name}")
print(f"Number of items: {collection.count()}")