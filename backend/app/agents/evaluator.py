import json
import re

from app.agents.state import ItemState
from app.llm.factory import LLMFactory

# 루브릭 — 각 항목 0~2점, 합산 10점 만점. 명시적 기준으로 점수 재현성·설명가능성 확보.
_RUBRIC = [
    ("job_fit", "직무적합", "공고의 요구역량·인재상과 경험이 구체적으로 연결되는가"),
    ("specificity", "구체성", "추상적 수식어 대신 구체적 경험·수치·사례가 있는가"),
    ("authenticity", "진정성", "경험 자료에 근거하며 과장·날조(없는 기술/회사명)가 없는가"),
    ("flow", "흐름", "도입·전개·마무리가 자연스럽고 논리적인가"),
    ("readability", "가독성", "문장이 명료하고 군더더기·중복이 없는가"),
]
_KEYS = [k for k, _, _ in _RUBRIC]

_SYSTEM = """당신은 채용 자기소개서 평가관입니다.
아래 5개 항목을 각각 0~2점(0=미흡, 1=보통, 2=우수)으로 엄격하게 채점하세요.
점수를 후하게 주지 말고, 근거가 부족하면 과감히 0~1점을 주세요.

채점 항목:
1. job_fit (직무적합): 공고의 요구역량·인재상과 경험이 구체적으로 연결되는가
2. specificity (구체성): 추상적 수식어 대신 구체적 경험·수치·사례가 있는가
3. authenticity (진정성): 경험 자료에 근거하며 과장·날조가 없는가
4. flow (흐름): 도입·전개·마무리가 자연스럽고 논리적인가
5. readability (가독성): 문장이 명료하고 군더더기·중복이 없는가

아래 JSON 형식만 출력하세요 (다른 텍스트 금지):
{
  "scores": {"job_fit": 0~2, "specificity": 0~2, "authenticity": 0~2,
             "flow": 0~2, "readability": 0~2},
  "weaknesses": ["가장 약한 점 1~2개"],
  "suggestion": "가장 효과적인 개선 방향 한 문장"
}"""


async def evaluator_node(state: ItemState) -> dict:
    item = state["item"]
    cfg = state["agent_config"].get("evaluator", {})
    provider = cfg.get("provider", "ollama")
    model = cfg.get("model", "exaone3.5:7.8b")
    api_key = cfg.get("api_key", "")

    # 직무적합 평가를 위해 공고 분석을 함께 제공 (앞 500자)
    jd_analysis = (state.get("jd_analysis") or "")[:500]

    prompt = f"""[공고 분석]
{jd_analysis}

[평가할 "{item['category']}" 자소서]
{state['content']}

위 루브릭으로 채점하고 JSON만 출력하세요."""

    llm = LLMFactory.create(provider, model, api_key)
    result = await llm.generate(
        prompt=prompt,
        system=_SYSTEM,
        max_tokens=400,
        temperature=0.2,
    )

    score, feedback = _parse_evaluation(result.content)

    return {
        "evaluation_score": score,
        "evaluation_feedback": feedback,
        "node_events": [
            {"node": "evaluate", "category": item["category"], "phase": "done",
             "detail": f"★ {score:.1f}점" if score is not None else "평가 실패"},
        ],
    }


def _parse_evaluation(raw: str) -> tuple[float | None, str]:
    """LLM JSON 응답 → (총점, 피드백 텍스트). 파싱 실패 시 (None, 안내)."""
    try:
        match = re.search(r"\{.*\}", raw.strip(), re.DOTALL)
        parsed = json.loads(match.group() if match else raw)
        scores = parsed.get("scores", {})

        # 각 항목 0~2로 clamp 후 백엔드에서 합산 (LLM 산수 실수 방지)
        breakdown_parts = []
        total = 0.0
        for key, label, _ in _RUBRIC:
            v = float(scores.get(key, 1))
            v = max(0.0, min(2.0, v))
            total += v
            breakdown_parts.append(f"{label} {v:.0f}")

        weaknesses = parsed.get("weaknesses") or []
        suggestion = (parsed.get("suggestion") or "").strip()

        # 피드백 = 항목별 점수 + 약점 + 개선 제안 (사용자가 "왜 이 점수인지" 이해)
        feedback = " · ".join(breakdown_parts)
        if weaknesses:
            feedback += f" | 약점: {', '.join(str(w) for w in weaknesses[:2])}"
        if suggestion:
            feedback += f" | 개선: {suggestion}"

        return round(total, 1), feedback
    except Exception:
        # 파싱 실패 — 7.0 고정 대신 None으로 "평가 불가"를 명확히 표시
        return None, (
            "평가 결과를 해석하지 못했습니다 (모델이 형식을 벗어남). 모델 변경을 권장합니다."
        )
