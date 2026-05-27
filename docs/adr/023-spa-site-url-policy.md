# ADR-023: SPA 채용 사이트(사람인/잡코리아) URL 페칭 정책

- **상태**: 채택 (Accepted)
- **날짜**: 2026-05-27
- **결정자**: 개발자
- **관련**: [ADR-002](002-no-auto-job-submit.md), [ADR-009](009-jd-input-text-first.md), [ADR-018](018-url-fetch-secondary-input.md)

---

## 컨텍스트

ADR-018에서 채택한 보조 URL 페칭(`httpx + BeautifulSoup`)이 한국 주요 채용 사이트에서 실패하는 케이스 다수 발생.

### 실패 양상

**사람인 (`saramin.co.kr`)**
- 페이지 응답은 200 OK이지만 본문은 SPA shell HTML
- 실제 공고 본문은 별도 iframe에 비동기 로드 (JavaScript 렌더링)
- httpx로 받은 HTML에는 "로그인, 회원가입, 검색, 본문 바로가기" 같은 메뉴/안내문구만
- BeautifulSoup으로 추출하면 메뉴+광고+추천 공고만 1,000자 정도 나옴
- 단순 longest-match 휴리스틱은 "직업전체 HOT100" 사이드바에 있는 **다른 회사 공고**를 가져옴 → 사용자 혼란

**잡코리아 (`jobkorea.co.kr`)** — 같은 SPA 패턴

**LinkedIn** — 로그인 페이지로 리다이렉트되어 본문 추출 무의미

**원티드/로켓펀치/프로그래머스** — SPA지만 일부 본문이 HTML에 포함됨 → 추출 가능

### 후보

| 방식 | 정확도 | 비용 | 위험도 |
|------|-------|------|-------|
| A. 백엔드 헤드리스 브라우저 (Playwright) | 높음 | 메모리·시간 부담 | 봇 차단·약관 위반 |
| B. 사이트별 특수 셀렉터 (BeautifulSoup) | 낮음 | 0 | iframe엔 안 통함 |
| C. 사전 차단 + 사용자 PC에서 우회 | 중 | 0 | 회색지대 |
| D. 사용자 자체 텍스트 붙여넣기만 | 100% | 0 | 0 (불편) |

---

## 결정

**C — 사전 차단 + 북마클릿/Ctrl+P 우회를 사용자 PC에서. 백엔드 헤드리스 안 씀.**

### 1. 사전 차단 도메인 (백엔드)

확실히 추출 불가한 곳만 도메인 화이트리스트로 즉시 거부:

```python
_SPA_DOMAINS = {
    "saramin.co.kr": "사람인",
    "jobkorea.co.kr": "잡코리아",
    "linkedin.com": "LinkedIn",
}
```

원티드/로켓펀치/프로그래머스는 차단 풀고 시도 — 본문 추출되면 통과, 안 되면 휴리스틱이 잡음.

### 2. 노이즈 휴리스틱 (백엔드)

도메인 화이트리스트에 없어도 SPA shell만 추출됐는지 검사:

```python
_SPA_NOISE_KEYWORDS = (
    "본문 바로가기", "검색 폼", "로그인", "회원가입",
    "메뉴", "닫기", "전체메뉴", "마이페이지",
    "Skip to main content", "Sign in", "Sign up",
)
# 5개 이상 매칭 시 SPA shell로 판정 → spa_site 에러
```

### 3. 구조화된 에러 응답

```python
class URLFetchError(Exception):
    def __init__(self, message: str, code: str = "bad_request", site_name: str | None = None):
        ...
# code: spa_site | bot_blocked | login_required | timeout | bad_request
```

API 422 응답:
```json
{"detail": {"code": "spa_site", "message": "...", "site_name": "사람인"}}
```

### 4. 프론트엔드 안내 카드

`SpaSiteGuide` 컴포넌트가 사용자에게 우회 방법 3가지 제시:

**Option 1 — 북마클릿** (가장 강력)
- 사용자가 한 번 북마크 바에 등록 → 모든 사이트에서 본문 추출
- JavaScript가 본문 셀렉터 시도 + iframe dive
- 사람인/잡코리아 감지 시 iframe 직접 접근 시도 → 차단되면 "iframe URL 새 탭" 옵션

**Option 2 — Ctrl+P → PDF 저장 → 복사** (사람인 추천)
- 브라우저 내장 인쇄 미리보기는 iframe 본문도 렌더링
- PDF로 저장 후 PDF 뷰어에서 드래그·복사
- 어떤 사이트에서도 통함

**Option 3 — Ctrl+U 페이지 소스**
- HTML 원본에서 직무 키워드 검색 후 주변 텍스트 복사

### 5. React `javascript:` href Sanitize 우회

