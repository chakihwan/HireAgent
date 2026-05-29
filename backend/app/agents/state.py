import operator
from typing import Annotated, TypedDict


class EssayItem(TypedDict):
    category: str       # "자기소개" | "지원동기" | "성장과정" | ...
    char_limit: int     # 목표 글자수
    tone: str | None    # "공식적" | "친근함" | "도전적"
    persona: str | None # "신입" | "경력" | "전환"


class Draft(TypedDict):
    category: str
    content: str
    char_count: int
    iteration: int
    evaluation_score: float | None
    evaluation_feedback: str | None


class EssayState(TypedDict):
    # ── 입력 ──
    job_description: str
    items: list[EssayItem]
    agent_config: dict          # {agent_name: {provider, model}}
    user_id: str

    # ── 중간 상태 ──
    jd_analysis: str            # JD 분석 에이전트 결과
    target_company: str         # JD에서 추출한 지원 회사명

    # ── 병렬 노드 출력 (reducer로 리스트에 누적) ──
    drafts: Annotated[list[Draft], operator.add]

    # ── 진행 로그 (SSE 스트리밍용) ──
    progress: Annotated[list[str], operator.add]

    # ── 오류 ──
    errors: Annotated[list[str], operator.add]


class ItemState(TypedDict):
    """개별 항목 처리 서브그래프용 상태"""
    item: EssayItem
    jd_analysis: str
    target_company: str
    agent_config: dict
    user_id: str

    # RAG 검색 결과 (작성 에이전트가 참고)
    rag_context: list[str]
    # 사용자가 실제로 다룬 기술 화이트리스트 (할루시네이션 방지)
    tech_whitelist: list[str]

    content: str
    char_count: int
    iteration: int
    evaluation_score: float | None
    evaluation_feedback: str | None
