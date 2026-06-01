"""API smoke test — jobs / library CRUD 사이클 + projects 조회.

실제 app + 실제 PostgreSQL 통합 테스트 (컨테이너 내 실행):
    docker compose exec backend python -m pytest tests/test_api_smoke.py -q

각 테스트는 생성→조회→수정→삭제로 자기정리하므로 DB를 오염시키지 않는다.
"""
import pytest

API = "/api/v1"


@pytest.mark.asyncio
async def test_health(client):
    r = await client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "healthy"


@pytest.mark.asyncio
async def test_jobs_crud_cycle(client):
    # 생성
    r = await client.post(f"{API}/jobs", json={
        "company": "__smoke_test_co__",
        "position": "백엔드 엔지니어",
        "job_description": "smoke test 공고 본문",
    })
    assert r.status_code == 201, r.text
    job = r.json()
    job_id = job["id"]
    assert job["company"] == "__smoke_test_co__"
    assert job["status"] == "draft"  # 기본 상태

    try:
        # 단건 조회
        r = await client.get(f"{API}/jobs/{job_id}")
        assert r.status_code == 200
        assert r.json()["id"] == job_id

        # 목록에 포함
        r = await client.get(f"{API}/jobs")
        assert r.status_code == 200
        assert any(j["id"] == job_id for j in r.json())

        # 상태 변경 (상태 머신)
        r = await client.patch(f"{API}/jobs/{job_id}", json={"status": "submitted"})
        assert r.status_code == 200
        assert r.json()["status"] == "submitted"
    finally:
        # 삭제 (self-cleanup)
        r = await client.delete(f"{API}/jobs/{job_id}")
        assert r.status_code == 204

    # 삭제 후 404
    r = await client.get(f"{API}/jobs/{job_id}")
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_jobs_invalid_status_rejected(client):
    r = await client.post(f"{API}/jobs", json={
        "company": "__smoke_test_co2__", "job_description": "x",
    })
    job_id = r.json()["id"]
    try:
        # 잘못된 상태값 → 422 (상태 머신 검증)
        r = await client.patch(f"{API}/jobs/{job_id}", json={"status": "not_a_status"})
        assert r.status_code == 422
    finally:
        await client.delete(f"{API}/jobs/{job_id}")


@pytest.mark.asyncio
async def test_library_crud_cycle(client):
    # 생성 (자유 작성 — application_id 없음)
    r = await client.post(f"{API}/library", json={
        "category": "__smoke_자기소개__",
        "content": "스모크 테스트 자소서 본문입니다.",
        "char_target": 300,
    })
    assert r.status_code == 201, r.text
    item = r.json()
    item_id = item["id"]
    assert item["char_count"] == len("스모크 테스트 자소서 본문입니다.")
    assert item["version"] == 1

    try:
        # 같은 카테고리 재저장 → version 증가 (application_id=null 케이스)
        r2 = await client.post(f"{API}/library", json={
            "category": "__smoke_자기소개__",
            "content": "두 번째 버전 본문",
            "char_target": 300,
        })
        item2_id = r2.json()["id"]
        assert r2.json()["version"] == 2
        await client.delete(f"{API}/library/{item2_id}")

        # 수정 (is_final 토글)
        r = await client.patch(f"{API}/library/{item_id}", json={"is_final": True})
        assert r.status_code == 200
        assert r.json()["is_final"] is True

        # 목록 포함
        r = await client.get(f"{API}/library")
        assert any(x["id"] == item_id for x in r.json())
    finally:
        r = await client.delete(f"{API}/library/{item_id}")
        assert r.status_code == 204

    r = await client.get(f"{API}/library/{item_id}")
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_projects_list(client):
    # 임베딩 없이 가벼운 조회만 (인덱싱은 KURE-v1 무거워 smoke 제외)
    r = await client.get(f"{API}/projects")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


@pytest.mark.asyncio
async def test_ollama_models_endpoint(client):
    # Ollama 연결 + GPU fit 응답 구조 검증
    r = await client.get(f"{API}/ollama/models")
    # Ollama 미연결이면 503 — 그 경우는 환경 문제로 스킵 처리
    if r.status_code == 503:
        pytest.skip("Ollama 서비스 미연결")
    assert r.status_code == 200
    data = r.json()
    assert "models" in data and "gpu" in data
    for m in data["models"]:
        assert m["fit"] in ("ok", "tight", "over", "unknown")
