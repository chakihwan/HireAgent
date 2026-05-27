"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Save, Download, Trash2, Loader2, CheckCircle2, RefreshCw, Cpu, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  getOllamaModels, pullOllamaModel, deleteOllamaModel,
  type OllamaModel,
} from "@/lib/api";
import { loadSettings, saveSettings, DEFAULT_SETTINGS } from "@/lib/settings-store";
import type { AgentKey, AppSettings, ProviderConfig } from "@/lib/types";
import { AGENT_LABELS, PROVIDER_DEFAULT_MODELS } from "@/lib/types";

// ─── 상수 ────────────────────────────────────────────────────────────────────

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

interface RecommendedModel {
  name: string;
  size: string;
  desc: string;
  bestFor?: string;
}

// 한국어 자소서 작성에 적합한 후보들 (RTX 5060 기준)
const RECOMMENDED_OLLAMA: RecommendedModel[] = [
  { name: "exaone3.5:7.8b", size: "~5 GB", desc: "LG AI · 한국어 특화", bestFor: "작성·평가" },
  { name: "exaone3.5:2.4b", size: "~1.5 GB", desc: "LG AI · 한국어 경량", bestFor: "압축" },
  { name: "qwen2.5:7b", size: "~4.7 GB", desc: "Alibaba · 한국어 양호", bestFor: "작성" },
  { name: "qwen2.5:3b", size: "~2 GB", desc: "Alibaba · 한국어 경량", bestFor: "압축" },
  { name: "gemma2:9b", size: "~5.4 GB", desc: "Google · 한국어 가능", bestFor: "작성" },
  { name: "gemma2:2b", size: "~1.6 GB", desc: "Google · 경량 베이스라인" },
  { name: "llama3.2:3b", size: "~2 GB", desc: "Meta · 한국어 약함" },
];

function modelOptions(provider: string): string[] {
  if (provider === "anthropic") return ANTHROPIC_MODELS;
  if (provider === "openai") return OPENAI_MODELS;
  if (provider === "google") return GOOGLE_MODELS;
  return [];
}

function formatSize(bytes: number): string {
  const gb = bytes / 1024 / 1024 / 1024;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  const mb = bytes / 1024 / 1024;
  return `${mb.toFixed(0)} MB`;
}

const AGENT_KEYS = Object.keys(AGENT_LABELS) as AgentKey[];

