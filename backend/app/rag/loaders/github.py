"""GitHub 레포 로더 — README + docs 자동 수집 (ADR-019).

- 공개 레포만 지원 (인증 없이 GitHub API 호출)
- 무인증 rate limit 60/h, 개인 사용에 충분
- 수집: README.md (default branch) + docs/ 폴더 내 모든 *.md 재귀
"""
import re

import httpx

_API_BASE = "https://api.github.com"
_USER_AGENT = "HireAgent-RAG/1.0"
_TIMEOUT = 15.0
_MAX_FILES = 50  # 한 번에 최대 인덱싱할 파일 수
_DOCS_PATHS = ("docs", "doc")  # 탐색할 폴더


class GitHubFetchError(Exception):
    """사용자 표시용 에러 메시지."""


_REPO_URL_RE = re.compile(
    r"^https?://github\.com/(?P<owner>[\w.-]+)/(?P<repo>[\w.-]+?)(?:\.git)?(?:/.*)?$",
    re.IGNORECASE,
)


def parse_repo_url(url: str) -> tuple[str, str]:
    """`https://github.com/owner/repo` → (owner, repo)."""
    match = _REPO_URL_RE.match(url.strip())
    if not match:
        raise GitHubFetchError("올바른 GitHub repo URL이 아닙니다. 예: https://github.com/owner/repo")
    return match.group("owner"), match.group("repo")


async def _gh_get(client: httpx.AsyncClient, path: str) -> httpx.Response:
    return await client.get(
        f"{_API_BASE}{path}",
        headers={"User-Agent": _USER_AGENT, "Accept": "application/vnd.github+json"},
    )


async def _fetch_text(client: httpx.AsyncClient, url: str) -> str:
    resp = await client.get(url, headers={"User-Agent": _USER_AGENT})
    resp.raise_for_status()
    return resp.text


async def fetch_repo_docs(repo_url: str) -> dict:
    """GitHub repo에서 README + docs/ 마크다운 파일들을 가져온다.

    Returns:
        {
          "owner": str, "repo": str, "description": str | None,
          "files": [{"path": str, "content": str}],
        }
    """
    owner, repo = parse_repo_url(repo_url)

    async with httpx.AsyncClient(timeout=_TIMEOUT, follow_redirects=True) as client:
        # 1) repo 메타 (존재 확인 + description)
        resp = await _gh_get(client, f"/repos/{owner}/{repo}")
        if resp.status_code == 404:
            raise GitHubFetchError(
                f"레포를 찾을 수 없습니다 ({owner}/{repo}). 공개 레포이고 URL이 정확한지 확인하세요."
            )
        if resp.status_code == 403:
            raise GitHubFetchError(
                "GitHub API rate limit (60/h, 무인증) 도달. 1시간 후 다시 시도하세요."
            )
        if resp.status_code >= 400:
            raise GitHubFetchError(f"GitHub API 오류: HTTP {resp.status_code}")

        repo_meta = resp.json()
        description = repo_meta.get("description")

        files: list[dict] = []

        # 2) README (default branch에서 자동 탐색)
        readme_resp = await _gh_get(client, f"/repos/{owner}/{repo}/readme")
        if readme_resp.status_code == 200:
            readme = readme_resp.json()
            download_url = readme.get("download_url")
            if download_url:
                try:
                    content = await _fetch_text(client, download_url)
                    files.append({"path": readme.get("path", "README.md"), "content": content})
                except httpx.HTTPError:
                    pass

        # 3) docs/ 폴더 재귀 탐색
        for docs_path in _DOCS_PATHS:
            await _collect_markdown(client, owner, repo, docs_path, files)
            if len(files) >= _MAX_FILES:
                break

        if not files:
            raise GitHubFetchError(
                f"{owner}/{repo}에서 README/docs를 찾을 수 없습니다. "
                "공개 레포에 README.md 또는 docs/ 폴더가 있는지 확인하세요."
            )

        return {
            "owner": owner,
            "repo": repo,
            "description": description,
            "files": files[:_MAX_FILES],
        }


async def _collect_markdown(
    client: httpx.AsyncClient,
    owner: str,
    repo: str,
    path: str,
    accumulator: list[dict],
) -> None:
    """`/contents/{path}` 재귀 탐색해 *.md 파일 모두 accumulator에 추가."""
    if len(accumulator) >= _MAX_FILES:
        return

    resp = await _gh_get(client, f"/repos/{owner}/{repo}/contents/{path}")
    if resp.status_code != 200:
        return

    entries = resp.json()
    if not isinstance(entries, list):
        return

    for entry in entries:
        if len(accumulator) >= _MAX_FILES:
            return
        entry_type = entry.get("type")
        entry_path = entry.get("path", "")
        if entry_type == "file" and entry_path.lower().endswith((".md", ".mdx", ".markdown")):
            download_url = entry.get("download_url")
            if download_url:
                try:
                    content = await _fetch_text(client, download_url)
                    accumulator.append({"path": entry_path, "content": content})
                except httpx.HTTPError:
                    pass
        elif entry_type == "dir":
            await _collect_markdown(client, owner, repo, entry_path, accumulator)
