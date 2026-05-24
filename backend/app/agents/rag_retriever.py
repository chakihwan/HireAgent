"""RAG 검색 에이전트 노드.

ItemState의 카테고리 + JD 분석을 쿼리로 변환해 career_documents에서 관련 경험을 가져옴.
검색 결과는 rag_context에 저장되어 essay_writer가 프롬프트에 포함시킴.
"""
from app.agents.state import ItemState
from app.db import AsyncSessionLocal
from app.rag.retriever import search

_MAX_RESULTS = 5
_DISTANCE_THRESHOLD = 0.8  # 코사인 거리 (0=동일, 2=반대). 이상이면 무관한 결과로 간주


async def rag_retriever_node(state: ItemState) -> dict:
    item = state["item"]
    category = item["category"]

    # 쿼리 구성: 카테고리 + JD 분석 요약 (JD 핵심 키워드 포함)
    query = f"{category} 관련 경험. {state['jd_analysis'][:300]}"

    try:
        async with AsyncSessionLocal() as db:
            results = await search(
                db,
                query=query,
                user_id=state["user_id"],
                limit=_MAX_RESULTS,
            )
    except Exception:
        # RAG 검색 실패해도 자소서 생성은 계속 진행
        return {"rag_context": []}

    # threshold 이하만 채택
    relevant = [doc.content for doc, dist in results if dist < _DISTANCE_THRESHOLD]
    return {"rag_context": relevant}
