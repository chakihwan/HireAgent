from app.agents.state import EssayState
from app.llm.factory import LLMFactory

_SYSTEM = """당신은 채용 공고 분석 전문가입니다.
채용 공고를 읽고 아래 항목을 간결하게 추출하세요.

출력 형식 (마크다운 헤더 사용):
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


async def jd_analyzer_node(state: EssayState) -> dict:
    cfg = state["agent_config"].get("jd_analyzer", {})
    provider = cfg.get("provider", "ollama")
    model = cfg.get("model", "exaone3.5:7.8b")
    api_key = cfg.get("api_key", "")

    llm = LLMFactory.create(provider, model, api_key)
    result = await llm.generate(
        prompt=f"다음 채용 공고를 분석하세요:\n\n{state['job_description']}",
        system=_SYSTEM,
        max_tokens=800,
        temperature=0.3,
    )
    return {
        "jd_analysis": result.content,
        "progress": ["✅ 공고 분석 완료"],
    }
