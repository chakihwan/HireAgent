import operator
from typing import Annotated, TypedDict

# 노드 이벤트 타입 — 프론트엔드 그래프 뷰 실시간 업데이트용
# {"node": "rag|write|compress|evaluate", "category": "직무경험", "phase": "start|done|error", "detail": "..."}
NodeEvent = dict


class EssayItem(TypedDict, total=False):
    category: str           # "자기소개" | "지원동기" | "성장과정" | ...
    char_limit: int         # 목표 글자수
    tone: str | None        # "공식적" | "친근함" | "도전적"
    persona: str | None     # "신입" | "경력" | "전환"
    agent_config: dict | None  # 항목별 에이전트 설정 (없으면 전역 설정 사용)


class Draft(TypedDict):
    category: str
    content: str
    char_count: int
    iteration: int
    evaluation_score: float | None
    evaluation_feedback: str | None
    evaluation_scores: dict | None   # 항목별 점수 (막대그래프용)
    draft_history: list[dict]        # 단계별 이력 (write/compress 각 결과)


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

    # ── sub-node 이벤트 (그래프 뷰 실시간 업데이트) ──
    node_events: Annotated[list[NodeEvent], operator.add]

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
    # 채택된 청크의 source_type 분포 (관찰용)
    rag_sources: dict[str, int]
    # 사용자가 실제로 다룬 기술 화이트리스트 (할루시네이션 방지)
    tech_whitelist: list[str]
    # sub-node 이벤트 — 프론트엔드 그래프 뷰 실시간 업데이트용
    node_events: Annotated[list[NodeEvent], operator.add]
    # 단계별 이력 — write/compress 각 결과 (누적, 투명성·디버깅용)
    draft_history: Annotated[list[dict], operator.add]

    content: str
    char_count: int
    iteration: int
    evaluation_score: float | None
    evaluation_feedback: str | None
    evaluation_scores: dict | None
