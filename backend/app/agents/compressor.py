from app.agents.state import ItemState
from app.llm.factory import LLMFactory
from app.utils.char_counter import count_chars, diff_chars
from app.utils.text_cleaner import clean_llm_output

_SYSTEM = """당신은 자기소개서 분량 조정 전문가입니다.
주어진 자소서를 목표 글자수에 맞게 자연스럽게 수정합니다.

규칙:
- 내용의 핵심은 유지하면서 분량만 조정
- 마크다운 문법 사용 금지: **, *, #, 불릿, 볼드, 이탤릭, 섹션 헤더 모두 금지
- 글자수 메타 정보 출력 금지 ("수정 후 글자 수: N자" 등 절대 금지)
- 이메일, 전화번호, 주소 같은 개인 연락처 출력 금지
- 수정된 자소서 본문만 출력 (순수 텍스트 단락)"""


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
    target_min = int(target * 0.90)  # 허용 하한을 조금 넓혀 압축 여유 확보
    target_max = int(target * 1.00)  # 상한은 목표 100%로 타이트하게 (초과 금지)
    prompt = f"""아래 자소서를 반드시 {target}자 이하로 줄여주세요.

현재: {state['char_count']}자  목표: {target_min}~{target_max}자
{abs(diff)}자를 {direction}야 합니다.

⚠️ 절대 규칙:
- 출력이 {target_max}자를 초과하면 안 됩니다. 약간 짧아져도 괜찮습니다.
- 내용을 새로 추가하지 마세요. 기존 내용에서만 줄이세요.

[현재 자소서]
{current}

수정된 자소서 본문만 출력하세요."""

    llm = LLMFactory.create(provider, model, api_key)
    # max_tokens를 목표 × 1.1로 강제 — 물리적 상한을 타깃에 바짝 붙여 초과 불가
    result = await llm.generate(
        prompt=prompt,
        system=_SYSTEM,
        max_tokens=min(int(target * 1.1), 1500),
        temperature=0.3,
    )
    content = clean_llm_output(result.content)
    iteration = state.get("iteration", 0) + 1
    char_count = count_chars(content)
    return {
        "content": content,
        "char_count": char_count,
        "iteration": iteration,
        "draft_history": [
            {"step": "compress", "iteration": iteration,
             "content": content, "char_count": char_count,
             "char_target": target},
        ],
        "node_events": [
            {"node": "compress", "category": item["category"], "phase": "done",
             "detail": f"{char_count}자", "iteration": iteration},
        ],
    }
