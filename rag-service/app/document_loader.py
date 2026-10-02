from pathlib import Path


def load_text_file(file_path: str) -> str:
    path = Path(file_path)

    if not path.exists():
        raise FileNotFoundError(
            f"Document not found: {file_path}"
        )

    if path.suffix.lower() != ".txt":
        raise ValueError(
            f"Unsupported file type: {path.suffix}"
        )

    return path.read_text(encoding="utf-8")

if __name__ == "__main__":

    text = load_text_file("data/handbook.txt")

    print(f"Characters loaded: {len(text)}")
    print("\nFirst 500 characters:\n")
    print(text[:500])