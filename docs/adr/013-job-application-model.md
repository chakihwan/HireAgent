# ADR-013: JobApplication 모델로 자소서-공고-합격이력 연결

- **상태**: 채택 (Accepted)
- **날짜**: 2026-05-22
- **결정자**: 개발자
- **관련 요구사항**: F-6.1~F-6.5 (자소서 라이브러리)

---

## 컨텍스트

초기 데이터 모델(`EssayLibraryItem`)은 자소서 항목에 `target_company: str` 하나만 두고 있었다.
그러나 실제 사용 시나리오를 검토하니 다음 케이스를 다룰 수 없었다:

1. **같은 회사에 여러 번 지원** — 작년 떨어진 회사에 올해 재지원하면 두 자소서를 어떻게 구분?
2. **여러 항목을 묶어 한 공고에 제출** — 자기소개+지원동기+직무경험 3항목이 한 묶음
3. **합격 이력 단위 분석** — "이 회사 합격 자소서의 공통 패턴" 같은 질문에 답하려면 자소서 단위가 아닌 지원 단위 분석 필요
4. **공고 텍스트 보존** — 자소서가 어떤 JD에 대응해 작성됐는지 검증 가능해야 함

---

## 결정

**`JobApplication` 테이블을 추가하고, `EssayLibraryItem`에 `application_id` 외래키를 둔다.**

```python
class JobApplication(Base):
    __tablename__ = "job_applications"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[str] = mapped_column(index=True)              # 멀티테넌시 (ADR-003)

    # 공고 정보
    company: Mapped[str]
    position: Mapped[str | None]
    job_description: Mapped[str]                                   # 원본 공고 텍스트 보존
    job_url: Mapped[str | None]

    # 지원 메타데이터
    applied_at: Mapped[datetime | None]
    deadline: Mapped[datetime | None]

    # 결과 (지원 단위로 관리)
    status: Mapped[str] = mapped_column(default="draft")
    # "draft" | "submitted" | "passed_doc" | "passed_interview" | "passed_final" | "rejected" | "withdrawn"
    result_notes: Mapped[str | None]                               # 결과 메모

    created_at: Mapped[datetime]
    updated_at: Mapped[datetime]


class EssayLibraryItem(Base):
    __tablename__ = "essay_library"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[str] = mapped_column(index=True)
    application_id: Mapped[int | None] = mapped_column(
        ForeignKey("job_applications.id"), index=True
    )   # NULL이면 자유 작성 (지원과 무관한 연습용)

    category: Mapped[str]                                          # "자기소개", "지원동기", ...
    content: Mapped[str]
    char_count: Mapped[int]
    char_target: Mapped[int]                                       # 작성 시점 목표 글자수
    tone: Mapped[str | None]
    persona: Mapped[str | None]

    version: Mapped[int] = mapped_column(default=1)                # 같은 application 내 재작성 버전
    is_final: Mapped[bool] = mapped_column(default=False)          # 실제 제출본 표시

    # 생성 컨텍스트 (재현/디버깅용)
    generation_metadata: Mapped[dict | None] = mapped_column(JSONB)
    # {"agent_assignments": {...}, "rag_citations": [...], "evaluation_score": 8.5}

    created_at: Mapped[datetime]
```

---

## 이유

| 시나리오 | 단일 테이블 (이전) | JobApplication 분리 (지금) |
|---------|------------------|--------------------------|
| 같은 회사 재지원 | `target_company` 같음 → 구분 불가 | 별도 application 로우 |
| 항목 묶음 관리 | 항목별 분산 | `application_id` 로 묶임 |
| 합격 단위 분석 | 자소서별 status로 불일치 가능 | 지원 단위 status로 일관 |
| 공고 텍스트 보존 | 없음 | `job_description` 컬럼 |
| 자유 작성 (연습) | 구분 불가 | `application_id IS NULL` |

---

## 상태 (status) 머신

```
draft → submitted → passed_doc → passed_interview → passed_final
                ↓             ↓                 ↓
            rejected      rejected          rejected
                ↓
            withdrawn (사용자가 지원 취소)
```

상태는 `JobApplication.status`에서 단일 소스로 관리. 자소서별로 상태를 두지 않는다.

---

## 대안 (검토 후 기각)

### 대안 1: EssayLibraryItem에 자체 status 유지
- ❌ 기각: 같은 지원의 항목들이 다른 status를 가질 수 있어 일관성 깨짐

### 대안 2: JobApplication에 자소서 컬럼들 통째로 (Denormalized)
- ❌ 기각: 항목 추가/삭제마다 컬럼 변경, 라이브러리 검색 어려움

### 대안 3: NoSQL 문서 저장 (지원 = 문서, 자소서 = 배열)
- ❌ 기각: pgvector를 이미 쓰는데 별도 NoSQL 추가는 인프라 분산

---

## 결과

### 긍정적
- ✅ 같은 회사 여러 번 지원 명확히 구분
- ✅ 라이브러리 검색을 "지원 단위"와 "항목 단위" 둘 다 가능
- ✅ 합격 자소서 데이터 누적을 application 단위로 깔끔하게 (Phase 2 분석 기능 기반)
- ✅ 공고 텍스트 영구 보존으로 재학습/검증 가능

### 부정적
- ⚠️ JOIN 한 번 추가 (성능 영향 미미, 인덱스로 해결)
- ⚠️ 자유 작성(application 없는) 케이스 처리 로직 필요

---

## 구현 체크리스트 (M4 데이터 레이어에서)

- [ ] `backend/app/models/job_application.py` 생성
- [ ] `backend/app/models/essay_library.py`에 `application_id` 추가
- [ ] Alembic 마이그레이션 작성
- [ ] `backend/app/api/v1/library.py` 엔드포인트 (지원 단위, 항목 단위 둘 다)
- [ ] `backend/app/api/v1/jobs.py` 엔드포인트 (지원 CRUD, 상태 변경)

---

## 변경 이력

| 날짜 | 변경 | 사유 |
|------|------|------|
| 2026-05-22 | 최초 작성 | 아키텍처 검토 중 라이브러리 모델 한계 발견 |
