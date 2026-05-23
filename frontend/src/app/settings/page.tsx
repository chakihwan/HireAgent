"use client";

import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { loadSettings, saveSettings, DEFAULT_SETTINGS } from "@/lib/settings-store";
import type { AgentKey, AppSettings, ProviderConfig } from "@/lib/types";
import { AGENT_LABELS, PROVIDER_DEFAULT_MODELS } from "@/lib/types";

const PROVIDERS = ["ollama", "anthropic", "openai", "google"] as const;
const PROVIDER_LABELS: Record<string, string> = {
  ollama: "Ollama (로컬)",
  anthropic: "Anthropic (Claude)",
  openai: "OpenAI (GPT)",
  google: "Google (Gemini)",
};

const ANTHROPIC_MODELS = [
  "claude-haiku-4-5-20251001",
  "claude-sonnet-4-6",
  "claude-opus-4-7",
];
const OPENAI_MODELS = ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini"];
const GOOGLE_MODELS = ["gemini-2.0-flash", "gemini-2.5-pro", "gemini-2.5-flash"];

function modelOptions(provider: string): string[] {
  if (provider === "anthropic") return ANTHROPIC_MODELS;
  if (provider === "openai") return OPENAI_MODELS;
  if (provider === "google") return GOOGLE_MODELS;
  return [];
}

const AGENT_KEYS = Object.keys(AGENT_LABELS) as AgentKey[];

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);
  const [activeAgent, setActiveAgent] = useState<AgentKey>("essay_writer");

  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  function updateAgentField<K extends keyof ProviderConfig>(
    agent: AgentKey,
    field: K,
    value: ProviderConfig[K],
  ) {
    setSettings((prev) => ({
      ...prev,
      agents: {
        ...prev.agents,
        [agent]: { ...prev.agents[agent], [field]: value },
      },
    }));
  }

  function handleProviderChange(agent: AgentKey, provider: string) {
    setSettings((prev) => ({
      ...prev,
      agents: {
        ...prev.agents,
        [agent]: {
          provider: provider as ProviderConfig["provider"],
          model: PROVIDER_DEFAULT_MODELS[provider] ?? "",
          apiKey: prev.agents[agent].apiKey,
        },
      },
    }));
  }

  function handleSave() {
    saveSettings(settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  /** Copy settings from one agent to all others */
  function applyToAll(source: AgentKey) {
    const cfg = settings.agents[source];
    setSettings((prev) => ({
      ...prev,
      agents: Object.fromEntries(
        AGENT_KEYS.map((k) => [k, { ...cfg }]),
      ) as AppSettings["agents"],
    }));
  }

  const current = settings.agents[activeAgent];

  return (
    <div className="mx-auto max-w-2xl px-6 py-10 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">LLM 설정</h1>
        <p className="text-sm text-zinc-500 mt-1">
          에이전트별로 사용할 LLM 프로바이더와 모델을 설정합니다. 설정은 브라우저에 저장됩니다.
        </p>
      </div>

      {/* Agent tabs */}
      <div className="flex gap-1 bg-zinc-100 rounded-lg p-1">
        {AGENT_KEYS.map((key) => (
          <button
            key={key}
            onClick={() => setActiveAgent(key)}
            className={`flex-1 text-xs py-1.5 rounded-md font-medium transition-colors ${
              activeAgent === key
                ? "bg-white text-zinc-900 shadow-sm"
                : "text-zinc-500 hover:text-zinc-700"
            }`}
          >
            {AGENT_LABELS[key]}
          </button>
        ))}
      </div>

      {/* Agent config panel */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-zinc-700">
            {AGENT_LABELS[activeAgent]} 에이전트
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Provider */}
          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-500">프로바이더</Label>
            <Select
              value={current.provider}
              onValueChange={(v) => v && handleProviderChange(activeAgent, v)}
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROVIDERS.map((p) => (
                  <SelectItem key={p} value={p}>
                    {PROVIDER_LABELS[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Model */}
          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-500">모델</Label>
            {current.provider === "ollama" ? (
              <Input
                value={current.model}
                onChange={(e) => updateAgentField(activeAgent, "model", e.target.value)}
                placeholder="예: exaone3.5:7.8b"
                className="w-64 text-sm"
              />
            ) : (
              <Select
                value={current.model}
                onValueChange={(v) => v && updateAgentField(activeAgent, "model", v)}
              >
                <SelectTrigger className="w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {modelOptions(current.provider).map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* API Key (non-Ollama) */}
          {current.provider !== "ollama" && (
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-500">API 키</Label>
              <Input
                type="password"
                value={current.apiKey}
                onChange={(e) => updateAgentField(activeAgent, "apiKey", e.target.value)}
                placeholder={
                  current.provider === "anthropic"
                    ? "sk-ant-..."
                    : current.provider === "openai"
                      ? "sk-..."
                      : "AIza..."
                }
                className="w-full text-sm"
              />
              <p className="text-xs text-zinc-400">
                키는 브라우저 localStorage에만 저장되며 서버로 전송되지 않습니다.
              </p>
            </div>
          )}

          {current.provider === "ollama" && (
            <p className="text-xs text-zinc-400">
              Ollama는 로컬 컨테이너를 자동으로 사용합니다. API 키가 필요 없습니다.
            </p>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => applyToAll(activeAgent)}
            className="text-xs"
          >
            이 설정을 모든 에이전트에 적용
          </Button>
        </CardContent>
      </Card>

      {/* Current summary */}
      <Card className="bg-zinc-50 border-zinc-200">
        <CardHeader>
          <CardTitle className="text-xs font-medium text-zinc-500 uppercase tracking-wide">
            현재 설정 요약
          </CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-zinc-100">
              {AGENT_KEYS.map((key) => {
                const cfg = settings.agents[key];
                return (
                  <tr key={key} className="py-1">
                    <td className="py-1.5 text-zinc-500 w-28">{AGENT_LABELS[key]}</td>
                    <td className="py-1.5 font-medium text-zinc-800">{cfg.provider}</td>
                    <td className="py-1.5 text-zinc-600 font-mono text-xs">{cfg.model}</td>
                    <td className="py-1.5 text-zinc-400 text-xs">
                      {cfg.provider !== "ollama" && cfg.apiKey ? "키 설정됨" : ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Button onClick={handleSave} className="w-full sm:w-auto">
        <Save className="mr-2 size-4" />
        {saved ? "저장됨!" : "설정 저장"}
      </Button>
    </div>
  );
}
