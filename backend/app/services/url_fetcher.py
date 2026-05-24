"""URL 페칭 서비스 — ADR-009 보조 입력.

공개 페이지만 지원. 차단/로그인 필요 시 명확한 에러 반환.
"""
import re

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


class URLFetchError(Exception):
    """페칭 실패 시 사용자 표시용 메시지를 담는다."""


async def fetch_job_text(url: str) -> dict:
    """URL을 가져와 텍스트만 추출. 메타데이터(title)도 포함.

    Returns: {"text": str, "title": str | None}
    Raises: URLFetchError (사용자 친화 메시지 포함)
    """
    if not (url.startswith("http://") or url.startswith("https://")):
        raise URLFetchError("http:// 또는 https://로 시작하는 URL이어야 합니다.")

    try:
        async with httpx.AsyncClient(
            timeout=_TIMEOUT, follow_redirects=True, headers={"User-Agent": _USER_AGENT}
        ) as client:
            resp = await client.get(url)
    except httpx.TimeoutException:
        raise URLFetchError("페이지 응답이 너무 느립니다 (10초 초과). 직접 텍스트를 붙여넣어 주세요.")
    except httpx.HTTPError as e:
        raise URLFetchError(f"페이지 요청 실패: {e}. 직접 텍스트를 붙여넣어 주세요.")

    if resp.status_code == 403:
        raise URLFetchError(
            "이 사이트는 봇 접근을 차단합니다 (사람인/잡코리아 등). "
            "공고 페이지를 열어 텍스트를 직접 붙여넣어 주세요."
        )
    if resp.status_code == 401:
        raise URLFetchError("로그인이 필요한 페이지입니다. 직접 텍스트를 붙여넣어 주세요.")
    if resp.status_code >= 400:
        raise URLFetchError(
            f"페이지를 불러올 수 없습니다 (HTTP {resp.status_code}). 직접 텍스트를 붙여넣어 주세요."
        )

    content_type = resp.headers.get("content-type", "").lower()
    if "html" not in content_type and "text" not in content_type:
        raise URLFetchError(f"HTML이 아닌 응답입니다 ({content_type}). URL을 다시 확인해주세요.")

    if len(resp.content) > _MAX_HTML_BYTES:
        raise URLFetchError("페이지가 너무 큽니다 (5MB 초과).")

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
            "페이지에서 충분한 텍스트를 찾지 못했습니다. JavaScript로 렌더링되는 페이지일 수 있습니다. "
            "공고 페이지를 열어 텍스트를 직접 붙여넣어 주세요."
        )

    return {"text": text, "title": title}
