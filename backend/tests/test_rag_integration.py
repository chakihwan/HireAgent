"""RAG 통합 테스트 — 인덱싱 → 임베딩 → 검색 → distance 검증.

실제 KURE-v1 임베딩 + pgvector를 사용하는 무거운 테스트 (컨테이너 내 실행):
    docker compose exec backend python -m pytest tests/test_rag_integration.py -q

첫 실행은 KURE-v1 모델 로드로 1~2분 걸릴 수 있다 (이후 캐시).
인덱싱한 문서는 끝에 project_name 단위로 삭제 (self-cleanup).
"""
import pytest

API = "/api/v1"
# 다른 테스트/실데이터와 충돌 없는 고유 식별자
_PROJECT = "__rag_smoke_test__"
_UNIQUE = "제트슨오린나노에서 욜로 파인튜닝 모델을 경량화 배포한 보행자 추적 시스템"


@pytest.mark.asyncio
async def test_index_search_distance(client):
    # 1) 인덱싱 (고유 내용)
    r = await client.post(f"{API}/projects/index", json={
        "content": f"이것은 RAG 통합 테스트 문서입니다. {_UNIQUE}. "
                   "FastAPI 백엔드와 PostgreSQL을 사용했고 Docker로 배포했습니다.",
        "source_type": "project_readme",
        "project_name": _PROJECT,
        "tech_stack": ["YOLO", "FastAPI"],
    })
    assert r.status_code == 201, r.text
    assert r.json()["chunks_created"] >= 1

    try:
        # 2) 인덱싱한 고유 내용으로 검색 → 상위에 잡혀야 함
        r = await client.post(f"{API}/projects/search", json={
            "query": "제트슨 보행자 추적 욜로 경량화",
            "limit": 5,
        })
        assert r.status_code == 200, r.text
        results = r.json()
        assert len(results) >= 1

        # 방금 넣은 문서가 결과에 포함되고, distance가 합리적 범위(< 0.8)인지
        ours = [x for x in results if x["project_name"] == _PROJECT]
        assert ours, "인덱싱한 문서가 검색 결과에 없음"
        assert ours[0]["distance"] < 0.8, f"distance 너무 큼: {ours[0]['distance']}"
        assert _UNIQUE[:6] in ours[0]["content"]
    finally:
        # 3) self-cleanup — project_name 단위 삭제
        r = await client.delete(f"{API}/projects/by-project/{_PROJECT}")
        assert r.status_code == 200
        assert r.json()["deleted"] >= 1


@pytest.mark.asyncio
async def test_search_source_type_filter(client):
    # source_type 필터가 동작하는지 (다른 타입으로 넣고 다른 타입으로 검색 → 제외)
    r = await client.post(f"{API}/projects/index", json={
        "content": "소스타입 필터 테스트용 이력서 문서. 자바 스프링 백엔드 5년 경력.",
        "source_type": "resume",
        "project_name": _PROJECT,
    })
    assert r.status_code == 201
    try:
        r = await client.post(f"{API}/projects/search", json={
            "query": "자바 스프링 경력",
            "limit": 5,
            "source_type": "essay",  # resume로 넣었는데 essay로 필터 → 우리 문서 제외
        })
        assert r.status_code == 200
        ours = [x for x in r.json() if x["project_name"] == _PROJECT]
        assert not ours, "source_type 필터가 동작하지 않음 (resume 문서가 essay 필터에 잡힘)"
    finally:
        await client.delete(f"{API}/projects/by-project/{_PROJECT}")
