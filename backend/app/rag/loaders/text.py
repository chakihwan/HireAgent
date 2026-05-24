"""텍스트 로더 — 청킹만 담당.

LangChain RecursiveCharacterTextSplitter를 한국어 구분자 포함으로 사용.
"""
from langchain_text_splitters import RecursiveCharacterTextSplitter

# 한국어 문장/문단 구분자 우선
_SEPARATORS = ["\n\n", "\n", "。", ". ", "! ", "? ", " ", ""]


def chunk_text(text: str, chunk_size: int = 500, chunk_overlap: int = 50) -> list[str]:
    """텍스트를 청크로 분할.

    chunk_size 단위로 자르되, separators 우선순위로 자연스러운 경계에서 분할.
    overlap만큼 인접 청크가 겹침 (검색 시 문맥 보존).
    """
    if not text.strip():
        return []
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        separators=_SEPARATORS,
        keep_separator=False,
    )
    return [c.strip() for c in splitter.split_text(text) if c.strip()]
