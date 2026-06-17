import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.api.v1 import essays, jobs, library, llm, nodes, ollama, projects, settings as settings_api
from app.config import settings
from app.db import AsyncSessionLocal

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,  # 환경별 분기 (config.cors_origins)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(llm.router, prefix="/api/v1")
app.include_router(ollama.router, prefix="/api/v1")
app.include_router(essays.router, prefix="/api/v1")
app.include_router(jobs.router, prefix="/api/v1")
app.include_router(library.router, prefix="/api/v1")
app.include_router(projects.router, prefix="/api/v1")
app.include_router(settings_api.router, prefix="/api/v1")
app.include_router(nodes.router, prefix="/api/v1")


@app.get("/")
def root() -> dict:
    return {"message": f"{settings.app_name} API is running", "version": settings.app_version}


@app.get("/health")
def health() -> dict:
    """Liveness — 프로세스 생존 확인 (빠름, 의존성 체크 없음)."""
    return {"status": "healthy"}


@app.get("/health/ready")
async def health_ready() -> dict:
    """Readiness — 의존성(DB·Ollama) 연결 상태. 운영/디버깅용.

    KURE-v1은 로드 트리거가 무거워 제외 (별도 확인).
    """
    checks: dict[str, str] = {}

    try:
        async with AsyncSessionLocal() as db:
            await db.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception as e:  # noqa: BLE001
        checks["database"] = f"error: {type(e).__name__}"

    try:
        async with httpx.AsyncClient(timeout=3.0) as c:
            r = await c.get(f"{settings.ollama_base_url}/api/tags")
        checks["ollama"] = "ok" if r.status_code == 200 else f"status {r.status_code}"
    except Exception as e:  # noqa: BLE001
        checks["ollama"] = f"error: {type(e).__name__}"

    all_ok = all(v == "ok" for v in checks.values())
    return {"status": "ready" if all_ok else "degraded", "checks": checks}
