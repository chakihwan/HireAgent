export type EssayTone = "공식적" | "친근함" | "도전적";
export type EssayPersona = "신입" | "경력직" | "전환";

export type ItemConfig = {
  category: string;
  charLimit: number;
  tone: EssayTone;
  persona: EssayPersona;
};

// 평가 루브릭 항목 (백엔드 evaluator._RUBRIC과 동기화)
export const RUBRIC_LABELS: Record<string, string> = {
  job_fit: "직무적합",
  specificity: "구체성",
  authenticity: "진정성",
  flow: "흐름",
  readability: "가독성",
};

export type DraftResult = {
  category: string;
  content: string;
  char_count: number;
  char_target: number;
  iteration: number;
  evaluation_score: number | null;
  evaluation_feedback: string | null;
  evaluation_scores: Record<string, number> | null;  // 항목별 0~2점 (막대그래프)
  draft_history: DraftHistoryEntry[];                // 단계별 이력
  rag_citations: RagCitation[];                      // 참고한 RAG 청크 (근거)
};

export type RagCitation = {
  source_type: string;
  project_name: string | null;
  snippet: string;
  similarity: number;  // 1 - cosine 거리 (의미적 유사도 — 왜 뽑혔나)
};

export type DraftHistoryEntry = {
  step: "write" | "compress";
  iteration: number;
  content: string;
  char_count: number;
  char_target: number;
};

export type SseStartEvent = {
  message: string;
  total_items: number;
};

export type SseProgressEvent = {
  node: string;
  message: string;
};

export type SseErrorEvent = {
  message: string;
};

export type SseDoneEvent = {
  drafts: DraftResult[];
  progress: string[];
};

export type AgentKey = "jd_analyzer" | "essay_writer" | "compressor" | "evaluator";

export const AGENT_LABELS: Record<AgentKey, string> = {
  jd_analyzer: "JD 분석",
  essay_writer: "자소서 작성",
  compressor: "압축/확장",
  evaluator: "평가",
};

export type Provider = "ollama" | "anthropic" | "openai" | "google";

export type ProviderConfig = {
  provider: Provider;
  model: string;
  apiKey: string;  // 레거시 — providerKeys로 대체됨 (마이그레이션 유지용)
};

export type AppSettings = {
  agents: Record<AgentKey, ProviderConfig>;
  // 프로바이더별 API 키 (한 번 입력 → 같은 프로바이더 쓰는 모든 에이전트가 공유)
  providerKeys: Partial<Record<Provider, string>>;
};

export const PROVIDER_DEFAULT_MODELS: Record<string, string> = {
  ollama: "exaone3.5:7.8b",
  anthropic: "claude-haiku-4-5-20251001",
  openai: "gpt-4o-mini",
  google: "gemini-2.5-flash",
};

// 무료 티어로 사용 불가한 모델 (유료 billing 연결 키에서만 동작).
// ⚠️ 차단이 아니라 "소프트 경고"용이다 — 프론트는 사용자가 무료/유료 티어인지
// 알 수 없으므로(quota는 런타임에만 확정), 막지 말고 알려주고 진행은 허용한다.
// 유료 티어 사용자는 정상 사용 가능. 무료 키면 429로 실패할 수 있음을 사전 고지.
export const PAID_TIER_ONLY_MODELS: Record<string, string> = {
  "gemini-2.5-pro": "Google 무료 티어 미지원 — 유료 billing이 연결된 키에서만 동작합니다.",
  "gemini-2.0-flash": "Google 무료 티어 한도 0 (실측) — 무료 키는 429. 2.5-flash를 쓰거나 유료 billing이 필요합니다.",
};
