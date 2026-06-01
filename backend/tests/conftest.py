"""pytest 공통 fixture.

통합(smoke) 테스트는 실제 FastAPI app + 실제 PostgreSQL에 붙는다 (컨테이너 내 실행 전제).
- httpx ASGITransport로 네트워크 없이 app 직접 호출.
- 생성한 데이터는 각 테스트가 self-cleanup (CRUD 사이클 끝에 delete).
"""
import httpx
import pytest
import pytest_asyncio

from app.main import app


@pytest_asyncio.fixture(loop_scope="session")
async def client():
    """app을 직접 호출하는 httpx AsyncClient (ASGITransport)."""
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
