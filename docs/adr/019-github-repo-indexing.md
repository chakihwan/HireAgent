# ADR-019: GitHub 공개 레포 RAG 인덱싱 (무인증 API)

- **상태**: 채택 (Accepted)
- **날짜**: 2026-05-25
- **결정자**: 개발자
- **관련**: [ADR-002](002-no-auto-job-submit.md), [ADR-005](005-korean-embeddings.md), [ADR-017](017-kure-v1-embedding.md)

---

## 컨텍스트

요구사항 §1.4 "프로젝트 문서 RAG"는 HireAgent의 핵심 차별화 포인트.
GitHub의 README/CHANGELOG/docs 파일에는 사용자의 프로젝트 경험이 가장 구조화되어 있어 자소서 생성 품질에 직접적인 영향.

수동으로 텍스트 복사-붙여넣기는 부담이 크다 (저장소가 여러 개면 더). 자동 인덱싱 방식이 필요.

### 후보 방식

1. **PyGithub + Personal Access Token**: 5000 req/h, private repo 지원
2. **무인증 GitHub REST API (httpx)**: 60 req/h, public repo만
3. **git clone**: 전체 파일 다운로드, 큰 레포는 시간/디스크 부담

---

## 결정

**무인증 GitHub REST API + httpx로 README + docs/*.md 수집한다.**

### 구현 (`app/rag/loaders/github.py`)

```python
async def fetch_repo_docs(repo_url: str) -> dict:
    owner, repo = parse_repo_url(repo_url)
    async with httpx.AsyncClient(timeout=15.0) as client:
        # 1) repo 메타 (존재 확인 + description)
        meta = await _gh_get(client, f"/repos/{owner}/{repo}")

        # 2) README (default branch 자동 탐색)
        readme = await _gh_get(client, f"/repos/{owner}/{repo}/readme")

        # 3) docs/ 폴더 재귀 탐색 → *.md/*.mdx/*.markdown
        await _collect_markdown(client, owner, repo, "docs", files)
```

API 엔드포인트: `POST /api/v1/projects/index-github`
```json
{"repo_url": "https://github.com/owner/repo", "category": "...", "tech_stack": [...]}
```

각 파일은 자동으로 `source_type` 설정:
- README* → `project_readme`
- docs/* → `project_doc`

`project_name`은 `"owner/repo"` 형식으로 고정 (재인덱싱 + 삭제 시 식별자).

### URL 파싱

```python
_REPO_URL_RE = re.compile(
    r"^https?://github\.com/(?P<owner>[\w.-]+)/(?P<repo>[\w.-]+?)(?:\.git)?(?:/.*)?$"
)
```

지원 패턴:
- `https://github.com/owner/repo`
- `https://github.com/owner/repo.git`
- `https://github.com/owner/repo/tree/main` 등 path 포함

---

## 이유

### 무인증 + public repo 한정

- **rate limit 60 req/h** = 개인 도구 사용 시 충분 (1회 인덱싱당 평균 3-5 req)
- **token 관리 부담 없음** — 사용자가 PAT 발급/저장 불필요
- **보안 단순**: private repo 접근 안 함 → 키 유출 위험 없음
- **공개 데이터만** = ADR-002 (자동화 금지) 원칙 위반 없음 (사용자가 명시적으로 본인 repo URL 입력)

### `_MAX_FILES = 50` 제한

- 큰 docs 폴더 (예: kubernetes/website)의 RAG 노이즈 방지
- rate limit 보호
- 50개 마크다운이면 일반적인 개인 프로젝트는 모두 커버

### git clone을 안 쓴 이유

- 컨테이너에 git 의존성 추가 부담
- 큰 레포 (수백 MB) 클론 시 시간/디스크 낭비
- API 방식이 필요한 파일만 선택적 조회 가능

---

## 트레이드오프

| 항목 | 비용 |
|------|------|
| Private repo | 미지원 (필요 시 향후 OAuth 또는 PAT 입력 옵션 추가) |
| Rate limit (60/h) | 개인 사용에는 충분, 멀티유저 SaaS화 시 인증 필수 |
| GitHub API 의존 | API 사양 변경 시 깨질 수 있음 (REST v3는 안정적) |
| 마크다운만 | rst/asciidoc/주피터 노트북 등은 미지원 (필요 시 확장) |

---

## 명시적으로 하지 않는 것

- ❌ Private repo 자동 클론 (보안)
- ❌ Personal Access Token 입력/저장 (보안 + 복잡도)
- ❌ Issue/PR/Discussion 내용 크롤링 (사이즈 + 노이즈)
- ❌ 코드 파일 (`.py`, `.ts` 등) 직접 인덱싱 — README/docs로 구조화된 설명만 사용 (LLM이 코드 자체 해석할 필요 없음)
- ❌ `git clone --depth 1` 방식 (Phase 1 범위 외)

---

## 결과

### 긍정적
- ✅ 사용자가 본인 GitHub URL 1줄 입력으로 모든 프로젝트 README/docs 인덱싱
- ✅ 자소서 작성 시 LangGraph retrieve 노드가 자동으로 관련 프로젝트 발췌 참고
- ✅ "프로젝트 문서 RAG" 차별화 포인트 실현
- ✅ E2E 검증 통과 (`anthropics/anthropic-quickstarts` repo README → 12개 청크 자동 인덱싱)

### 부정적
- ⚠️ Private repo 사용 못 함 → 사내 프로젝트 자동 인덱싱 불가
- ⚠️ 같은 repo 재인덱싱 시 중복 청크 누적 (사용자가 `DELETE /by-project/{owner/repo}` 수동 호출 필요)

### 향후 개선
- M5+: 재인덱싱 시 자동 기존 청크 삭제 옵션 (`force=true`)
- Phase 2: GitHub OAuth 로그인 → private repo 지원
- Phase 2: 브라우저 확장에서 GitHub 페이지 직접 인덱싱

---

## 변경 이력

| 날짜 | 변경 | 사유 |
|------|------|------|
| 2026-05-25 | 최초 작성 | M4 RAG 데이터 입력 확장 시점 |
