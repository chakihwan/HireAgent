from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.rag.indexer import index_text
from app.rag.loaders.file import FileParseError, parse_file
from app.rag.loaders.github import GitHubFetchError, fetch_repo_docs
from app.rag.retriever import search as rag_search
from app.schemas.projects import (
    CareerDocumentCreate,
    CareerDocumentResponse,
    GitHubIndexRequest,
    GitHubIndexResponse,
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


@router.post("/index-github", response_model=GitHubIndexResponse, status_code=201)
async def index_github(
    req: GitHubIndexRequest, db: AsyncSession = Depends(get_db)
) -> GitHubIndexResponse:
    """GitHub 공개 레포의 README + docs/*.md 자동 인덱싱 (ADR-019).

    무인증 GitHub API rate limit 60/h 적용. 같은 레포 재인덱싱 시 기존 청크가 누적될 수 있으므로
    사전에 `DELETE /by-project/{repo_name}` 호출 권장.
    """
    try:
        result = await fetch_repo_docs(req.repo_url)
    except GitHubFetchError as e:
        raise HTTPException(status_code=422, detail=str(e))

    project_name = f"{result['owner']}/{result['repo']}"
    total_chunks = 0
    all_ids: list[int] = []

    for file in result["files"]:
        docs = await index_text(
            db,
            user_id=_USER_ID,
            content=file["content"],
            source_type="project_readme" if file["path"].lower().startswith("readme") else "project_doc",
            project_name=project_name,
            category=req.category,
            tech_stack=req.tech_stack,
        )
        total_chunks += len(docs)
        all_ids.extend(d.id for d in docs)

    return GitHubIndexResponse(
        owner=result["owner"],
        repo=result["repo"],
        description=result["description"],
        files_indexed=len(result["files"]),
        total_chunks=total_chunks,
        document_ids=all_ids,
    )


@router.post("/index-file", response_model=IndexResponse, status_code=201)
async def index_file(
    file: UploadFile = File(...),
    source_type: str = Form(...),
    project_name: str | None = Form(None),
    category: str | None = Form(None),
    company: str | None = Form(None),
    role: str | None = Form(None),
    tech_stack: str = Form(""),  # 쉼표 구분
    db: AsyncSession = Depends(get_db),
) -> IndexResponse:
    """이력서/문서 파일 업로드 (PDF / DOCX / MD / TXT)."""
    if not file.filename:
        raise HTTPException(status_code=422, detail="파일명이 없습니다.")

    data = await file.read()
    try:
        text = parse_file(file.filename, data)
    except FileParseError as e:
        raise HTTPException(status_code=422, detail=str(e))

    if len(text) < 20:
        raise HTTPException(status_code=422, detail="추출된 텍스트가 너무 짧습니다 (20자 미만).")

    docs = await index_text(
        db,
        user_id=_USER_ID,
        content=text,
        source_type=source_type,
        project_name=project_name,
        category=category,
        company=company,
        role=role,
        tech_stack=[s.strip() for s in tech_stack.split(",") if s.strip()],
    )
    return IndexResponse(chunks_created=len(docs), document_ids=[d.id for d in docs])


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
