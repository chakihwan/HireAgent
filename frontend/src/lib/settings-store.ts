import { create } from "zustand";
import { persist } from "zustand/middleware";
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

// ── Zustand store (클라이언트 상태, localStorage persist) ──────────

type SettingsStore = {
  settings: AppSettings;
  setAgent: (key: AgentKey, patch: Partial<ProviderConfig>) => void;
  setProviderKey: (provider: Provider, value: string) => void;
  replaceSettings: (settings: AppSettings) => void;
};

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      settings: structuredClone(DEFAULT_SETTINGS),
      setAgent: (key, patch) =>
        set((s) => ({
          settings: {
            ...s.settings,
            agents: { ...s.settings.agents, [key]: { ...s.settings.agents[key], ...patch } },
          },
        })),
      setProviderKey: (provider, value) =>
        set((s) => ({
          settings: { ...s.settings, providerKeys: { ...s.settings.providerKeys, [provider]: value } },
        })),
      replaceSettings: (settings) => set({ settings }),
    }),
    {
      name: SETTINGS_KEY,
      // SSR mismatch 방지: 서버/첫 클라 렌더는 default, Providers가 mount 후 명시적 rehydrate.
      skipHydration: true,
      merge: (persisted, current) => {
        const p = persisted as { settings?: Partial<AppSettings> } | undefined;
        return { ...current, settings: migrate(p?.settings) };
      },
    },
  ),
);

// ── 마이그레이션 (레거시 평문 + 에이전트별 apiKey → providerKeys) ──

function migrate(parsed: Partial<AppSettings> | undefined): AppSettings {
  if (!parsed) return structuredClone(DEFAULT_SETTINGS);
  const agents = { ...DEFAULT_SETTINGS.agents, ...(parsed.agents ?? {}) };
  const providerKeys: Partial<Record<Provider, string>> = { ...(parsed.providerKeys ?? {}) };
  // 기존 에이전트별 apiKey → providerKeys 흡수 (하위호환)
  for (const cfg of Object.values(agents)) {
    if (cfg.apiKey && cfg.provider !== "ollama" && !providerKeys[cfg.provider]) {
      providerKeys[cfg.provider] = cfg.apiKey;
    }
  }
  return { agents, providerKeys };
}

// ── 함수형 API (비-React 컨텍스트 / 점진적 전환용, store와 동일 localStorage) ──

export function loadSettings(): AppSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  // Zustand persist가 이미 로드했으면 store 값 사용
  const fromStore = useSettingsStore.getState().settings;
  if (fromStore) return fromStore;
  return structuredClone(DEFAULT_SETTINGS);
}

export function saveSettings(settings: AppSettings): void {
  useSettingsStore.getState().replaceSettings(settings);
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
