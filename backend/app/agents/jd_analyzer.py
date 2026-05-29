import re

from app.agents.state import EssayState
from app.llm.factory import LLMFactory

_SYSTEM = """당신은 채용 공고 분석 전문가입니다.
채용 공고를 읽고 아래 항목을 간결하게 추출하세요.

출력 형식 (마크다운 헤더 사용, 순서 유지):
## 지원 회사명
(공고에서 찾은 회사명 한 줄. 모르면 "알 수 없음")

## 회사 인재상
(2~3문장)

## 핵심 요구 역량
- 역량1
- 역량2
- 역량3 (최대 5개)

## 선호 경험/기술
(간결하게)

## 직무 핵심 요약
(1~2문장)"""

_COMPANY_RE = re.compile(
    r"##\s*지원\s*회사명\s*\n+([^\n#]+)",
    re.IGNORECASE,
)


def _looks_like_url(text: str) -> bool:
    stripped = text.strip()
    return stripped.startswith("http://") or stripped.startswith("https://")


async def jd_analyzer_node(state: EssayState) -> dict:
    cfg = state["agent_config"].get("jd_analyzer", {})
    provider = cfg.get("provider", "ollama")
    model = cfg.get("model", "exaone3.5:7.8b")
    api_key = cfg.get("api_key", "")

    jd = state["job_description"]
    progress: list[str] = []

    if _looks_like_url(jd):
        progress.append(
            "⚠️ URL이 입력됐습니다. 공고 텍스트를 직접 붙여넣어야 정확한 자소서를 생성할 수 있습니다. "
            "현재 URL만으로 분석하면 AI가 내용을 추측해 결과가 부정확할 수 있습니다."
        )

    llm = LLMFactory.create(provider, model, api_key)
    result = await llm.generate(
        prompt=f"다음 채용 공고를 분석하세요:\n\n{jd}",
        system=_SYSTEM,
        max_tokens=800,
        temperature=0.3,
    )
    analysis_text = result.content
    m = _COMPANY_RE.search(analysis_text)
    target_company = m.group(1).strip() if m else "알 수 없음"
    if target_company == "알 수 없음":
        progress.append("ℹ️ 공고에서 회사명을 찾지 못했습니다.")
    else:
        progress.append(f"✅ 공고 분석 완료 — 지원 회사: {target_company}")
    return {
        "jd_analysis": analysis_text,
        "target_company": target_company,
        "progress": progress,
    }
