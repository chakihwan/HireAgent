# ADR-004: pgvector 채택 (Chroma, Pinecone 대신)

- **상태**: 채택 (Accepted)
- **날짜**: 2026-05-22
- **결정자**: 개발자
- **관련 요구사항**: F-1.3 (RAG 인덱싱), 기술 스택

---

## 컨텍스트

RAG(Retrieval Augmented Generation)를 위한 벡터 저장소가 필요하다.
대표적인 옵션으로 Chroma(로컬), Pinecone(클라우드), pgvector(PostgreSQL 확장)가 있다.

---

## 결정

**PostgreSQL + pgvector 확장을 벡터 저장소로 채택한다.**

```python
# career_documents 테이블에 벡터 컬럼 통합
class CareerDocument(Base):
    embedding: Mapped[list[float]] = mapped_column(Vector(1024))  # BGE-M3 차원
    # 메타데이터도 같은 테이블에
    source_type: Mapped[str]
    tech_stack: Mapped[list[str]] = mapped_column(JSONB)
```

---

## 이유

| 비교 항목 | pgvector | Chroma | Pinecone |
|---------|---------|--------|----------|
| 인프라 수 | 1개 (PostgreSQL만) | 2개 (PG + Chroma) | 2개 (PG + Pinecone) |
| 백업 | PostgreSQL 백업 한 번 | 별도 백업 필요 | 클라우드 의존 |
| 트랜잭션 | 메타데이터+벡터 동시 | 불가 | 불가 |
| Phase 3 비용 | PostgreSQL 비용만 | 추가 비용 | $70+/월 |
| 멀티테넌시 | user_id 필터로 간단 | 별도 컬렉션 관리 | namespace 관리 |
| 한국어 메타데이터 필터 | SQL로 자유롭게 | 제한적 | 제한적 |

운영 단순화와 트랜잭션 일관성이 가장 큰 이유다.

---

## 대안 (검토 후 기각)

### 대안 1: Chroma (로컬)
- ❌ 기각: 별도 서비스 관리, 백업 분리, 메타데이터 필터 제한

### 대안 2: Pinecone (클라우드)
- ❌ 기각: Phase 3 비용 $70+/월, 외부 의존성, 데이터 통제 약함

### 대안 3: Weaviate
- ❌ 기각: 학습 곡선, 추가 인프라

---

## 결과

### 긍정적
- ✅ 인프라 단순: PostgreSQL 하나로 메타데이터 + 벡터 통합 관리
- ✅ 트랜잭션 일관성: 문서 저장과 벡터 인덱싱이 원자적
- ✅ SQL의 유연한 메타데이터 필터 (user_id, tech_stack, date_range 등)
- ✅ 운영 비용 최소화

### 부정적
- ⚠️ 초대규모(수억 벡터) 시 전용 벡터 DB 대비 성능 불리할 수 있음
  → 현재 규모(개인 수천 문서)에서 문제 없음

---

## 변경 이력

| 날짜 | 변경 | 사유 |
|------|------|------|
| 2026-05-22 | 최초 작성 (v0.2 변경사항) | Chroma에서 pgvector로 변경 |
