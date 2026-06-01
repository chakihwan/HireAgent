"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Trash2, Loader2, CheckCircle2, RefreshCw, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { getOllamaModels, pullOllamaModel, deleteOllamaModel, type OllamaModel, type GpuInfo } from "@/lib/api";
import { loadSettings, saveSettings } from "@/lib/settings-store";
import type { Provider } from "@/lib/types";

// ── 추천 모델 목록 ────────────────────────────────────────────────

type RecommendedModel = {
  name: string;
  size: string;
  desc: string;
  tags: string[];
};

const RECOMMENDED: RecommendedModel[] = [
  { name: "exaone3.5:7.8b",  size: "~5 GB",   desc: "LG AI · 한국어 SOTA · 자소서 작성·평가 최적",           tags: ["한국어 최강", "JD분석", "작성", "평가"] },
  { name: "exaone3.5:2.4b",  size: "~1.5 GB", desc: "LG AI · 한국어 경량 · 압축/조정에 빠름",               tags: ["한국어", "경량", "압축"] },
  { name: "qwen2.5:7b",      size: "~4.7 GB", desc: "Alibaba · 한국어 양호 · exaone 대안",                  tags: ["한국어", "작성"] },
  { name: "qwen2.5:3b",      size: "~2 GB",   desc: "Alibaba · 경량 · 압축 전용으로 사용 가능",             tags: ["경량", "압축"] },
  { name: "gemma2:9b",       size: "~5.4 GB", desc: "Google · 한국어 가능 · 영문 공고 분석에 강함",          tags: ["JD분석", "작성"] },
  { name: "gemma2:2b",       size: "~1.6 GB", desc: "Google · 초경량 베이스라인 · RAM 부족 시",              tags: ["경량"] },
  { name: "gemma4:e2b",      size: "~2 GB",   desc: "Google · 경량 멀티모달 · 한국어 개선",                  tags: ["경량", "최신"] },
  { name: "gemma4:e4b",      size: "~3.3 GB", desc: "Google · Gemma 최신 · 균형잡힌 성능",                  tags: ["최신", "작성"] },
  { name: "llama3.1:8b",     size: "~4.7 GB", desc: "Meta · 범용 · 한국어 약함 (영문 공고 전용)",            tags: ["범용"] },
  { name: "deepseek-r1:8b",  size: "~4.9 GB", desc: "DeepSeek · 추론 특화 · 평가 에이전트에 적합",           tags: ["추론", "평가"] },
];

