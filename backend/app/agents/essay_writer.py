from app.agents.state import ItemState
from app.llm.factory import LLMFactory
from app.utils.char_counter import count_chars
from app.utils.text_cleaner import clean_llm_output

_SYSTEM = """당신은 한국어 자기소개서 작성 전문가입니다.

[공고 분석]은 회사가 무엇을 원하는지에 대한 참고일 뿐입니다.
[경험 자료]만이 사용자가 실제로 한 경험입니다.

⚠️ 핵심 원칙 (절대 위반 금지):
1. 본인 경험으로 서술할 수 있는 것은 오직 [경험 자료]에 명시된 내용뿐입니다.
2. 공고에 언급된 기술·도구·회사명·수치라도 [경험 자료]에 없으면 본인이 다룬 것처럼 절대 쓰지 마세요.
   ❌ 예시 (금지): 공고에 "Kafka 우대" + 경험 자료에 Kafka 없음 → "Kafka 기반 시스템 개발" / "Kafka 사용 경험" 작성 금지
   ✅ 올바른 우회: "메시지 큐와 이벤트 기반 처리에 관심이 있어 학습 중" 같은 전이 가능한 인접 표현 사용
3. 공고가 요구하는 기술 중 경험 자료에 없는 것은 "학습 중·관심 있음·인접 경험으로 빠른 적응 가능" 형태로 서술
4. 모든 수치·회사명·기술명·프로젝트명은 [경험 자료]에서만 인용하고, 새로 지어내지 마세요.

작성 규칙:
- 글자수를 목표에 맞춰 작성. 목표 글자수를 **절대 크게 초과하지 말 것** — 압축 후처리가 있지만 초기 draft가 목표의 120% 이상이면 품질이 낮아짐
- 목표 글자수 범위: 목표 × 0.95 ~ 목표 × 1.1 사이로 초안 작성
- [경험 자료]를 그대로 복사하지 말고 항목 흐름에 맞게 자연스럽게 녹여낼 것
- 경험 자료가 없거나 불충분하면 일반적인 강점·역량 중심으로 작성 (없는 사실 만들지 말 것)
- [경험 자료], [참고 경험] 같은 출처 표현을 본문에 절대 노출하지 말 것 (1인칭 경험으로 자연스럽게 서술)
- 마크다운 문법 사용 금지: **, *, #, -, 불릿, 볼드, 이탤릭, 섹션 헤더 모두 금지
- "기술 역량", "실행력과 협업" 같은 소제목/헤더 금지 — 단락 구분 없는 흐르는 문장으로 작성
- "###", "**400자**" 같은 메타 정보 출력 금지
- 이메일, 전화번호, 주소 같은 개인 연락처를 본문에 절대 포함하지 말 것
- 자연스러운 한국어 문어체 사용
- 자소서 본문만 출력 (제목/설명/마크다운/불릿/연락처 없이 순수 텍스트 단락)"""


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
        joined = "\n\n---\n\n".join(rag_context)
        rag_section = f"\n\n[경험 자료]\n아래는 사용자의 실제 경험/프로젝트 기록입니다. 자소서에 적극 활용하세요.\n출처 표현(경험 자료, 참고 경험 등)은 본문에 절대 쓰지 마세요.\n\n{joined}\n"

    # 기술 화이트리스트 (할루시네이션 방지)
    tech_whitelist = state.get("tech_whitelist") or []
    whitelist_section = ""
    if tech_whitelist:
        whitelist_section = (
            f"\n\n[본인이 실제로 다룬 기술 — 화이트리스트]\n"
            f"이 목록에 있는 기술만 본인 경험으로 서술할 수 있습니다. "
            f"이 목록에 없는 기술(예: Kafka, MySQL, NestJS 등)은 공고에 언급되더라도 본인이 다룬 것처럼 절대 쓰지 마세요.\n"
            f"{', '.join(tech_whitelist)}\n"
        )

    char_limit = item['char_limit']
    char_min = int(char_limit * 0.95)
    char_max = int(char_limit * 1.10)

    target_company = state.get("target_company") or "알 수 없음"
    company_note = (
        f"\n\n[지원 회사 정보]\n"
        f"지원하는 회사: {target_company}\n"
        f"⚠️ 이력서에 등장하는 현재/전 직장 회사명을 지원 회사로 혼동하지 마세요. "
        f"지원동기·입사 후 포부 등에서 회사명을 언급할 때는 반드시 위의 지원 회사명 '{target_company}'를 사용하세요."
        if target_company != "알 수 없음"
        else ""
    )

    prompt = f"""아래 공고 분석을 바탕으로 "{item['category']}" 항목의 자소서를 작성하세요.

[공고 분석]
{state['jd_analysis']}
{rag_section}{whitelist_section}{company_note}

[작성 조건]
- 항목: {item['category']}
- 목표 글자수: {char_limit}자 (공백 포함)
- 허용 범위: {char_min}자 ~ {char_max}자 → 이 범위를 벗어나면 안 됩니다
- 톤: {tone}
- 페르소나: {persona}

⚠️ 글자수 주의: {char_limit}자를 크게 초과하면 압축 처리되어 품질이 낮아집니다. {char_max}자 이하로 작성하세요.

자소서 본문만 출력하세요 (제목·소제목·마크다운·연락처 없이)."""

    llm = LLMFactory.create(provider, model, api_key)
    # max_tokens를 목표 × 2로 제한 — 물리적으로 목표 2배 이상 못 생성하게
    result = await llm.generate(
        prompt=prompt,
        system=_SYSTEM,
        max_tokens=min(item["char_limit"] * 2, 2000),
        temperature=0.7,
    )
    content = clean_llm_output(result.content)
    return {
        "content": content,
        "char_count": count_chars(content),
        "iteration": state.get("iteration", 0) + 1,
        "evaluation_score": None,
        "evaluation_feedback": None,
    }

