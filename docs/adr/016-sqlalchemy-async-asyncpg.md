# ADR-016: SQLAlchemy 2.0 async + asyncpg 드라이버 (Alembic은 psycopg2 동기)

- **상태**: 채택 (Accepted)
- **날짜**: 2026-05-24
- **결정자**: 개발자
- **관련**: [ADR-004](004-pgvector-over-chroma.md)

---

## 컨텍스트

M2에서 SQLAlchemy 모델 + Alembic 마이그레이션을 도입했다.
FastAPI는 비동기 프레임워크이고 자소서 생성 파이프라인은 60초+ I/O 블로킹이 길어, DB 액세스도 async가 필요했다.

PostgreSQL 드라이버 선택지:

1. **psycopg2-binary (동기)** — 가장 안정적이지만 async 미지원
2. **asyncpg (async 전용)** — 빠르고 native asyncio
3. **psycopg3 (sync/async 둘 다)** — 최신, 안정성 검증 부족

또한 **Alembic은 자체적으로 sync 컨텍스트에서 실행**되므로 async 드라이버를 그대로 사용할 수 없다.

---

## 결정

**런타임은 SQLAlchemy 2.0 async + asyncpg, Alembic 마이그레이션은 psycopg2-binary 동기 드라이버로 분리한다.**

### 구현

```python
# backend/app/db.py — 런타임 (FastAPI 요청 처리)
engine = create_async_engine(
    settings.database_url.replace("postgresql://", "postgresql+asyncpg://"),
    ...
)
```

```python
# backend/alembic/env.py — Alembic 마이그레이션
db_url = os.getenv("DATABASE_URL", ...)
db_url = db_url.replace("postgresql+asyncpg://", "postgresql://")  # asyncpg → psycopg2
config.set_main_option("sqlalchemy.url", db_url)
```

`pyproject.toml`:
```toml
"sqlalchemy>=2.0.0",
"asyncpg>=0.29.0",          # 런타임 async
"psycopg2-binary>=2.9.0",   # Alembic 동기
"alembic>=1.13.0",
"pgvector>=0.3.0",
```

---

## 이유

### asyncpg를 런타임으로 채택한 이유

- FastAPI는 ASGI(async), 동기 DB 호출은 이벤트 루프 블로킹 → 동시 요청 처리 저하
- asyncpg는 PostgreSQL 전용으로 가장 빠른 async 드라이버 (벤치마크상 psycopg3 async보다 빠름)
- SQLAlchemy 2.0 `create_async_engine`이 공식 지원

### Alembic을 동기로 유지한 이유

- Alembic 공식 권장: sync 컨텍스트가 디폴트, async는 추가 boilerplate 필요
- 마이그레이션은 배포 시 1회 실행이라 성능 무관
- `env.py`에서 URL 한 줄 치환 (`postgresql+asyncpg://` → `postgresql://`)만 하면 됨
- 동기 마이그레이션이 디버깅 쉬움 (트랜잭션 추적, 콘솔 출력 등)

### psycopg3로 통일하지 않은 이유

- 2026년 5월 시점 SQLAlchemy 2.0 + psycopg3 async는 안정화 진행 중
- asyncpg는 6년+ 운영 검증, 자료 풍부

---

## 트레이드오프

| 항목 | 비용 |
|------|------|
| 드라이버 2개 동시 사용 | 이미지 빌드 시간 약간 증가 (~10s), 의존성 충돌 가능성 매우 낮음 |
| URL 스킴 치환 | `env.py`에 한 줄, 자동 적용 |
| pgvector 호환 | 양쪽 드라이버 모두 `pgvector.sqlalchemy.Vector` 지원 |

---

## 구현 시 주의사항

1. **`DATABASE_URL` 환경변수는 `postgresql://` 로 시작** (docker-compose.yml 기본값)
2. **앱 코드는 `db.py`에서 자동으로 `postgresql+asyncpg://` 로 치환**
3. **Alembic 명령은 컨테이너 내에서 실행** (`docker exec hireagent-backend alembic upgrade head`)
4. **세션 사용 패턴**:
   ```python
   from app.db import AsyncSessionLocal

   async with AsyncSessionLocal() as session:
       result = await session.execute(select(Model).where(...))
   ```

---

## 대안 (검토 후 기각)

### 대안 1: 전체 sync (psycopg2 만)
- ❌ 기각: FastAPI 비동기 이점 포기, 동시 요청 처리 저하

### 대안 2: 전체 async (asyncpg + Alembic async 모드)
- ❌ 기각: Alembic async는 boilerplate 증가, 디버깅 어려움, 이득 없음

### 대안 3: psycopg3 단일 드라이버 (sync/async 통합)
- ⏸️ 보류: 1년 후 재검토. 2026-05 기준 SQLAlchemy + psycopg3 async 자료 부족

---

## 결과

### 긍정적
- ✅ FastAPI 비동기 풀스택 유지
- ✅ Alembic은 단순한 sync로 디버깅 쉬움
- ✅ asyncpg 성능 (네이티브 binary protocol)

### 부정적
- ⚠️ 새 개발자가 합류 시 두 드라이버 공존 이유 설명 필요 → 본 ADR로 해결

---

## 변경 이력

| 날짜 | 변경 | 사유 |
|------|------|------|
| 2026-05-24 | 최초 작성 | M2 DB 레이어 도입 시 결정 |
