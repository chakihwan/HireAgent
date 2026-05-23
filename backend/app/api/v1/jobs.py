from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.schemas.jobs import JobApplicationCreate, JobApplicationResponse, JobApplicationUpdate
from app.services import jobs as jobs_svc

router = APIRouter(prefix="/jobs", tags=["jobs"])

_USER_ID = "local"  # Phase 1: 단일 사용자


@router.post("", response_model=JobApplicationResponse, status_code=201)
async def create_job(
    data: JobApplicationCreate, db: AsyncSession = Depends(get_db)
) -> JobApplicationResponse:
    job = await jobs_svc.create_job(db, data, _USER_ID)
    return JobApplicationResponse.model_validate(job)


@router.get("", response_model=list[JobApplicationResponse])
async def list_jobs(
    status: str | None = None, db: AsyncSession = Depends(get_db)
) -> list[JobApplicationResponse]:
    jobs = await jobs_svc.list_jobs(db, _USER_ID, status)
    return [JobApplicationResponse.model_validate(j) for j in jobs]


@router.get("/{job_id}", response_model=JobApplicationResponse)
async def get_job(job_id: int, db: AsyncSession = Depends(get_db)) -> JobApplicationResponse:
    job = await jobs_svc.get_job(db, job_id, _USER_ID)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return JobApplicationResponse.model_validate(job)


@router.patch("/{job_id}", response_model=JobApplicationResponse)
async def update_job(
    job_id: int, data: JobApplicationUpdate, db: AsyncSession = Depends(get_db)
) -> JobApplicationResponse:
    try:
        job = await jobs_svc.update_job(db, job_id, data, _USER_ID)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return JobApplicationResponse.model_validate(job)


@router.delete("/{job_id}", status_code=204)
async def delete_job(job_id: int, db: AsyncSession = Depends(get_db)) -> None:
    deleted = await jobs_svc.delete_job(db, job_id, _USER_ID)
    if not deleted:
        raise HTTPException(status_code=404, detail="Job not found")
