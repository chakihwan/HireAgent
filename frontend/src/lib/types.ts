export type EssayTone = "공식적" | "친근함" | "도전적";
export type EssayPersona = "신입" | "경력직" | "전환";

export type ItemConfig = {
  category: string;
  charLimit: number;
  tone: EssayTone;
  persona: EssayPersona;
};

export type DraftResult = {
  category: string;
  content: string;
  char_count: number;
  char_target: number;
  iteration: number;
  evaluation_score: number | null;
  evaluation_feedback: string | null;
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
  google: "gemini-2.0-flash",
};
