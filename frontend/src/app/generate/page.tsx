"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Copy, Check, AlertTriangle } from "lucide-react";
import { WorkflowCanvas } from "@/components/features/WorkflowCanvas";
import type { PipelineEvent } from "@/components/features/PipelineView";
import { Button } from "@/components/ui/button";
import { generateEssays, saveToLibrary, fetchJobUrl, FetchUrlError, getOllamaModels } from "@/lib/api";
import { loadSettings, saveSettings } from "@/lib/settings-store";
import type { DraftResult, EssayTone, EssayPersona, ItemConfig, SseDoneEvent, AgentKey, ProviderConfig, AppSettings } from "@/lib/types";

// ── Constants ────────────────────────────────────────────────────────────────

type Step = "jd" | "items" | "generating" | "done";

const PRESET_CATEGORIES: Array<{ name: string; defaultLimit: number }> = [
  { name: "자기소개", defaultLimit: 300 },
  { name: "지원동기", defaultLimit: 500 },
  { name: "성장과정", defaultLimit: 500 },
  { name: "직무경험", defaultLimit: 700 },
  { name: "팀워크", defaultLimit: 400 },
  { name: "가치관", defaultLimit: 300 },
];

const TONES: EssayTone[] = ["공식적", "친근함", "도전적"];
const PERSONAS: EssayPersona[] = ["신입", "경력직", "전환"];

type LogEntry = {
  id: string;
  type: "start" | "progress" | "error";
  message: string;
};

// ── Helper ───────────────────────────────────────────────────────────────────

function scoreColor(score: number | null): string {
  if (score === null) return "text-zinc-400";
  if (score >= 8) return "text-emerald-600";
  if (score >= 6) return "text-amber-600";
  return "text-red-500";
}

