from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import essays, jobs, library, llm, ollama, projects
from app.config import settings

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
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


@app.get("/")
def root() -> dict:
    return {"message": f"{settings.app_name} API is running", "version": settings.app_version}


@app.get("/health")
def health() -> dict:
    return {"status": "healthy"}
