from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.rag.indexer import index_text
from app.rag.retriever import search as rag_search
from app.schemas.projects import (
    CareerDocumentCreate,
    CareerDocumentResponse,
    IndexResponse,
    SearchRequest,
    SearchResult,
)
from app.services import projects as proj_svc

router = APIRouter(prefix="/projects", tags=["projects"])

_USER_ID = "local"


@router.post("/index", response_model=IndexResponse, status_code=201)
async def index_document(
    data: CareerDocumentCreate, db: AsyncSession = Depends(get_db)
) -> IndexResponse:
    """텍스트 → 청킹 → KURE-v1 임베딩 → career_documents 저장.

    첫 호출 시 모델 로드로 1-2분 걸릴 수 있음 (이후 캐시됨).
    """
    docs = await index_text(
        db,
        user_id=_USER_ID,
        content=data.content,
        source_type=data.source_type,
        project_name=data.project_name,
        category=data.category,
        company=data.company,
        role=data.role,
        tech_stack=data.tech_stack,
    )
    return IndexResponse(
        chunks_created=len(docs),
        document_ids=[d.id for d in docs],
    )


@router.get("", response_model=list[CareerDocumentResponse])
async def list_documents(
    source_type: str | None = None,
    project_name: str | None = None,
    db: AsyncSession = Depends(get_db),
) -> list[CareerDocumentResponse]:
    docs = await proj_svc.list_documents(db, _USER_ID, source_type, project_name)
    return [CareerDocumentResponse.model_validate(d) for d in docs]


@router.delete("/{doc_id}", status_code=204)
async def delete_document(doc_id: int, db: AsyncSession = Depends(get_db)) -> None:
    deleted = await proj_svc.delete_document(db, doc_id, _USER_ID)
    if not deleted:
        raise HTTPException(status_code=404, detail="Document not found")


@router.delete("/by-project/{project_name}")
async def delete_by_project(
    project_name: str, db: AsyncSession = Depends(get_db)
) -> dict:
    count = await proj_svc.delete_by_project(db, project_name, _USER_ID)
    if count == 0:
        raise HTTPException(status_code=404, detail="No documents found for that project")
    return {"deleted": count}


@router.post("/search", response_model=list[SearchResult])
async def search_documents(
    req: SearchRequest, db: AsyncSession = Depends(get_db)
) -> list[SearchResult]:
    """RAG 검색 (디버깅/검증용)."""
    results = await rag_search(
        db,
        query=req.query,
        user_id=_USER_ID,
        limit=req.limit,
        source_type=req.source_type,
        category=req.category,
        project_name=req.project_name,
    )
    return [
        SearchResult(
            id=doc.id,
            content=doc.content,
            source_type=doc.source_type,
            project_name=doc.project_name,
            category=doc.category,
            distance=dist,
        )
        for doc, dist in results
    ]