// ─── 메인 페이지 ─────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [saved, setSaved] = useState(false);
  const [activeAgent, setActiveAgent] = useState<AgentKey>("essay_writer");

  // Ollama 모델 상태
  const [ollamaModels, setOllamaModels] = useState<OllamaModel[] | null>(null);
  const [ollamaError, setOllamaError] = useState<string | null>(null);

  useEffect(() => { setSettings(loadSettings()); }, []);

  const fetchOllamaModels = useCallback(async () => {
    setOllamaError(null);
    try {
      const r = await getOllamaModels();
      setOllamaModels(r.models);
    } catch (e) {
      setOllamaError(e instanceof Error ? e.message : String(e));
      setOllamaModels([]);
    }
  }, []);

  useEffect(() => { fetchOllamaModels(); }, [fetchOllamaModels]);

  function updateAgentField<K extends keyof ProviderConfig>(
    agent: AgentKey, field: K, value: ProviderConfig[K],
  ) {
    setSettings((prev) => ({
      ...prev,
      agents: { ...prev.agents, [agent]: { ...prev.agents[agent], [field]: value } },
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

  function applyToAll(source: AgentKey) {
    const cfg = settings.agents[source];
    setSettings((prev) => ({
      ...prev,
      agents: Object.fromEntries(AGENT_KEYS.map((k) => [k, { ...cfg }])) as AppSettings["agents"],
    }));
  }

  const current = settings.agents[activeAgent];
  const installedNames = new Set((ollamaModels ?? []).map(m => m.name));

  return (
    <div className="mx-auto max-w-3xl px-6 py-10 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">LLM 설정</h1>
        <p className="text-sm text-zinc-500 mt-1">
          에이전트별로 사용할 LLM 프로바이더와 모델을 설정합니다. 설정은 브라우저에 저장됩니다.
        </p>
      </div>

      {/* 에이전트 탭 */}
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

      {/* 에이전트 설정 패널 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-zinc-700">
            {AGENT_LABELS[activeAgent]} 에이전트
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 프로바이더 */}
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
                  <SelectItem key={p} value={p}>{PROVIDER_LABELS[p]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 모델 — Ollama는 설치된 목록 드롭다운 */}
          <div className="space-y-1.5">
            <Label className="text-xs text-zinc-500">모델</Label>
            {current.provider === "ollama" ? (
              <OllamaModelSelect
                value={current.model}
                models={ollamaModels}
                onChange={(v) => updateAgentField(activeAgent, "model", v)}
                onRefresh={fetchOllamaModels}
                error={ollamaError}
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
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* API 키 */}
          {current.provider !== "ollama" && (
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-500">API 키</Label>
              <Input
                type="password"
                value={current.apiKey}
                onChange={(e) => updateAgentField(activeAgent, "apiKey", e.target.value)}
                placeholder={
                  current.provider === "anthropic" ? "sk-ant-..."
                    : current.provider === "openai" ? "sk-..."
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
              Ollama는 로컬 컨테이너에서 실행됩니다. API 키가 필요 없습니다.
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

      {/* Ollama 모델 관리 */}
      <OllamaModelManager
        models={ollamaModels}
        installedNames={installedNames}
        onRefresh={fetchOllamaModels}
        error={ollamaError}
      />

      {/* 현재 설정 요약 */}
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

// ─── 모델 선택 드롭다운 (Ollama) ────────────────────────────────────────────

function OllamaModelSelect({
  value, models, onChange, onRefresh, error,
}: {
  value: string;
  models: OllamaModel[] | null;
  onChange: (v: string) => void;
  onRefresh: () => void;
  error: string | null;
}) {
  if (error) {
    return (
      <div className="text-xs text-red-500 flex items-center gap-2">
        Ollama 연결 실패: {error}
        <button onClick={onRefresh} className="underline">재시도</button>
      </div>
    );
  }

  if (models === null) {
    return (
      <div className="flex items-center gap-2 text-xs text-zinc-400 h-9">
        <Loader2 className="size-3.5 animate-spin" /> 모델 목록 로드 중...
      </div>
    );
  }

  if (models.length === 0) {
    return (
      <div className="text-xs text-zinc-500">
        설치된 Ollama 모델이 없습니다. 아래 "Ollama 모델 관리"에서 다운로드하세요.
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Select value={value} onValueChange={(v) => v && onChange(v)}>
        <SelectTrigger className="w-72">
          <SelectValue placeholder="모델을 선택하세요" />
        </SelectTrigger>
        <SelectContent>
          {models.map((m) => (
            <SelectItem key={m.name} value={m.name}>
              <span className="font-mono text-xs">{m.name}</span>
              <span className="text-zinc-400 text-xs ml-2">— {m.parameter_size} · {formatSize(m.size)}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <button onClick={onRefresh} className="text-zinc-400 hover:text-zinc-700 p-1">
        <RefreshCw className="size-3.5" />
      </button>
    </div>
  );
}

// ─── Ollama 모델 관리 카드 ──────────────────────────────────────────────────

function OllamaModelManager({
  models, installedNames, onRefresh, error,
}: {
  models: OllamaModel[] | null;
  installedNames: Set<string>;
  onRefresh: () => void;
  error: string | null;
}) {
  const [pulling, setPulling] = useState<Map<string, { percent: number; status: string; cancel: () => void }>>(new Map());
  const [pullError, setPullError] = useState<string | null>(null);

  function handlePull(modelName: string) {
    setPullError(null);
    const cancel = pullOllamaModel(
      modelName,
      (p) => {
        setPulling((prev) => {
          const next = new Map(prev);
          const cur = next.get(modelName);
          if (cur) next.set(modelName, { ...cur, percent: p.percent, status: p.status });
          return next;
        });
      },
      (ok, err) => {
        setPulling((prev) => {
          const next = new Map(prev);
          next.delete(modelName);
          return next;
        });
        if (!ok) setPullError(`${modelName}: ${err}`);
        onRefresh();
      },
    );
    setPulling((prev) => new Map(prev).set(modelName, { percent: 0, status: "starting", cancel }));
  }

  function handleCancel(modelName: string) {
    const entry = pulling.get(modelName);
    if (entry) entry.cancel();
  }

  async function handleDelete(modelName: string) {
    if (!confirm(`"${modelName}"를 삭제할까요? (디스크에서 완전히 제거됩니다)`)) return;
    try {
      await deleteOllamaModel(modelName);
      onRefresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-zinc-700 flex items-center gap-2">
            <Cpu className="size-4 text-zinc-400" /> Ollama 모델 관리
          </CardTitle>
          <button onClick={onRefresh} className="text-zinc-400 hover:text-zinc-700 p-1">
            <RefreshCw className="size-3.5" />
          </button>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {error && (
          <p className="text-xs text-red-500">Ollama 연결 실패: {error}</p>
        )}

        {/* 설치된 모델 */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">
            설치됨 {models && `(${models.length})`}
          </p>
          {models === null ? (
            <p className="text-xs text-zinc-400 flex items-center gap-1.5">
              <Loader2 className="size-3 animate-spin" /> 로드 중...
            </p>
          ) : models.length === 0 ? (
            <p className="text-xs text-zinc-400">설치된 모델 없음</p>
          ) : (
            <div className="space-y-1">
              {models.map((m) => (
                <div key={m.name} className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-zinc-50 group">
                  <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />
                  <span className="text-sm font-mono text-zinc-700 flex-1 truncate">{m.name}</span>
                  <span className="text-xs text-zinc-400 shrink-0">
                    {m.parameter_size} · {formatSize(m.size)}
                  </span>
                  <button
                    onClick={() => handleDelete(m.name)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded text-zinc-400 hover:text-red-500 hover:bg-red-50"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 다운로드 중 */}
        {pulling.size > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">
              다운로드 중
            </p>
            {Array.from(pulling.entries()).map(([name, info]) => (
              <div key={name} className="px-3 py-2 rounded-md bg-blue-50/60 border border-blue-100 space-y-1.5">
                <div className="flex items-center gap-2">
                  <Loader2 className="size-3.5 text-blue-500 animate-spin shrink-0" />
                  <span className="text-sm font-mono text-zinc-700 flex-1 truncate">{name}</span>
                  <span className="text-xs text-zinc-500 shrink-0">
                    {info.status} · {info.percent.toFixed(0)}%
                  </span>
                  <button
                    onClick={() => handleCancel(name)}
                    className="p-0.5 rounded text-zinc-400 hover:text-red-500"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
                <Progress value={info.percent} className="h-1.5" />
              </div>
            ))}
          </div>
        )}

        {pullError && (
          <p className="text-xs text-red-500">{pullError}</p>
        )}

        {/* 추천 모델 */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">
            추천 모델 (한국어 자소서 작성)
          </p>
          <div className="space-y-1">
            {RECOMMENDED_OLLAMA.map((m) => {
              const installed = installedNames.has(m.name);
              const isPulling = pulling.has(m.name);
              return (
                <div
                  key={m.name}
                  className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-zinc-50"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-mono text-zinc-700 truncate">{m.name}</span>
                      <span className="text-xs text-zinc-400">{m.size}</span>
                      {m.bestFor && (
                        <Badge variant="outline" className="text-xs">{m.bestFor} 권장</Badge>
                      )}
                    </div>
                    <p className="text-xs text-zinc-500 mt-0.5">{m.desc}</p>
                  </div>
                  {installed ? (
                    <span className="text-xs text-emerald-600 flex items-center gap-1 shrink-0">
                      <CheckCircle2 className="size-3.5" /> 설치됨
                    </span>
                  ) : isPulling ? (
                    <span className="text-xs text-blue-500 shrink-0">다운로드 중...</span>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handlePull(m.name)}
                      className="text-xs h-7 shrink-0"
                    >
                      <Download className="size-3 mr-1" />
                      다운로드
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed mt-2">
            💡 RTX 5060 (8GB VRAM) 기준 — 7B 모델까지 GPU에 잘 올라갑니다.
            글자수 정확도가 중요한 작업(작성·압축)은 더 큰 모델이 유리합니다.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
