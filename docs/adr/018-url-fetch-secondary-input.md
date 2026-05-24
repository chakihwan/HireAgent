# ADR-018: URL 페칭 보조 입력 (ADR-009 구체 구현)

- **상태**: 채택 (Accepted)
- **날짜**: 2026-05-24
- **결정자**: 개발자
- **관련**: [ADR-002](002-no-auto-job-submit.md), [ADR-009](009-jd-input-text-first.md)

---

## 컨텍스트

ADR-009에서 "공고 입력의 주(primary) 방식은 텍스트 직접 붙여넣기, URL 크롤링은 보조"로 결정했으나 실제 구현이 없는 상태였다.

M4 진행 중 사용자 피드백:
> "사람인같은 곳에 구인 공고는 드래그가 금지 되어있는데 그런곳에서는 URL을 사용하고 싶을 텐데 불편하지 않겠어?"

원티드/잡플래닛은 텍스트 복사가 가능하지만, 사람인/잡코리아 등은 우클릭/드래그 방지가 적용되어 있어 텍스트 추출이 어렵다. ADR-009 문서 시점부터 의도했던 보조 URL 페칭 기능이 이때 가장 필요했다.

추가로 사용자가 URL 형식 문자열을 textarea에 그대로 붙여넣은 경우 LLM이 URL을 분석해 할루시네이션하는 사고가 발생했다.

---

## 결정

**`POST /api/v1/jobs/fetch-url` 엔드포인트로 ADR-009의 보조 입력 채널을 구현한다.**

### API

```http
POST /api/v1/jobs/fetch-url
Content-Type: application/json

{"url": "https://www.wanted.co.kr/wd/12345"}

→ 200 OK
{"text": "...추출된 본문...", "title": "페이지 제목"}

→ 422 Unprocessable Entity
{"detail": "이 사이트는 봇 접근을 차단합니다 (사람인/잡코리아 등). 직접 텍스트를 붙여넣어 주세요."}
```

### 구현 (`app/services/url_fetcher.py`)

```python
async def fetch_job_text(url: str) -> dict:
    async with httpx.AsyncClient(timeout=10.0, follow_redirects=True,
                                  headers={"User-Agent": "..."}) as client:
        resp = await client.get(url)

    # HTTP 코드별 사용자 친화 에러
    if resp.status_code == 403:
        raise URLFetchError("이 사이트는 봇 접근을 차단합니다...")
    if resp.status_code == 401:
        raise URLFetchError("로그인이 필요한 페이지입니다...")

    soup = BeautifulSoup(resp.text, "lxml")
    for tag in soup.find_all(("script", "style", "nav", "header", "footer", ...)):
        tag.decompose()
    target = soup.find("main") or soup.find("article") or soup.body
    text = target.get_text(separator="\n", strip=True)

    if len(text) < 100:
        raise URLFetchError("JavaScript 렌더링 페이지일 수 있습니다...")
    return {"text": text, "title": soup.title.string if soup.title else None}
```

### 프론트엔드

JD 입력 단계에서 URL 패턴 감지 시 경고 박스 대신 **"URL에서 가져오기" 버튼** 표시:
- 클릭 → `/jobs/fetch-url` 호출 → textarea를 추출 텍스트로 교체
- 실패 시 amber 에러 박스로 안내 (사용자가 직접 붙여넣기로 fallback)

---

## 이유

### URL 페칭을 보조 옵션으로 한정한 이유

| 항목 | 제한 |
|------|------|
| 사이트 정책 | robots.txt + 이용약관 위반 위험은 사용자 책임 |
| 봇 차단 | 403/401 시 명확한 안내 후 텍스트 붙여넣기 권유 |
| JS 렌더링 | SPA 사이트는 본문 < 100자 → 추출 실패 처리 |
| 로그인 필요 | 401 응답 시 명확한 안내 |
| Timeout | 10초 |
| 응답 크기 | 5MB 제한 |
| Content-Type | text/html, text/* 만 허용 |

### 차단 사이트 (사람인 등) 대응

- 페칭 자체는 시도 → 403/401 받으면 사용자 친화 메시지로 변환
- "이 사이트는 봇 접근을 차단합니다. 직접 텍스트를 붙여넣어 주세요."
- 우회/위장(rotating proxy 등)은 **하지 않음** (ADR-002 정신)

### URL 입력 차단을 풀고 페칭으로 전환한 이유

이전 변경에서 URL 입력 자체를 차단하는 amber 경고 박스를 추가했다.
하지만 ADR-009 원안은 URL을 보조 옵션으로 허용하는 것이었으므로, 차단이 아닌 **페칭 시도**가 ADR 정신에 부합한다.

---

## 트레이드오프

| 항목 | 비용 |
|------|------|
| BeautifulSoup + lxml 의존성 | ~5MB 추가, 안정성 검증 충분 |
| 사이트별 차단 대응 | 일부 사이트는 어차피 실패 → 사용자 fallback에 의존 |
| 페칭 실패 시 UX | 명확한 에러 메시지 + 안내 |

---

## 명시적으로 하지 않는 것

- ❌ User-Agent rotation (봇 위장)
- ❌ 헤드리스 브라우저 (Playwright, Puppeteer)로 JS 렌더링
- ❌ 로그인 자동화
- ❌ 사이트별 커스텀 파서 (원티드/사람인용 추출 로직)
- ❌ 자동 재시도 + 백오프

이유: ADR-002(자동 입력 미지원), ADR-009(보조 기능) 정신 유지.
사용자 사용량이 늘어 필요해지면 **브라우저 확장프로그램**(요구사항 F-8.6) 방향으로 진행.

---

## 결과

### 긍정적
- ✅ 드래그 금지 사이트도 URL만 입력하면 일부 자동화 가능
- ✅ 페칭 실패 사이트는 명확한 안내로 텍스트 붙여넣기 유도
- ✅ ADR-009 원안 구체 구현 완성

### 부정적
- ⚠️ 사람인/잡코리아 등 차단 사이트에 대한 사용자 기대 vs 실제 격차

### 완화
- UI: "사람인 등 일부 사이트는 차단되어 있어 실패할 수 있습니다" 안내문 표시
- 향후 (F-8.6): 브라우저 확장프로그램으로 사용자 PC에서 추출 → 서버 IP 차단 회피

---

## 변경 이력

| 날짜 | 변경 | 사유 |
|------|------|------|
| 2026-05-24 | 최초 작성 | URL 입력 사용자 피드백 + ADR-009 구체화 |
