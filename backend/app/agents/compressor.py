from app.agents.state import ItemState
from app.llm.factory import LLMFactory
from app.utils.char_counter import count_chars, diff_chars

_SYSTEM = """당신은 자기소개서 분량 조정 전문가입니다.
주어진 자소서를 목표 글자수에 맞게 자연스럽게 수정합니다.
내용의 핵심은 유지하면서 분량만 조정하세요.
수정된 자소서 본문만 출력하세요."""


async def compressor_node(state: ItemState) -> dict:
    item = state["item"]
    current = state["content"]
    target = item["char_limit"]
    diff = diff_chars(current, target)  # 음수=부족, 양수=초과

    cfg = state["agent_config"].get("compressor", {})
    provider = cfg.get("provider", "ollama")
    model = cfg.get("model", "exaone3.5:7.8b")
    api_key = cfg.get("api_key", "")

    direction = "줄여" if diff > 0 else "늘려"
    prompt = f"""아래 자소서를 {target}자(공백 포함)에 맞게 {abs(diff)}자 {direction}주세요.

현재 {state['char_count']}자 → 목표 {target}자

[현재 자소서]
{current}

수정된 자소서 본문만 출력하세요."""

    llm = LLMFactory.create(provider, model, api_key)
    result = await llm.generate(
        prompt=prompt,
        system=_SYSTEM,
        max_tokens=min(target * 3, 3000),
        temperature=0.3,
    )
    content = result.content.strip()
    return {
        "content": content,
        "char_count": count_chars(content),
    }