// ── Sub-components ────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Button variant="outline" size="sm" onClick={handleCopy} className="shrink-0">
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      <span className="ml-1">{copied ? "복사됨" : "복사"}</span>
    </Button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function GeneratePage() {
  const [step, setStep] = useState<Step>("jd");
  const [jd, setJd] = useState("");
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [spaError, setSpaError] = useState<{ siteName: string | null; message: string } | null>(null);

  // Item selection state (PipelineView 통합)
  const [itemSelections, setItemSelections] = useState<Record<string, { checked: boolean; charLimit: number }>>({});
  const [globalTone, setGlobalTone] = useState<EssayTone>("공식적");
  const [globalPersona, setGlobalPersona] = useState<EssayPersona>("경력직");
  const [customCategory, setCustomCategory] = useState("");
  const [customLimit, setCustomLimit] = useState(500);
  const [useCustom, setUseCustom] = useState(false);

  function handleItemChange(name: string, patch: Partial<{ checked: boolean; charLimit: number }>) {
    setItemSelections((prev) => ({
      ...prev,
      [name]: { ...{ checked: false, charLimit: 500 }, ...prev[name], ...patch },
    }));
  }

  // Agent config (그래프 노드에서 직접 편집)
  const [agentConfigs, setAgentConfigs] = useState<AppSettings["agents"]>(
    () => loadSettings().agents,
  );

  const [ollamaModels, setOllamaModels] = useState<string[]>([]);

  useEffect(() => {
    getOllamaModels()
      .then((r) => {
        const names = r.models.map((m) => m.name);
        setOllamaModels(names);
        // localStorage에 설치 안 된 Ollama 모델이 있으면 첫 번째 설치 모델로 교체
        if (names.length > 0) {
          setAgentConfigs((prev) => {
            let changed = false;
            const next = { ...prev };
            for (const key of Object.keys(next) as AgentKey[]) {
              if (next[key].provider === "ollama" && !names.includes(next[key].model)) {
                next[key] = { ...next[key], model: names[0] };
                changed = true;
              }
            }
            if (changed) saveSettings({ agents: next });
            return changed ? next : prev;
          });
        }
      })
      .catch(() => {/* Ollama 미응답 시 무시 */});
  }, []);

  function handleConfigChange(key: AgentKey, field: keyof ProviderConfig, value: string) {
    setAgentConfigs((prev) => {
      const updated = { ...prev[key], [field]: value };
      // 프로바이더 변경 시 모델도 첫 번째 항목으로 초기화
      if (field === "provider") {
        const firstModel =
          value === "ollama" ? (ollamaModels[0] ?? "exaone3.5:7.8b")
          : value === "anthropic" ? "claude-haiku-4-5-20251001"
          : value === "openai" ? "gpt-4.1-mini"
          : value === "google" ? "gemini-2.0-flash"
          : "";
        updated.model = firstModel;
      }
      const next = { ...prev, [key]: updated };
      saveSettings({ agents: next });
      return next;
    });
  }

  // Generation state
  const [log, setLog] = useState<LogEntry[]>([]);
  const [results, setResults] = useState<DraftResult[]>([]);
  const [genError, setGenError] = useState<string | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const [savedIds, setSavedIds] = useState<Record<string, number>>({});  // category → library id
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [editedContents, setEditedContents] = useState<Record<string, string>>({});
  const [pipelineEvents, setPipelineEvents] = useState<PipelineEvent[]>([]);

  // ── Derived ──────────────────────────────────────────────────────────────

  const PRESET_DEFAULTS: Record<string, number> = Object.fromEntries(
    [
      ["자기소개", 300], ["지원동기", 500], ["성장과정", 500],
      ["직무경험", 700], ["강점/역량", 500], ["입사 후 포부", 500],
    ]
  );

  const selectedItems: ItemConfig[] = [
    ...Object.entries(itemSelections)
      .filter(([, v]) => v.checked)
      .map(([name, v]) => ({
        category: name,
        charLimit: v.charLimit || PRESET_DEFAULTS[name] || 500,
        tone: globalTone,
        persona: globalPersona,
      })),
    ...(useCustom && customCategory.trim()
      ? [{ category: customCategory.trim(), charLimit: customLimit, tone: globalTone, persona: globalPersona }]
      : []),
  ];

  const canGenerate = selectedItems.length > 0 && jd.trim().length >= 50;

  // ── Handlers ─────────────────────────────────────────────────────────────

  function appendLog(type: LogEntry["type"], message: string) {
    setLog((prev) => [...prev, { id: crypto.randomUUID(), type, message }]);
    setTimeout(() => logEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }

  const handleGenerate = useCallback(async () => {
    // Ollama 모델 사전 검증 — 설치 안 된 모델이 있으면 생성 전에 차단
    if (ollamaModels.length > 0) {
      const badAgents = Object.entries(agentConfigs)
        .filter(([, cfg]) => cfg.provider === "ollama" && !ollamaModels.includes(cfg.model))
        .map(([key, cfg]) => `${key} (${cfg.model})`);
      if (badAgents.length > 0) {
        setGenError(
          `설치되지 않은 Ollama 모델이 있습니다:\n${badAgents.join(", ")}\n\n설치된 모델: ${ollamaModels.join(", ")}`,
        );
        return;
      }
    }

    setStep("generating");
    setLog([]);
    setResults([]);
    setGenError(null);
    setEditedContents({});
    setPipelineEvents([{ node: "jd_analyzer", phase: "start" }]);

    // 그래프 노드 설정을 API 포맷으로 변환
    const agentConfig: Record<string, { provider: string; model: string; api_key: string }> = {};
    for (const [key, cfg] of Object.entries(agentConfigs)) {
      agentConfig[key] = { provider: cfg.provider, model: cfg.model, api_key: cfg.apiKey };
    }

    const request = {
      job_description: jd,
      items: selectedItems.map((item) => ({
        category: item.category,
        char_limit: item.charLimit,
        tone: item.tone,
        persona: item.persona,
      })),
      user_id: "local",
      agent_config: agentConfig,
    };

    try {
      await generateEssays(request, (event, data) => {
        if (event === "start") {
          const d = data as { message: string; total_items: number };
          appendLog("start", `${d.message} (${d.total_items}개 항목)`);
        } else if (event === "progress") {
          const d = data as { node: string; message: string };
          appendLog("progress", d.message);
          // JD 분석 완료 메시지 감지 → 그래프 이벤트 주입
          if (d.node === "jd_analyzer" && d.message.includes("공고 분석 완료")) {
            setPipelineEvents((prev) => [...prev, { node: "jd_analyzer", phase: "done" }]);
            setPipelineEvents((prev) => [...prev, { node: "rag", phase: "start" }]);
          }
        } else if (event === "node_event") {
          setPipelineEvents((prev) => [...prev, data as PipelineEvent]);
        } else if (event === "error") {
          const d = data as { message: string };
          appendLog("error", d.message);
        } else if (event === "done") {
          const d = data as SseDoneEvent;
          setResults(d.drafts);
          setStep("done");
        }
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setGenError(msg);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jd, selectedItems]);


  // ── 풀스크린 레이아웃 ────────────────────────────────────────────

  const isGenerating = step === "generating";
  const isDone = step === "done" || results.length > 0;

  return (
    <div className="flex overflow-hidden" style={{ height: "calc(100vh - 56px)" }}>

      {/* ── 왼쪽 사이드바 ── */}
      <aside className="w-80 flex-shrink-0 border-r border-zinc-200 bg-white flex flex-col overflow-hidden">

        {/* 상단 고정 헤더 */}
        <div className="px-4 py-3 border-b border-zinc-100 flex-shrink-0">
          <h1 className="text-sm font-semibold text-zinc-900">자소서 생성</h1>
          <p className="text-xs text-zinc-400 mt-0.5">공고 입력 → 항목 선택 → 생성</p>
        </div>

        {/* 스크롤 가능한 설정 영역 */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">

          {/* 공고 입력 */}
          <section>
            <label className="text-xs font-semibold text-zinc-600 uppercase tracking-wider">채용 공고</label>
            <textarea
              rows={8}
              value={jd}
              onChange={(e) => setJd(e.target.value)}
              disabled={isGenerating}
              placeholder="공고 전문 붙여넣기 (최소 50자)..."
              className="mt-1.5 w-full resize-none rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-mono text-zinc-800 outline-none focus:border-zinc-400 focus:bg-white transition-colors disabled:opacity-50"
              style={{ minHeight: 140 }}
            />
            {/^https?:\/\/\S+$/i.test(jd.trim()) && (
              <button
                onClick={async () => {
                  setFetching(true); setFetchError(null); setSpaError(null);
                  try { const r = await fetchJobUrl(jd.trim()); setJd(r.text); }
                  catch (e) {
                    if (e instanceof FetchUrlError && e.code === "spa_site") setSpaError({ siteName: e.siteName, message: e.message });
                    else setFetchError(e instanceof Error ? e.message : String(e));
                  } finally { setFetching(false); }
                }}
                disabled={fetching}
                className="mt-1.5 w-full py-1.5 rounded-md border border-blue-300 bg-blue-50 text-xs font-medium text-blue-700 hover:bg-blue-100 transition-colors disabled:opacity-50"
              >
                {fetching ? "가져오는 중..." : "URL에서 공고 가져오기"}
              </button>
            )}
            {fetchError && <p className="mt-1 text-xs text-red-500">{fetchError}</p>}
            {spaError && (
              <div className="mt-1 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <p className="font-medium">{spaError.siteName ?? "이 사이트"} 자동 추출 불가</p>
                <p className="mt-0.5">{spaError.message}</p>
                <button onClick={() => setSpaError(null)} className="mt-1 text-amber-600 underline">닫기</button>
              </div>
            )}
          </section>

          {/* 항목 선택 */}
          <section>
            <label className="text-xs font-semibold text-zinc-600 uppercase tracking-wider">항목 선택</label>
            <div className="mt-1.5 flex flex-col gap-1.5">
              {[
                { name: "자기소개", default: 300 },
                { name: "지원동기", default: 500 },
                { name: "성장과정", default: 500 },
                { name: "직무경험", default: 700 },
                { name: "강점/역량", default: 500 },
                { name: "입사 후 포부", default: 500 },
              ].map((preset) => {
                const sel = itemSelections[preset.name];
                const checked = sel?.checked ?? false;
                const limit = sel?.charLimit ?? preset.default;
                return (
                  <div
                    key={preset.name}
                    onClick={() => !isGenerating && handleItemChange(preset.name, { checked: !checked })}
                    className="flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer select-none transition-all"
                    style={{ borderColor: checked ? "#3b82f6" : "#e4e4e7", background: checked ? "#eff6ff" : "#fff" }}
                  >
                    <div className="w-4 h-4 rounded-full border-2 flex items-center justify-center text-xs flex-shrink-0"
                      style={{ borderColor: checked ? "#3b82f6" : "#d4d4d8", background: checked ? "#3b82f6" : "transparent", color: "#fff" }}>
                      {checked && "✓"}
                    </div>
                    <span className="text-xs font-medium flex-1" style={{ color: checked ? "#1d4ed8" : "#3f3f46" }}>{preset.name}</span>
                    {checked ? (
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="number" min={50} max={2000} step={50}
                          value={limit}
                          onChange={(e) => handleItemChange(preset.name, { charLimit: Number(e.target.value) })}
                          className="w-14 text-center text-xs border border-blue-200 rounded px-1 py-0.5 outline-none bg-white"
                          disabled={isGenerating}
                        />
                        <span className="text-xs text-zinc-400">자</span>
                      </div>
                    ) : (
                      <span className="text-xs text-zinc-400">{preset.default}자</span>
                    )}
                  </div>
                );
              })}

              {/* 직접 입력 */}
              <div
                onClick={() => !isGenerating && setUseCustom((p) => !p)}
                className="flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer select-none transition-all"
                style={{ borderColor: useCustom ? "#8b5cf6" : "#e4e4e7", background: useCustom ? "#f5f3ff" : "#fff" }}
              >
                <div className="w-4 h-4 rounded-full border-2 flex items-center justify-center text-xs flex-shrink-0"
                  style={{ borderColor: useCustom ? "#8b5cf6" : "#d4d4d8", background: useCustom ? "#8b5cf6" : "transparent", color: "#fff" }}>
                  {useCustom ? "✓" : "+"}
                </div>
                <span className="text-xs font-medium flex-1" style={{ color: useCustom ? "#6d28d9" : "#3f3f46" }}>직접 입력</span>
              </div>
              {useCustom && (
                <div className="flex gap-1.5 pl-6" onClick={(e) => e.stopPropagation()}>
                  <input type="text" placeholder="항목명" value={customCategory} onChange={(e) => setCustomCategory(e.target.value)}
                    className="flex-1 text-xs border border-violet-200 rounded-md px-2 py-1 outline-none" disabled={isGenerating} />
                  <input type="number" min={50} max={2000} step={50} value={customLimit} onChange={(e) => setCustomLimit(Number(e.target.value))}
                    className="w-16 text-center text-xs border border-violet-200 rounded-md px-1 py-1 outline-none" disabled={isGenerating} />
                  <span className="text-xs text-zinc-400 self-center">자</span>
                </div>
              )}
            </div>
          </section>

          {/* 공통 설정 */}
          <section>
            <label className="text-xs font-semibold text-zinc-600 uppercase tracking-wider">공통 설정</label>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              <div>
                <div className="text-xs text-zinc-400 mb-1">톤</div>
                <select value={globalTone} onChange={(e) => setGlobalTone(e.target.value as EssayTone)} disabled={isGenerating}
                  className="w-full text-xs border border-zinc-200 rounded-md px-2 py-1.5 outline-none bg-white">
                  {(["공식적","친근함","도전적"] as EssayTone[]).map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <div className="text-xs text-zinc-400 mb-1">페르소나</div>
                <select value={globalPersona} onChange={(e) => setGlobalPersona(e.target.value as EssayPersona)} disabled={isGenerating}
                  className="w-full text-xs border border-zinc-200 rounded-md px-2 py-1.5 outline-none bg-white">
                  {(["신입","경력직","전환"] as EssayPersona[]).map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>
          </section>

          {/* 진행 로그 */}
          {log.length > 0 && (
            <section>
              <label className="text-xs font-semibold text-zinc-600 uppercase tracking-wider">진행 로그</label>
              <div className="mt-1.5 space-y-1 max-h-40 overflow-y-auto">
                {log.map((entry) => (
                  <div key={entry.id} className="flex items-start gap-1.5 text-xs">
                    {entry.type === "error"
                      ? <span className="text-red-500 flex-shrink-0">✗</span>
                      : <span className="text-emerald-500 flex-shrink-0">✓</span>}
                    <span className={entry.type === "error" ? "text-red-600" : "text-zinc-500"}>{entry.message}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* 하단 고정 버튼 영역 */}
        <div className="flex-shrink-0 border-t border-zinc-100 px-4 py-3 space-y-2">
          {genError && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2">
              <p className="text-xs font-medium text-red-700">생성 불가</p>
              <p className="text-xs text-red-600 whitespace-pre-line mt-0.5">{genError}</p>
              <button onClick={() => setGenError(null)} className="text-xs text-red-500 underline mt-1">닫기</button>
            </div>
          )}
          <div className="flex gap-2">
            {(isDone || isGenerating) && (
              <button
                onClick={() => { setResults([]); setLog([]); setGenError(null); setPipelineEvents([]); }}
                className="flex-1 py-2 rounded-lg border border-zinc-300 text-xs font-medium text-zinc-600 hover:bg-zinc-50 transition-colors"
                disabled={isGenerating}
              >
                초기화
              </button>
            )}
            <button
              onClick={handleGenerate}
              disabled={!canGenerate || isGenerating}
              className="flex-1 py-2 rounded-lg text-xs font-semibold transition-colors disabled:opacity-40"
              style={{ background: canGenerate && !isGenerating ? "#18181b" : "#e4e4e7", color: canGenerate && !isGenerating ? "#fff" : "#a1a1aa" }}
            >
              {isGenerating ? "생성 중..." : "▶ 자소서 생성"}
            </button>
          </div>
        </div>
      </aside>

      {/* ── 메인 캔버스 영역 ── */}
      <main className="flex-1 flex flex-col overflow-hidden relative">

        {/* 캔버스 상태 배너 */}
        {isGenerating && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 rounded-full bg-white border border-zinc-200 shadow-sm px-4 py-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            <span className="text-xs font-medium text-zinc-700">자소서 생성 중...</span>
          </div>
        )}
        {isDone && !isGenerating && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 rounded-full bg-white border border-emerald-300 shadow-sm px-4 py-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-xs font-medium text-zinc-700">생성 완료 — 아래에서 결과를 확인하세요</span>
          </div>
        )}
        {!isGenerating && !isDone && selectedItems.length === 0 && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 rounded-full bg-white border border-zinc-200 shadow-sm px-4 py-1.5">
            <span className="text-xs text-zinc-400">← 왼쪽에서 항목을 선택하면 파이프라인이 구성됩니다</span>
          </div>
        )}

        {/* React Flow 워크플로우 캔버스 */}
        <div className="flex-1 min-h-0">
          <WorkflowCanvas
            categories={selectedItems.map((i) => i.category)}
            configs={agentConfigs}
            events={pipelineEvents}
            editable={!isGenerating}
            ollamaModels={ollamaModels}
            onConfigChange={handleConfigChange}
          />
        </div>

        {/* 결과 패널 (생성 완료 시 하단에서 슬라이드업) */}
        {results.length > 0 && (
          <div
            className="flex-shrink-0 border-t border-zinc-200 bg-white overflow-y-auto"
            style={{ maxHeight: "45vh" }}
          >
            <div className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-zinc-900">생성 결과</h2>
                <span className="text-xs text-zinc-400">{results.length}개 항목</span>
              </div>
              <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))" }}>
                {results.map((draft) => {
                  const currentContent = editedContents[draft.category] ?? draft.content;
                  const currentCharCount = currentContent.length;
                  const isEdited = draft.category in editedContents;
                  const charOk = Math.abs(currentCharCount - draft.char_target) / draft.char_target < 0.05;
                  return (
                    <div key={draft.category} className="rounded-xl border border-zinc-200 overflow-hidden">
                      <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-zinc-100 bg-zinc-50">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-sm font-semibold text-zinc-800 truncate">{draft.category}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${charOk ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                            {currentCharCount}/{draft.char_target}자
                          </span>
                          {isEdited && <span className="text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full">편집됨</span>}
                          {draft.evaluation_score !== null && (
                            <span className="text-xs font-semibold text-amber-600">★ {draft.evaluation_score?.toFixed(1)}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <CopyButton text={currentContent} />
                          {savedIds[draft.category] ? (
                            <span className="text-xs bg-zinc-100 text-zinc-500 px-2 py-1 rounded-md">저장됨</span>
                          ) : (
                            <button
                              disabled={saving[draft.category]}
                              onClick={async () => {
                                setSaving((p) => ({ ...p, [draft.category]: true }));
                                try {
                                  const item = await saveToLibrary({
                                    category: draft.category, content: currentContent,
                                    char_target: draft.char_target,
                                    generation_metadata: { evaluation_score: draft.evaluation_score, evaluation_feedback: draft.evaluation_feedback, iterations: draft.iteration },
                                  });
                                  setSavedIds((p) => ({ ...p, [draft.category]: item.id }));
                                } catch (e) { alert(e instanceof Error ? e.message : String(e)); }
                                finally { setSaving((p) => ({ ...p, [draft.category]: false })); }
                              }}
                              className="text-xs bg-zinc-900 text-white px-2.5 py-1 rounded-md hover:bg-zinc-700 transition-colors disabled:opacity-50"
                            >
                              {saving[draft.category] ? "..." : "저장"}
                            </button>
                          )}
                        </div>
                      </div>
                      <textarea
                        value={currentContent}
                        onChange={(e) => setEditedContents((prev) => ({ ...prev, [draft.category]: e.target.value }))}
                        rows={6}
                        className="w-full p-4 text-sm text-zinc-700 leading-relaxed resize-y outline-none border-0"
                        style={{ background: "transparent" }}
                      />
                      {draft.evaluation_feedback && (
                        <div className="px-4 pb-3 text-xs text-zinc-400 border-t border-zinc-50 pt-2">{draft.evaluation_feedback}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// ─── SPA 사이트 안내 카드 ────────────────────────────────────────────────────

// 본문 추출 북마클릿. 사람인 같은 iframe 사이트는 iframe 안까지 파고들고,
// 접근 실패하면 iframe URL을 새 탭으로 열어 거기서 다시 실행할 수 있게 함.
// minify된 한 줄: javascript: URL은 줄바꿈/주석 들어가면 깨짐.
const BOOKMARKLET_CODE = `javascript:(function(){const isSaramin=/saramin\\.co\\.kr/.test(location.host);const isJobkorea=/jobkorea\\.co\\.kr/.test(location.host);if(isSaramin||isJobkorea){const iframes=Array.from(document.querySelectorAll('iframe[src]')).filter(f=>f.src&&!f.src.startsWith('about:'));let okIframe=null;for(const f of iframes){try{const d=f.contentDocument||f.contentWindow.document;if(d&&d.body&&d.body.innerText.length>500){okIframe=d;break;}}catch(e){}}if(okIframe){const t=okIframe.body.innerText;navigator.clipboard.writeText(t).then(()=>alert('✅ iframe 본문 '+t.length+'자 복사 완료!\\nHireAgent로 가서 Ctrl+V')).catch(()=>prompt('수동복사:',t.slice(0,5000)));return;}if(iframes.length>0){const choice=confirm('사람인/잡코리아 공고 본문은 iframe에 있는데 직접 접근이 막혀 있습니다.\\n\\nOK = iframe 본문 URL을 새 탭으로 열기 (거기서 다시 북마클릿 클릭)\\n취소 = Ctrl+P (PDF 저장) 방법을 안내');if(choice){window.open(iframes[0].src,'_blank');return;}else{alert('Ctrl+P → \"PDF로 저장\" → 저장한 PDF 열고 본문 드래그·복사 하세요.\\n이 방법이 사람인에 가장 잘 됩니다.');return;}}alert('iframe을 못 찾았습니다. Ctrl+P (PDF 저장) 방법을 사용하세요.');return;}const c=[];const sels=['.user_content','.job_summary','.wrap_jv_cont','.recruit-text','.detailDescription','#tab-1','.cont','article','main'];for(const s of sels){const el=document.querySelector(s);if(el&&el.innerText.length>200)c.push({s:s,t:el.innerText});}document.querySelectorAll('iframe').forEach(f=>{try{const d=f.contentDocument||f.contentWindow.document;if(d&&d.body&&d.body.innerText.length>200)c.push({s:'iframe',t:d.body.innerText});}catch(e){}});c.sort((a,b)=>b.t.length-a.t.length);const t=c.length>0?c[0].t:document.body.innerText;navigator.clipboard.writeText(t).then(()=>alert('✅ '+t.length+'자 복사됨 (출처: '+(c[0]?c[0].s:'body')+')\\nHireAgent로 가서 Ctrl+V')).catch(()=>prompt('수동복사:',t.slice(0,5000)));})();`;

function SpaSiteGuide({
  error, onClose,
}: {
  error: { siteName: string | null; message: string };
  onClose: () => void;
}) {
  const siteName = error.siteName ?? "이 사이트";
  const linkRef = useRef<HTMLAnchorElement>(null);
  const [codeCopied, setCodeCopied] = useState(false);

  // React가 javascript: href를 sanitize하는 것을 우회하기 위해
  // ref로 직접 DOM에 attribute 설정
  if (typeof window !== "undefined" && linkRef.current) {
    linkRef.current.setAttribute("href", BOOKMARKLET_CODE);
  }

  async function copyBookmarkletCode() {
    try {
      await navigator.clipboard.writeText(BOOKMARKLET_CODE);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    } catch {
      // ignore
    }
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-4 space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <AlertTriangle className="size-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-900">{siteName} 자동 추출 불가</p>
            <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">{error.message}</p>
            <p className="text-xs text-amber-700 mt-1">아래 중 가장 편한 방법으로 본문을 가져와서 위 텍스트 영역에 붙여넣어 주세요.</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-amber-700 hover:text-amber-900 text-xs underline shrink-0"
        >
          닫기
        </button>
      </div>

      {/* 사람인 한정 경고 */}
      {siteName === "사람인" && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-900 leading-relaxed">
          <strong>💡 사람인 팁:</strong> 사람인은 공고 본문이 iframe에 보호되어 있어 북마클릿도 한 번에 안 될 수 있어요.
          가장 빠른 방법은 <strong><kbd className="px-1 py-0.5 bg-white rounded text-[10px]">Ctrl+P</kbd> 인쇄 미리보기</strong>입니다 (아래 ②).
          북마클릿을 시도하면 본문 iframe URL을 새 탭으로 여는 옵션이 뜹니다.
        </div>
      )}

      {/* 옵션 1: 북마클릿 (가장 강력, 한 번 설치) */}
      <div className="bg-white border-2 border-emerald-300 rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded">⭐ 다른 사이트엔 가장 빠름</span>
          <span className="text-sm font-semibold text-zinc-800">① 북마클릿 (한 번 설치, 평생 사용)</span>
        </div>

        <div>
          <p className="text-xs text-zinc-700 leading-relaxed mb-2">
            <strong>방법 A — 드래그 (가장 쉬움):</strong>
          </p>
          <div className="flex items-center gap-3 flex-wrap pl-4">
            <a
              ref={linkRef}
              onClick={(e) => {
                e.preventDefault();
                alert("이 버튼은 클릭이 아니라 북마크 바에 끌어다 놓으세요!\n\n북마크 바가 안 보이면 Ctrl+Shift+B로 표시하세요.");
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded-md cursor-grab active:cursor-grabbing select-none"
              draggable
            >
              📋 공고 본문 추출
            </a>
            <span className="text-xs text-zinc-500">← 이 버튼을 마우스로 끌어서 북마크 바에 놓기</span>
          </div>
          <p className="text-xs text-zinc-400 mt-1.5 pl-4">
            북마크 바가 안 보이면 <kbd className="px-1 py-0.5 bg-zinc-100 rounded text-[10px]">Ctrl+Shift+B</kbd>로 표시
          </p>
        </div>

        <div className="border-t border-zinc-100 pt-3">
          <p className="text-xs text-zinc-700 leading-relaxed mb-2">
            <strong>방법 B — 수동 등록 (드래그가 안 되는 경우):</strong>
          </p>
          <ol className="text-xs text-zinc-600 leading-relaxed pl-4 space-y-1 list-decimal list-inside">
            <li>북마크 바에서 우클릭 → <strong>"페이지 추가"</strong> 또는 <kbd className="px-1 py-0.5 bg-zinc-100 rounded text-[10px]">Ctrl+D</kbd> 후 "더보기"</li>
            <li>이름: <code className="bg-zinc-100 px-1 rounded">공고 본문 추출</code></li>
            <li>URL 칸에 아래 코드 전체를 붙여넣기 → 저장</li>
          </ol>
          <div className="mt-2 pl-4">
            <button
              onClick={copyBookmarkletCode}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-zinc-100 hover:bg-zinc-200 text-xs font-medium text-zinc-700 rounded transition-colors"
            >
              {codeCopied ? <><Check className="size-3" /> 복사됨!</> : <><Copy className="size-3" /> 북마클릿 코드 복사</>}
            </button>
            <p className="text-xs text-zinc-400 mt-1">
              ※ Chrome 주소창에 직접 붙여넣어도 동작 안 함 (보안 차단). 반드시 북마크 URL 칸에 붙여넣어야 함.
            </p>
          </div>
        </div>

        <div className="border-t border-zinc-100 pt-3">
          <p className="text-xs text-zinc-700 leading-relaxed">
            <strong>사용:</strong> 사람인 등 채용 페이지를 연 상태에서 북마크 클릭 → "✅ 본문 N자 복사 완료!" 알림 뜨면 성공 → 이 페이지로 돌아와 Ctrl+V
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* 옵션 2: Ctrl+P 인쇄 → PDF 저장 → 텍스트 복사 */}
        <div className="bg-white border-2 border-blue-200 rounded-lg p-3">
          <div className="text-xs font-semibold text-zinc-800 mb-1.5">
            ② <kbd className="px-1 py-0.5 bg-zinc-100 rounded text-[10px]">Ctrl+P</kbd> → PDF 저장 → 복사 <span className="text-blue-600">(사람인 추천)</span>
          </div>
          <ol className="text-xs text-zinc-600 leading-relaxed space-y-0.5 list-decimal list-inside">
            <li>채용 페이지에서 <kbd className="px-1 py-0.5 bg-zinc-100 rounded text-[10px]">Ctrl+P</kbd></li>
            <li>대상을 <strong>"PDF로 저장"</strong>으로 변경 → 저장</li>
            <li>저장한 PDF 열기 → 본문 드래그 → <kbd className="px-1 py-0.5 bg-zinc-100 rounded text-[10px]">Ctrl+C</kbd></li>
          </ol>
          <p className="text-xs text-zinc-400 mt-1">iframe 본문도 함께 렌더링됨</p>
        </div>

        {/* 옵션 3: 페이지 소스 */}
        <div className="bg-white border border-amber-200 rounded-lg p-3">
          <div className="text-xs font-semibold text-zinc-800 mb-1.5">③ <kbd className="px-1 py-0.5 bg-zinc-100 rounded text-[10px]">Ctrl+U</kbd> 페이지 소스</div>
          <p className="text-xs text-zinc-600 leading-relaxed">
            HTML 원본이 새 탭에 열림. <kbd className="px-1 py-0.5 bg-zinc-100 rounded text-[10px]">Ctrl+F</kbd>로 직무 키워드 찾기 → 주변 텍스트 복사. 사이트 차단 무시. 조금 번거롭지만 확실.
          </p>
        </div>
      </div>

      <p className="text-xs text-amber-700 leading-relaxed">
        💡 사이트가 마우스 드래그를 막아도 위 방법은 모두 통합니다. 북마클릿이 가장 빠르고, 인쇄 미리보기는 즉시 가능.
      </p>
    </div>
  );
}
