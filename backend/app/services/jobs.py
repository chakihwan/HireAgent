from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.job_application import JobApplication
from app.schemas.jobs import JobApplicationCreate, JobApplicationUpdate

_DEFAULT_USER = "local"

VALID_STATUSES = {
    "draft",
    "submitted",
    "passed_doc",
    "passed_interview",
    "passed_final",
    "rejected",
    "withdrawn",
}


async def create_job(
    db: AsyncSession, data: JobApplicationCreate, user_id: str = _DEFAULT_USER
) -> JobApplication:
    job = JobApplication(
        user_id=user_id,
        company=data.company,
        position=data.position,
        job_description=data.job_description,
        job_url=data.job_url,
        deadline=data.deadline,
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)
    return job


async def list_jobs(
    db: AsyncSession, user_id: str = _DEFAULT_USER, status: str | None = None
) -> list[JobApplication]:
    stmt = select(JobApplication).where(JobApplication.user_id == user_id)
    if status:
        stmt = stmt.where(JobApplication.status == status)
    stmt = stmt.order_by(JobApplication.created_at.desc())
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_job(
    db: AsyncSession, job_id: int, user_id: str = _DEFAULT_USER
) -> JobApplication | None:
    stmt = select(JobApplication).where(
        JobApplication.id == job_id, JobApplication.user_id == user_id
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def update_job(
    db: AsyncSession, job_id: int, data: JobApplicationUpdate, user_id: str = _DEFAULT_USER
) -> JobApplication | None:
    job = await get_job(db, job_id, user_id)
    if not job:
        return None
    if data.status is not None:
        if data.status not in VALID_STATUSES:
            raise ValueError(f"Invalid status: {data.status}")
        job.status = data.status
    if data.company is not None:
        job.company = data.company
    if data.position is not None:
        job.position = data.position
    if data.applied_at is not None:
        job.applied_at = data.applied_at
    if data.result_notes is not None:
        job.result_notes = data.result_notes
    await db.commit()
    await db.refresh(job)
    return job


async def delete_job(
    db: AsyncSession, job_id: int, user_id: str = _DEFAULT_USER
) -> bool:
    job = await get_job(db, job_id, user_id)
    if not job:
        return False
    await db.delete(job)
    await db.commit()
    return True
