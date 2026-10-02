from document_loader import load_text_file
from chunker import split_sections


if __name__ == "__main__":

    file_path = "data/handbook.txt"

    text = load_text_file(file_path)

    sections = split_sections(text)

    print(f"Characters loaded: {len(text)}")
    print(f"Sections found: {len(sections)}")

    for index, section in enumerate(sections, start=1):
        print("\n" + "=" * 60)
        print(f"Section {index}")
        print(f"Title: {section['title']}")
        print(f"Content characters: {len(section['content'])}")
        print(f"Preview: {section['content'][:150]}...")