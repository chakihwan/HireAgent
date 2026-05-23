from app.agents.state import ItemState
from app.llm.factory import LLMFactory
from app.utils.char_counter import count_chars

_SYSTEM = """당신은 한국어 자기소개서 작성 전문가입니다.
주어진 공고 분석과 조건에 맞게 자소서 항목을 작성합니다.

규칙:
- 글자수(공백 포함)를 목표에 최대한 맞춰 작성
- 구체적인 경험/수치를 포함해 설득력 있게
- 자연스러운 한국어 문어체 사용
- 자소서 본문만 출력 (제목/설명 없이)"""


async def essay_writer_node(state: ItemState) -> dict:
    item = state["item"]
    cfg = state["agent_config"].get("essay_writer", {})
    provider = cfg.get("provider", "ollama")
    model = cfg.get("model", "exaone3.5:7.8b")
    api_key = cfg.get("api_key", "")

    tone = item.get("tone") or "공식적"
    persona = item.get("persona") or "경력직"

    prompt = f"""아래 공고 분석을 바탕으로 "{item['category']}" 항목의 자소서를 작성하세요.

[공고 분석]
{state['jd_analysis']}

[작성 조건]
- 항목: {item['category']}
- 목표 글자수: {item['char_limit']}자 (공백 포함, ±5% 허용)
- 톤: {tone}
- 페르소나: {persona}

자소서 본문만 출력하세요."""

    llm = LLMFactory.create(provider, model, api_key)
    result = await llm.generate(
        prompt=prompt,
        system=_SYSTEM,
        max_tokens=min(item["char_limit"] * 3, 3000),
        temperature=0.7,
    )
    content = result.content.strip()
    return {
        "content": content,
        "char_count": count_chars(content),
        "iteration": state.get("iteration", 0) + 1,
        "evaluation_score": None,
        "evaluation_feedback": None,
    }
