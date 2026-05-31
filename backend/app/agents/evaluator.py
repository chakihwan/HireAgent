import json
import re

from app.agents.state import ItemState
from app.llm.factory import LLMFactory

_SYSTEM = """당신은 자기소개서 평가 전문가입니다.
아래 형식의 JSON만 출력하세요. 다른 텍스트는 절대 출력하지 마세요.

{
  "score": <1-10 정수>,
  "strengths": ["강점1", "강점2"],
  "weaknesses": ["약점1", "약점2"],
  "suggestion": "핵심 개선 방향 한 문장"
}"""


async def evaluator_node(state: ItemState) -> dict:
    item = state["item"]
    cfg = state["agent_config"].get("evaluator", {})
    provider = cfg.get("provider", "ollama")
    model = cfg.get("model", "exaone3.5:7.8b")
    api_key = cfg.get("api_key", "")

    prompt = f"""다음 "{item['category']}" 자소서를 평가하세요.

[자소서]
{state['content']}

JSON만 출력하세요."""

    llm = LLMFactory.create(provider, model, api_key)
    result = await llm.generate(
        prompt=prompt,
        system=_SYSTEM,
        max_tokens=300,
        temperature=0.2,
    )

    try:
        # JSON 블록 추출
        raw = result.content.strip()
        json_match = re.search(r"\{.*\}", raw, re.DOTALL)
        parsed = json.loads(json_match.group() if json_match else raw)
        score = float(parsed.get("score", 7))
        suggestion = parsed.get("suggestion", "")
    except Exception:
        score = 7.0
        suggestion = ""

    return {
        "evaluation_score": score,
        "evaluation_feedback": suggestion,
        "node_events": [
            {"node": "evaluate", "category": item["category"], "phase": "done",
             "detail": f"★ {score:.1f}점"},
        ],
    }