function formatSize(bytes: number): string {
  const gb = bytes / 1024 / 1024 / 1024;
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(bytes / 1024 / 1024).toFixed(0)} MB`;
}

// ── 메인 ─────────────────────────────────────────────────────────

export default function ModelsPage() {
  const [installed, setInstalled] = useState<OllamaModel[] | null>(null);
  const [gpu, setGpu] = useState<GpuInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pulling, setPulling] = useState<Map<string, { percent: number; status: string; cancel: () => void }>>(new Map());
  const [pullError, setPullError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const r = await getOllamaModels();
      setInstalled(r.models);
      setGpu(r.gpu);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setInstalled([]);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const installedNames = new Set((installed ?? []).map((m) => m.name));

  function handlePull(name: string) {
    setPullError(null);
    const cancel = pullOllamaModel(
      name,
      (p) => setPulling((prev) => { const n = new Map(prev); const c = n.get(name); if (c) n.set(name, { ...c, percent: p.percent, status: p.status }); return n; }),
      (ok, err) => { setPulling((prev) => { const n = new Map(prev); n.delete(name); return n; }); if (!ok) setPullError(`${name}: ${err}`); refresh(); },
    );
    setPulling((prev) => new Map(prev).set(name, { percent: 0, status: "시작 중...", cancel }));
  }

  async function handleDelete(name: string) {
    if (!confirm(`"${name}"를 삭제할까요? 디스크에서 완전히 제거됩니다.`)) return;
    try { await deleteOllamaModel(name); refresh(); }
    catch (e) { alert(e instanceof Error ? e.message : String(e)); }
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-10 space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">🤖 LLM 모델 관리</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Ollama 로컬 모델을 다운로드·삭제합니다. 클라우드 모델(Claude·GPT·Gemini)은 설정 페이지에서 API 키를 등록하세요.
        </p>
      </div>

      {/* GPU 정보 배너 */}
      {gpu ? (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 flex items-center gap-3 text-sm">
          <span className="text-lg">🎮</span>
          <div className="flex-1">
            <span className="font-semibold text-zinc-800">{gpu.name}</span>
            <span className="text-zinc-500 ml-2">VRAM {gpu.total_gb}GB (가용 {gpu.free_gb}GB)</span>
          </div>
          <span className="text-xs text-zinc-400">모델 크기가 VRAM을 넘으면 경고가 표시됩니다</span>
        </div>
      ) : (
        <div className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-400">
          GPU를 감지하지 못했습니다 (NVIDIA GPU 없음 또는 CPU 환경) — VRAM 경고가 비활성화됩니다.
        </div>
      )}

      {/* 설치된 모델 */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-zinc-700">
            설치된 모델 {installed !== null && <span className="text-zinc-400 font-normal">({installed.length}개)</span>}
          </h2>
          <button onClick={refresh} className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-800 transition-colors">
            <RefreshCw className="size-3.5" /> 새로고침
          </button>
        </div>

        {error && <p className="text-xs text-red-500 mb-2">Ollama 연결 실패: {error}</p>}

        {installed === null ? (
          <div className="flex items-center gap-2 text-sm text-zinc-400 py-6 justify-center">
            <Loader2 className="size-4 animate-spin" /> 로드 중...
          </div>
        ) : installed.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 py-8 text-center text-sm text-zinc-400">
            설치된 모델이 없습니다. 아래에서 다운로드하세요.
          </div>
        ) : (
          <div className="rounded-xl border border-zinc-200 divide-y divide-zinc-100 overflow-hidden">
            {installed.map((m) => {
              const isPulling = pulling.has(m.name);
              const fitBadge =
                m.fit === "over" ? { color: "#b91c1c", bg: "#fef2f2", label: "VRAM 초과" }
                : m.fit === "tight" ? { color: "#d97706", bg: "#fffbeb", label: "VRAM 빠듯" }
                : null;
              return (
                <div key={m.name} className="px-4 py-3 hover:bg-zinc-50 group">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
                    <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-mono text-zinc-800">{m.name}</span>
                      <span className="text-xs text-zinc-400">{m.parameter_size} · {formatSize(m.size)}</span>
                      {fitBadge && (
                        <span className="text-xs font-semibold rounded px-1.5 py-0.5" style={{ color: fitBadge.color, background: fitBadge.bg }}>
                          ⚠️ {fitBadge.label}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => handleDelete(m.name)}
                      disabled={isPulling}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-zinc-400 hover:text-red-500 p-1.5 rounded-md hover:bg-red-50"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                  {m.fit_message && (
                    <p className="text-xs mt-1.5 ml-7" style={{ color: fitBadge?.color ?? "#a1a1aa" }}>{m.fit_message}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* 다운로드 중 */}
        {pulling.size > 0 && (
          <div className="mt-3 space-y-2">
            {Array.from(pulling.entries()).map(([name, info]) => (
              <div key={name} className="rounded-xl border border-blue-200 bg-blue-50/60 px-4 py-3 space-y-2">
                <div className="flex items-center gap-3">
                  <Loader2 className="size-4 text-blue-500 animate-spin shrink-0" />
                  <span className="text-sm font-mono text-zinc-700 flex-1 truncate">{name}</span>
                  <span className="text-xs text-zinc-500">{info.status} · {info.percent.toFixed(0)}%</span>
                  <button onClick={() => info.cancel()} className="text-zinc-400 hover:text-red-500 p-1">
                    <X className="size-3.5" />
                  </button>
                </div>
                <Progress value={info.percent} className="h-1.5" />
              </div>
            ))}
          </div>
        )}

        {pullError && <p className="text-xs text-red-500 mt-2">{pullError}</p>}
      </section>

      {/* 추천 모델 */}
      <section>
        <h2 className="text-sm font-semibold text-zinc-700 mb-1">추천 모델</h2>
        <p className="text-xs text-zinc-400 mb-4">한국어 자소서 작성 기준 · RTX 5060 (8GB VRAM) — 7B까지 GPU 전체 탑재 가능</p>

        <div className="grid gap-2">
          {/* 미설치 모델을 위로 정렬 (다운로드 유도), 설치됨은 아래로 */}
          {[...RECOMMENDED]
            .sort((a, b) => Number(installedNames.has(a.name)) - Number(installedNames.has(b.name)))
            .map((m) => {
            const installed_ = installedNames.has(m.name);
            const isPulling = pulling.has(m.name);
            const pullInfo = pulling.get(m.name);
            return (
              <div key={m.name} className={`rounded-xl border px-4 py-3 flex items-center gap-4 ${installed_ ? "border-emerald-200 bg-emerald-50/30" : "border-zinc-200 bg-white hover:bg-zinc-50"}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-mono font-semibold text-zinc-800">{m.name}</span>
                    <span className="text-xs text-zinc-400">{m.size}</span>
                    {m.tags.map((t) => (
                      <Badge key={t} variant="secondary" className="text-xs h-5">{t}</Badge>
                    ))}
                  </div>
                  <p className="text-xs text-zinc-500 mt-0.5">{m.desc}</p>
                  {isPulling && pullInfo && (
                    <div className="mt-1.5">
                      <Progress value={pullInfo.percent} className="h-1" />
                    </div>
                  )}
                </div>
                <div className="shrink-0">
                  {installed_ ? (
                    <span className="text-xs text-emerald-600 flex items-center gap-1">
                      <CheckCircle2 className="size-3.5" /> 설치됨
                    </span>
                  ) : isPulling ? (
                    <button onClick={() => pullInfo?.cancel()} className="text-xs text-zinc-500 hover:text-red-500 flex items-center gap-1">
                      <X className="size-3.5" /> 취소
                    </button>
                  ) : (
                    <button
                      onClick={() => handlePull(m.name)}
                      className="flex items-center gap-1.5 text-xs bg-zinc-900 text-white px-3 py-1.5 rounded-lg hover:bg-zinc-700 transition-colors"
                    >
                      <Download className="size-3.5" />
                      다운로드
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-xs text-zinc-400 mt-4 leading-relaxed">
          💡 <strong>작성·평가</strong>는 exaone3.5:7.8b 권장. <strong>압축·조정</strong>은 경량 모델(2~3B)도 충분합니다.
          VRAM 부족 시 더 작은 모델을 쓰거나 Anthropic/OpenAI 클라우드 API를 사용하세요.
        </p>
      </section>

      {/* 클라우드 API 키 */}
      <CloudKeysSection />
    </div>
  );
}