React가 보안상 `<a href="javascript:...">`를 sanitize함 → useRef + setAttribute로 직접 DOM에 부착:

```tsx
const linkRef = useRef<HTMLAnchorElement>(null);
// 렌더 후 ref에 직접 attribute 설정
linkRef.current?.setAttribute("href", BOOKMARKLET_CODE);
```

+ 드래그 안 될 때 위한 "코드 복사" 버튼 제공 (수동 북마크 등록용).

---

## 이유

### 백엔드 헤드리스(Playwright) 안 쓰는 이유

- **ADR-002 정신 유지**: "자동 입력/크롤링 미지원" — Playwright는 봇 행위로 분류됨
- **봇 차단 위험**: 사람인이 IP 차단하면 서버 전체 영향
- **약관 위반 우려**: SaaS 배포 시 사이트별 약관 검토 부담
- **자원 부담**: Playwright 1MB+ 이미지, 메모리 300MB+, 페이지당 2-5초
- **불안정성**: 사이트 구조 바뀌면 셀렉터 깨짐 → 운영 부담

### 사용자 PC 우회를 택한 이유

- **법적 위치**: 사용자가 자기 브라우저에서 자기 클릭으로 본인 자소서용 추출 → 사적이용(저작권법 §30) 범위
- **봇 행위 아님**: 1명·1페이지·1클릭 → 일반 사용자와 구분 안 됨
- **우리 서버 책임 분산**: 백엔드는 사용자가 가져온 텍스트만 받음 → 책임 명확

### 도메인 사전 차단 vs 휴리스틱만

- 사람인은 항상 SPA shell만 추출됨 → 시도조차 무의미. 사전 차단으로 즉시 사용자에게 안내 모달 띄움
- 휴리스틱만 쓰면 매번 다운로드 + 파싱 비용 + 안내 지연

### Ctrl+P를 사람인 1순위 추천하는 이유

- 북마클릿이 iframe 본문에 도달 못 하는 경우가 사람인에서 빈번 (cross-origin or 로딩 지연)
- Ctrl+P는 브라우저 내장이라 사이트 구조 무관, 100% 동작
- PDF 저장 → 텍스트 선택은 일반 사용자에게도 익숙한 절차

---

## 트레이드오프

| 항목 | 결정 |
|------|------|
| UX 마찰 | 사람인은 자동 추출 불가 → 사용자 추가 단계 필요 (Ctrl+P 또는 북마클릿) |
| 북마클릿 회색지대 | 사이트 약관 엄격 해석 시 위반 가능 — disclaimer + 사용자 책임 |
| iframe URL 직접 노출 | 북마클릿이 새 탭으로 iframe URL 여는 옵션 — 사이트 구조 의존 |
| 노이즈 휴리스틱 false positive | 정상 페이지에도 "로그인" 단어 있을 수 있음 — 5개 임계값으로 완화 |

---

## 명시적으로 하지 않는 것

- ❌ Playwright/Puppeteer 백엔드 자동화 (ADR-002 위반)
- ❌ 로그인 자동화 (보안 + 약관)
- ❌ 대량/반복 페이지 순회 (봇 행위)
- ❌ User-Agent 위장으로 봇 차단 우회 (이미 일반 브라우저 UA 사용 중)
- ❌ 사용자 IP를 통한 우회 (사용자가 자기 PC에서 자기 클릭 → 정당)

---

## 결과

### 긍정적
- ✅ 사람인/잡코리아/LinkedIn 즉시 차단 + 안내
- ✅ 원티드/로켓펀치 등은 시도 후 본문 추출 시 통과
- ✅ 노이즈 휴리스틱이 알려지지 않은 SPA 사이트도 잡음
- ✅ 북마클릿이 일반 사이트에서는 강력 (한 번 설치 → 평생 사용)
- ✅ 백엔드 자원 부담 0, 봇 차단 위험 0

### 부정적
- ⚠️ 사람인 본문은 iframe 보호로 북마클릿도 한계 → Ctrl+P 우회 필수
- ⚠️ 북마클릿 설치가 비개발자에겐 처음에 어색 — UI에 등록 방법 2가지(드래그/수동) 제공
- ⚠️ React sanitize 우회 코드(useRef setAttribute) 유지보수 부담

### 사용자 가이드
- 사람인 → Ctrl+P → PDF 저장 → 본문 드래그
- 원티드/로켓펀치 → URL 페칭 그대로 시도
- 그 외 → 텍스트 직접 붙여넣기 (ADR-009)

---

## 변경 이력

| 날짜 | 변경 | 사유 |
|------|------|------|
| 2026-05-27 | 최초 작성 (v0.7.4) | 사람인 실사용에서 본문 추출 실패 + 다른 회사 공고 잘못 가져옴 사례 발견 |
