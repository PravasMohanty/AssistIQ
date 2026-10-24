import re


def chunk_text(text: str, size: int = 500, overlap: int = 100):
    chunks = []

    start = 0

    while start < len(text):
        end = min(start + size, len(text))

        chunk = text[start:end].strip()

        if chunk:
            chunks.append(chunk)

        if end >= len(text):
            break

        start += size - overlap

    return chunks


def split_sections(text: str, default_title: str = "General"):
    sections = []

    # Match markdown headers (# Header, ## Header) or colon headers (Header:)
    pattern = r"(^(?:#{1,6}\s+.*|[A-Za-z][A-Za-z0-9 /&-]*:))(.*?)(?=^(?:#{1,6}\s+.*|[A-Za-z][A-Za-z0-9 /&-]*:)|\Z)"

    matches = list(re.finditer(
        pattern,
        text,
        flags=re.MULTILINE | re.DOTALL
    ))

    if matches:
        for match in matches:
            title = match.group(1).strip().lstrip('#').strip().rstrip(':').strip()
            content = match.group(2).strip()

            if content:
                sections.append({
                    "title": title or default_title,
                    "content": content
                })

    # Robust fallback: if no headings matched, treat entire text as a section
    if not sections and text.strip():
        sections.append({
            "title": default_title,
            "content": text.strip()
        })

    return sections


def chunk_document(sections, size=500, overlap=100):
    chunks = []

    for section in sections:
        section_chunks = chunk_text(
            section["content"],
            size=size,
            overlap=overlap
        )

        for index, text in enumerate(section_chunks):
            chunks.append({
                "text": text,
                "section": section["title"],
                "chunk_index": index
            })

    return chunks

if __name__ == "__main__":

    text = """
TechCorp Pet Policy:
Employees may bring pets to the office on designated pet-friendly days.
Pets must be vaccinated and well behaved.

Remote Work Policy:
Employees may work remotely up to three days per week.
Managers must approve remote work schedules.

Benefits Overview:
Employees receive health insurance, paid leave, and retirement benefits.
"""

    sections = split_sections(text)

    chunks = chunk_document(
        sections,
        size=150,
        overlap=30
    )

    for i, chunk in enumerate(chunks, start=1):
        print(f"\n--- Chunk {i} ---")
        print(f"Section: {chunk['section']}")
        print(f"Index: {chunk['chunk_index']}")
        print(f"Text: {chunk['text']}")