// ── 클라우드 프로바이더 API 키 ────────────────────────────────────

const CLOUD_PROVIDERS: { id: Provider; label: string; placeholder: string; help: string }[] = [
  { id: "anthropic", label: "Anthropic (Claude)", placeholder: "sk-ant-...", help: "console.anthropic.com" },
  { id: "openai", label: "OpenAI (GPT)", placeholder: "sk-...", help: "platform.openai.com" },
  { id: "google", label: "Google (Gemini)", placeholder: "AIza...", help: "aistudio.google.com" },
];

function CloudKeysSection() {
  const [keys, setKeysState] = useState<Partial<Record<Provider, string>>>({});  // 편집 중
  const [savedKeys, setSavedKeys] = useState<Partial<Record<Provider, string>>>({});  // 저장된 값
  const [justSaved, setJustSaved] = useState<Provider | null>(null);

  useEffect(() => {
    const pk = loadSettings().providerKeys;
    setKeysState(pk);
    setSavedKeys(pk);
  }, []);

  function handleSave(provider: Provider) {
    const value = keys[provider] ?? "";
    const next = { ...savedKeys, [provider]: value };
    saveSettings({ ...loadSettings(), providerKeys: next });
    setSavedKeys(next);
    setJustSaved(provider);
    setTimeout(() => setJustSaved((p) => (p === provider ? null : p)), 1500);
  }

  return (
    <section>
      <h2 className="text-sm font-semibold text-zinc-700 mb-1">클라우드 API 키</h2>
      <p className="text-xs text-zinc-400 mb-4">
        프로바이더당 한 번만 입력하면 모든 에이전트가 공유합니다. 키는 브라우저 localStorage에만 저장되며 서버로 전송되지 않습니다.
      </p>
      <div className="grid gap-2">
        {CLOUD_PROVIDERS.map((p) => {
          const current = keys[p.id] ?? "";
          const isDirty = current !== (savedKeys[p.id] ?? "");
          const hasSaved = !!savedKeys[p.id];
          return (
            <div key={p.id} className="rounded-xl border border-zinc-200 px-4 py-3">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="text-sm font-medium text-zinc-800">{p.label}</span>
                <span className="text-xs text-zinc-400">{p.help}</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="password"
                  value={current}
                  onChange={(e) => setKeysState((prev) => ({ ...prev, [p.id]: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === "Enter" && isDirty) handleSave(p.id); }}
                  placeholder={p.placeholder}
                  className="flex-1 text-sm border border-zinc-200 rounded-md px-2 py-1.5 outline-none focus:border-zinc-400 font-mono"
                />
                <button
                  onClick={() => handleSave(p.id)}
                  disabled={!isDirty}
                  className="text-xs font-medium px-3 py-1.5 rounded-md transition-colors shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ background: isDirty ? "#18181b" : "#e4e4e7", color: isDirty ? "#fff" : "#a1a1aa" }}
                >
                  {justSaved === p.id ? "✓ 저장됨" : "저장"}
                </button>
              </div>
              {hasSaved && !isDirty && justSaved !== p.id && (
                <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
                  <CheckCircle2 className="size-3" /> 키 설정됨
                </p>
              )}
            </div>
          );
        })}
      </div>
      <p className="text-xs text-zinc-400 mt-3">
        모델 선택은 <strong>자소서 생성</strong> 화면의 각 노드에서 합니다. 여기서는 키만 등록하세요.
      </p>
    </section>
  );
}
