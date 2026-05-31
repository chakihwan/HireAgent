"""RAG 검색 에이전트 노드.

ItemState의 카테고리 + JD 분석을 쿼리로 변환해 career_documents에서 관련 경험을 가져옴.
검색 결과는 rag_context에 저장되어 essay_writer가 프롬프트에 포함시킴.

추가로 사용자가 다룬 전체 기술 스택(`tech_whitelist`)도 함께 전달해 할루시네이션을 방지한다.
"""
from sqlalchemy import select

from app.agents.state import ItemState
from app.db import AsyncSessionLocal
from app.models.career_document import CareerDocument
from app.rag.retriever import search, source_weights_for_category
from app.rag.tech_extractor import merge_tech_stacks

_MAX_RESULTS = 5
_DISTANCE_THRESHOLD = 0.8  # 코사인 거리 (0=동일, 2=반대). 이상이면 무관한 결과로 간주


async def rag_retriever_node(state: ItemState) -> dict:
    item = state["item"]
    category = item["category"]

    # 쿼리 구성: 카테고리 + JD 분석 요약 (JD 핵심 키워드 포함)
    query = f"{category} 관련 경험. {state['jd_analysis'][:300]}"

    try:
        async with AsyncSessionLocal() as db:
            # 1) RAG 검색 — 카테고리별 source_type 가중 재랭킹
            results = await search(
                db,
                query=query,
                user_id=state["user_id"],
                limit=_MAX_RESULTS,
                source_weights=source_weights_for_category(category),
            )

            # 2) 사용자의 전체 기술 화이트리스트 (모든 문서의 tech_stack 합집합)
            stmt = select(CareerDocument.tech_stack).where(
                CareerDocument.user_id == state["user_id"]
            )
            db_result = await db.execute(stmt)
            all_tech_lists = [row[0] for row in db_result.all() if row[0]]
    except Exception:
        return {
            "rag_context": [], "tech_whitelist": [], "rag_sources": {},
            "node_events": [{"node": "rag", "category": category, "phase": "error", "detail": "RAG 검색 실패"}],
        }

    relevant = [(doc, dist) for doc, dist in results if dist < _DISTANCE_THRESHOLD]
    rag_context = [doc.content for doc, _ in relevant]
    rag_count = len(rag_context)
    tech_whitelist = merge_tech_stacks(*all_tech_lists)

    # source_type 분포 (관찰용 — 어떤 자료가 채택됐는지)
    source_counts: dict[str, int] = {}
    for doc, _ in relevant:
        source_counts[doc.source_type] = source_counts.get(doc.source_type, 0) + 1

    return {
        "rag_context": rag_context,
        "tech_whitelist": tech_whitelist,
        "rag_sources": source_counts,
        "node_events": [
            {"node": "rag", "category": category, "phase": "done",
             "detail": f"{rag_count}개 참고"},
        ],
    }
