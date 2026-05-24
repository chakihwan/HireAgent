"""RAG 인덱서 — 텍스트 → 청킹 → 임베딩 → career_documents INSERT."""
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.career_document import CareerDocument
from app.rag.embeddings import embed_texts
from app.rag.loaders.text import chunk_text


async def index_text(
    db: AsyncSession,
    *,
    user_id: str,
    content: str,
    source_type: str,
    project_name: str | None = None,
    category: str | None = None,
    company: str | None = None,
    role: str | None = None,
    tech_stack: list[str] | None = None,
    chunk_size: int = 500,
    chunk_overlap: int = 50,
) -> list[CareerDocument]:
    """텍스트를 청킹 후 임베딩해서 career_documents에 저장.

    Returns: 저장된 CareerDocument 리스트.
    """
    chunks = chunk_text(content, chunk_size=chunk_size, chunk_overlap=chunk_overlap)
    if not chunks:
        return []

    embeddings = await embed_texts(chunks)

    docs: list[CareerDocument] = []
    for chunk, embedding in zip(chunks, embeddings, strict=True):
        doc = CareerDocument(
            user_id=user_id,
            content=chunk,
            embedding=embedding,
            source_type=source_type,
            project_name=project_name,
            category=category,
            company=company,
            role=role,
            tech_stack=tech_stack or [],
        )
        db.add(doc)
        docs.append(doc)

    await db.commit()
    for doc in docs:
        await db.refresh(doc)
    return docs
