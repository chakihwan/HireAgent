"""URL 페칭 서비스 — ADR-009 보조 입력.

공개 페이지만 지원. 차단/로그인 필요 시 명확한 에러 반환.
"""
import re
from urllib.parse import urlparse

import httpx
from bs4 import BeautifulSoup

_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)
_TIMEOUT = 10.0
_MAX_HTML_BYTES = 5_000_000  # 5MB

# 본문 추출에서 제거할 태그
_REMOVE_TAGS = ("script", "style", "noscript", "iframe", "header", "footer", "nav", "aside")

# JS 렌더링으로 본문 추출이 사실상 불가능한 사이트만 사전 차단.
# 나머지(원티드/로켓펀치/프로그래머스 등)는 시도해보고 노이즈 휴리스틱이 잡도록 함.
_SPA_DOMAINS = {
    "saramin.co.kr": "사람인",
    "jobkorea.co.kr": "잡코리아",
    "linkedin.com": "LinkedIn",
}

# SPA 페이지 shell에 자주 나오는 메뉴/안내 키워드 (휴리스틱)
_SPA_NOISE_KEYWORDS = (
    "본문 바로가기", "검색 폼", "로그인", "회원가입",
    "메뉴", "닫기", "전체메뉴", "마이페이지",
    "Skip to main content", "Sign in", "Sign up", "Log in",
)


class URLFetchError(Exception):
    """페칭 실패 시 사용자 표시용 메시지 + 분류 코드를 담는다.

    code 값:
    - spa_site: JavaScript 렌더링 사이트, 자동 추출 불가
    - bot_blocked: 봇 차단 (403)
    - login_required: 로그인 필요 (401)
    - timeout: 응답 지연
    - bad_request: URL/응답 오류
    - too_short: 추출된 텍스트가 너무 짧음
    """
    def __init__(self, message: str, code: str = "bad_request", site_name: str | None = None):
        super().__init__(message)
        self.code = code
        self.site_name = site_name


def _classify_spa_site(url: str) -> str | None:
    """URL의 호스트가 알려진 SPA 사이트면 사이트 이름 반환, 아니면 None."""
    try:
        host = urlparse(url).netloc.lower()
        if host.startswith("www."):
            host = host[4:]
        for domain, name in _SPA_DOMAINS.items():
            if host == domain or host.endswith("." + domain):
                return name
    except Exception:
        pass
    return None


def _looks_like_spa_shell(text: str) -> bool:
    """추출된 텍스트가 SPA shell의 메뉴/안내 위주인지 휴리스틱 판단."""
    if not text or len(text) < 50:
        return False
    text_lower = text.lower()
    matches = sum(1 for kw in _SPA_NOISE_KEYWORDS if kw.lower() in text_lower)
    # 키워드 5개 이상 발견되면 SPA shell로 판단
    if matches >= 5:
        return True
    # 또는 텍스트 짧고 노이즈 비율 높으면
    if len(text) < 500 and matches >= 3:
        return True
    return False


async def fetch_job_text(url: str) -> dict:
    """URL을 가져와 텍스트만 추출. 메타데이터(title)도 포함.

    Returns: {"text": str, "title": str | None}
    Raises: URLFetchError (사용자 친화 메시지 + 분류 코드 포함)
    """
    if not (url.startswith("http://") or url.startswith("https://")):
        raise URLFetchError(
            "http:// 또는 https://로 시작하는 URL이어야 합니다.",
            code="bad_request",
        )

    # SPA 사이트 사전 차단 (요청 보내기 전에)
    spa_name = _classify_spa_site(url)
    if spa_name:
        raise URLFetchError(
            f"{spa_name}은(는) JavaScript로 렌더링되는 사이트라 자동 추출이 어렵습니다.",
            code="spa_site",
            site_name=spa_name,
        )

    try:
        async with httpx.AsyncClient(
            timeout=_TIMEOUT, follow_redirects=True, headers={"User-Agent": _USER_AGENT}
        ) as client:
            resp = await client.get(url)
    except httpx.TimeoutException:
        raise URLFetchError(
            "페이지 응답이 너무 느립니다 (10초 초과). 직접 텍스트를 붙여넣어 주세요.",
            code="timeout",
        )
    except httpx.HTTPError as e:
        raise URLFetchError(
            f"페이지 요청 실패: {e}. 직접 텍스트를 붙여넣어 주세요.",
            code="bad_request",
        )

    if resp.status_code == 403:
        raise URLFetchError(
            "이 사이트는 봇 접근을 차단합니다. 공고 페이지를 열어 텍스트를 직접 붙여넣어 주세요.",
            code="bot_blocked",
        )
    if resp.status_code == 401:
        raise URLFetchError(
            "로그인이 필요한 페이지입니다. 직접 텍스트를 붙여넣어 주세요.",
            code="login_required",
        )
    if resp.status_code >= 400:
        raise URLFetchError(
            f"페이지를 불러올 수 없습니다 (HTTP {resp.status_code}). 직접 텍스트를 붙여넣어 주세요.",
            code="bad_request",
        )

    content_type = resp.headers.get("content-type", "").lower()
    if "html" not in content_type and "text" not in content_type:
        raise URLFetchError(
            f"HTML이 아닌 응답입니다 ({content_type}). URL을 다시 확인해주세요.",
            code="bad_request",
        )

    if len(resp.content) > _MAX_HTML_BYTES:
        raise URLFetchError("페이지가 너무 큽니다 (5MB 초과).", code="bad_request")

    html = resp.text
    soup = BeautifulSoup(html, "lxml")

    # 제목 추출
    title = None
    if soup.title and soup.title.string:
        title = soup.title.string.strip()

    # 불필요한 태그 제거
    for tag_name in _REMOVE_TAGS:
        for tag in soup.find_all(tag_name):
            tag.decompose()

    # main, article, [role=main] 우선
    main_content = soup.find("main") or soup.find("article") or soup.find(attrs={"role": "main"})
    target = main_content or soup.body or soup
    text = target.get_text(separator="\n", strip=True)

    # 공백/빈줄 정리
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"[ \t]+", " ", text)

    if len(text) < 100:
        raise URLFetchError(
            "페이지에서 충분한 텍스트를 찾지 못했습니다. "
            "JavaScript로 렌더링되는 페이지일 수 있습니다.",
            code="spa_site",
        )

    # 휴리스틱: 추출된 텍스트가 SPA shell의 메뉴/안내 위주인지 검사
    if _looks_like_spa_shell(text):
        raise URLFetchError(
            "페이지에서 채용 공고 본문을 찾지 못했습니다. "
            "메뉴와 안내문구만 추출되어, JavaScript 렌더링 사이트일 가능성이 높습니다.",
            code="spa_site",
        )

    return {"text": text, "title": title}
