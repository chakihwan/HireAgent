import type { AgentKey, AppSettings, ProviderConfig } from "./types";

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
};

export function loadSettings(): AppSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return structuredClone(DEFAULT_SETTINGS);
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      agents: {
        ...DEFAULT_SETTINGS.agents,
        ...(parsed.agents ?? {}),
      },
    };
  } catch {
    return structuredClone(DEFAULT_SETTINGS);
  }
}

export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

/** Convert AppSettings agents to the agent_config format expected by the API. */
export function buildAgentConfig(
  settings: AppSettings,
): Record<AgentKey, { provider: string; model: string; api_key: string }> {
  const result = {} as Record<AgentKey, { provider: string; model: string; api_key: string }>;
  for (const [key, cfg] of Object.entries(settings.agents)) {
    result[key as AgentKey] = {
      provider: cfg.provider,
      model: cfg.model,
      api_key: cfg.apiKey,
    };
  }
  return result;
}
