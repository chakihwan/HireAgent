import type { AgentKey, AppSettings, Provider, ProviderConfig } from "./types";

const SETTINGS_KEY = "hireagent_settings";

const DEFAULT_AGENT: ProviderConfig = {
  provider: "ollama",
  model: "exaone3.5:7.8b",
  apiKey: "",
};

export const DEFAULT_SETTINGS: AppSettings = {
  agents: {
    jd_analyzer: { ...DEFAULT_AGENT },
    essay_writer: { ...DEFAULT_AGENT },
    compressor: { ...DEFAULT_AGENT },
    evaluator: { ...DEFAULT_AGENT },
  },
  providerKeys: {},
};

export function loadSettings(): AppSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return structuredClone(DEFAULT_SETTINGS);
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    const agents = { ...DEFAULT_SETTINGS.agents, ...(parsed.agents ?? {}) };

    // 마이그레이션: 기존 에이전트별 apiKey → providerKeys로 흡수
    const providerKeys: Partial<Record<Provider, string>> = { ...(parsed.providerKeys ?? {}) };
    for (const cfg of Object.values(agents)) {
      if (cfg.apiKey && cfg.provider !== "ollama" && !providerKeys[cfg.provider]) {
        providerKeys[cfg.provider] = cfg.apiKey;
      }
    }
    return { agents, providerKeys };
  } catch {
    return structuredClone(DEFAULT_SETTINGS);
  }
}

export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

/** AppSettings → API agent_config 포맷. 키는 providerKeys에서 프로바이더별로 주입. */
export function buildAgentConfig(
  settings: AppSettings,
): Record<AgentKey, { provider: string; model: string; api_key: string }> {
  const result = {} as Record<AgentKey, { provider: string; model: string; api_key: string }>;
  for (const [key, cfg] of Object.entries(settings.agents)) {
    result[key as AgentKey] = {
      provider: cfg.provider,
      model: cfg.model,
      api_key: settings.providerKeys[cfg.provider] ?? "",
    };
  }
  return result;
}
