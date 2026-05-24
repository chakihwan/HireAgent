import re

from app.agents.state import ItemState
from app.llm.factory import LLMFactory
from app.utils.char_counter import count_chars

_SYSTEM = """당신은 한국어 자기소개서 작성 전문가입니다.
주어진 공고 분석과 조건에 맞게 자소서 항목을 작성합니다.

규칙:
- 글자수(공백 포함)를 목표에 최대한 맞춰 작성
- 구체적인 경험/수치를 포함해 설득력 있게
- [참고 경험]이 제공되면 그 내용을 적극 활용하되, 그대로 복사하지 말고 항목 흐름에 맞게 자연스럽게 녹여낼 것
- 참고 경험에 없는 내용을 지어내지 말 것 (참고 경험이 없으면 일반적인 강점으로 작성)
- "참고 경험에 따르면", "[참고 경험 1]에서" 같이 자료 출처를 본문에 노출하지 말 것 (1인칭 경험으로 자연스럽게 서술)
- "###", "**400자**" 같은 마크다운/메타 정보 출력 금지
- 자연스러운 한국어 문어체 사용
- 자소서 본문만 출력 (제목/설명/마크다운 없이 순수 텍스트)"""


async def essay_writer_node(state: ItemState) -> dict:
    item = state["item"]
    cfg = state["agent_config"].get("essay_writer", {})
    provider = cfg.get("provider", "ollama")
    model = cfg.get("model", "exaone3.5:7.8b")
    api_key = cfg.get("api_key", "")

    tone = item.get("tone") or "공식적"
    persona = item.get("persona") or "경력직"

    rag_context = state.get("rag_context") or []
    rag_section = ""
    if rag_context:
        joined = "\n\n---\n\n".join(f"[참고 경험 {i + 1}]\n{c}" for i, c in enumerate(rag_context))
        rag_section = f"\n\n[참고 경험]\n사용자의 실제 경험/프로젝트 기록입니다. 자소서에 적극 활용하세요.\n\n{joined}\n"

    prompt = f"""아래 공고 분석을 바탕으로 "{item['category']}" 항목의 자소서를 작성하세요.

[공고 분석]
{state['jd_analysis']}
{rag_section}
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
    content = _clean_output(result.content)
    return {
        "content": content,
        "char_count": count_chars(content),
        "iteration": state.get("iteration", 0) + 1,
        "evaluation_score": None,
        "evaluation_feedback": None,
    }


# 마크다운 헤더 / 메타 정보 / 코드펜스 제거 후처리
_HEADER_RE = re.compile(r"^\s*#{1,6}\s+.*$", re.MULTILINE)
_BOLD_META_RE = re.compile(r"\*\*\s*\d+\s*자[^*]*\*\*", re.MULTILINE)
_CODE_FENCE_RE = re.compile(r"^```.*$", re.MULTILINE)


def _clean_output(text: str) -> str:
    """LLM이 잘못 출력한 마크다운 헤더, 글자수 메타, 코드 펜스 제거."""
    text = _HEADER_RE.sub("", text)
    text = _BOLD_META_RE.sub("", text)
    text = _CODE_FENCE_RE.sub("", text)
    # 연속 빈 줄 정리
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()
