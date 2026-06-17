"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Copy, Check, AlertTriangle } from "lucide-react";
import { WorkflowCanvas } from "@/components/features/WorkflowCanvas";
import { InteractiveStudio } from "@/components/features/InteractiveStudio";
import { RubricBars } from "@/components/features/RubricBars";
import { DraftHistory } from "@/components/features/DraftHistory";
import { RagCitations } from "@/components/features/RagCitations";
import { Button } from "@/components/ui/button";
import { saveToLibrary, fetchJobUrl, FetchUrlError, getOllamaModels } from "@/lib/api";
import { loadSettings, saveSettings, DEFAULT_SETTINGS } from "@/lib/settings-store";
import { useEssayGeneration } from "@/hooks/useEssayGeneration";
import type { EssayTone, EssayPersona, ItemConfig, AgentKey, ProviderConfig, AppSettings } from "@/lib/types";
import { PAID_TIER_ONLY_MODELS } from "@/lib/types";

// ── Constants ────────────────────────────────────────────────────────────────

type Step = "jd" | "items" | "generating" | "done";

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
  const [mode, setMode] = useState<"auto" | "interactive">("auto");  // ADR-031: 자동/대화형
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [spaError, setSpaError] = useState<{ siteName: string | null; message: string } | null>(null);
  // 사람인 등 SPA 사이트 복사 안내(SpaSiteGuide) 모달 토글 — 사이드바가 좁아 모달로 띄운다
  const [showSpaGuide, setShowSpaGuide] = useState(false);

  // Item selection state (PipelineView 통합)
  const [itemSelections, setItemSelections] = useState<Record<string, { checked: boolean; charLimit: number }>>({});
  const [globalTone, setGlobalTone] = useState<EssayTone>("공식적");
  const [globalPersona, setGlobalPersona] = useState<EssayPersona>("경력직");
  // 파이프라인 노드 on/off (write는 content를 만들어 필수 → 토글 없음). flow로 백엔드 전달
  const [enabledNodes, setEnabledNodes] = useState({ retrieve: true, compress: true, evaluate: true });
  const [refineEnabled, setRefineEnabled] = useState(false);  // 평가 미달 시 재작성 (ADR-029 4a)
  const [customCategory, setCustomCategory] = useState("");
  const [customLimit, setCustomLimit] = useState(500);
  const [useCustom, setUseCustom] = useState(false);

  function handleItemChange(
    name: string,
    patch: Partial<{ checked: boolean; charLimit: number }>,
    defaultLimit = 500,
  ) {
    // 체크 시 charLimit이 해당 항목 default로 잡히게 한다 (표시값=적용값 일치).
    // 과거엔 500 하드코딩이라 표시(예: 직무경험 700)와 적용(500)이 어긋났음.
    setItemSelections((prev) => ({
      ...prev,
      [name]: { ...{ checked: false, charLimit: defaultLimit }, ...prev[name], ...patch },
    }));
  }

  // Agent config (그래프 노드에서 직접 편집)
  // SSR/CSR hydration 불일치 방지: 서버에선 DEFAULT_SETTINGS, 클라이언트 마운트 후 localStorage 반영
  const [agentConfigs, setAgentConfigs] = useState<AppSettings["agents"]>(
    DEFAULT_SETTINGS.agents,
  );
  // 항목별 agent config 오버라이드 (없으면 전역 agentConfigs 사용)
  const [itemAgentConfigs, setItemAgentConfigs] = useState<Record<string, Partial<Record<AgentKey, ProviderConfig>>>>({});

  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  // VRAM 초과(over) 모델 → 생성 전 차단용 (런타임 GPU 조회 기반)
  const [overModels, setOverModels] = useState<Record<string, string>>({});
  // 유료 티어 전용 모델 선택 시 생성 전 소프트 경고 모달 (null이면 닫힘)
  const [pendingWarning, setPendingWarning] = useState<{ name: string; reason: string }[] | null>(null);

  // 클라이언트 마운트 후 localStorage 설정 적용 (SSR hydration mismatch 방지)
  useEffect(() => {
    setAgentConfigs(loadSettings().agents);
  }, []);

  useEffect(() => {
    getOllamaModels()
      .then((r) => {
        const names = r.models.map((m) => m.name);
        setOllamaModels(names);
        setOverModels(
          Object.fromEntries(
            r.models.filter((m) => m.fit === "over" && m.fit_message).map((m) => [m.name, m.fit_message!]),
          ),
        );
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
            if (changed) saveSettings({ ...loadSettings(), agents: next });
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
          : value === "google" ? "gemini-2.5-flash"
          : "";
        updated.model = firstModel;
      }
      const next = { ...prev, [key]: updated };
      saveSettings({ ...loadSettings(), agents: next });
      return next;
    });
  }

  function handleItemAgentConfigChange(category: string, key: AgentKey, field: keyof ProviderConfig, value: string) {
    setItemAgentConfigs((prev) => {
      const baseCfg = prev[category]?.[key] ?? agentConfigs[key];
      const updated: ProviderConfig = { ...baseCfg, [field]: value };
      if (field === "provider") {
        updated.model =
          value === "ollama" ? (ollamaModels[0] ?? "exaone3.5:7.8b")
          : value === "anthropic" ? "claude-haiku-4-5-20251001"
          : value === "openai" ? "gpt-4.1-mini"
          : "gemini-2.5-flash";
        updated.apiKey = "";
      }
      return { ...prev, [category]: { ...prev[category], [key]: updated } };
    });
  }

  // Generation state — useEssayGeneration 훅으로 분리 (SSE + 결과 상태)
  const gen = useEssayGeneration();
  const {
    log, results, genError, pipelineEvents, savedIds, saving, editedContents,
    setSavedIds, setSaving, setEditedContents,
  } = gen;

  // ── Derived ──────────────────────────────────────────────────────────────

  const PRESET_DEFAULTS: Record<string, number> = Object.fromEntries(
    [
      ["자기소개", 500], ["지원동기", 500], ["성장과정", 500],
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

  // 실제 생성 실행 — 모든 사전 점검을 통과한 뒤(또는 경고 모달에서 "진행" 선택 후) 호출.
  const executeGenerate = useCallback(async () => {
    setStep("generating");

    // API 키는 body에 싣지 않는다 — 백엔드가 DB(Fernet 암호화)에서 복호화하거나
    // ollama 기본 URL을 사용한다 (CLAUDE.md Rule #2: 평문 키 비전송)
    const agentConfig: Record<string, { provider: string; model: string; api_key: string }> = {};
    for (const [key, cfg] of Object.entries(agentConfigs)) {
      agentConfig[key] = { provider: cfg.provider, model: cfg.model, api_key: "" };
    }

    const request = {
      job_description: jd,
      items: selectedItems.map((item) => {
        const overrides = itemAgentConfigs[item.category];
        const itemCfg: Record<string, { provider: string; model: string; api_key: string }> | undefined =
          overrides && Object.keys(overrides).length > 0
            ? Object.fromEntries(
                Object.entries(overrides).map(([k, v]) => [k, { provider: v!.provider, model: v!.model, api_key: "" }]),
              )
            : undefined;
        return {
          category: item.category,
          char_limit: item.charLimit,
          tone: item.tone,
          persona: item.persona,
          ...(itemCfg ? { agent_config: itemCfg } : {}),
        };
      }),
      user_id: "local",
      agent_config: agentConfig,
      // 켜진 노드만 flow로 (write는 필수). 백엔드가 이 구성으로 동적 그래프 빌드
      flow: [
        enabledNodes.retrieve && "retrieve",
        "write",
        enabledNodes.compress && "compress",
        enabledNodes.evaluate && "evaluate",
      ].filter(Boolean) as string[],
      refine_enabled: enabledNodes.evaluate && refineEnabled,  // evaluate 꺼지면 재작성 불가
    };

    // SSE 실행은 훅에 위임. done 시 step 전환, 실패 시 입력 단계로 복귀(버튼 먹통 방지).
    await gen.run(
      request,
      selectedItems.map((i) => i.category),
      () => setStep("done"),
      () => setStep("items"),
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jd, selectedItems, agentConfigs, itemAgentConfigs, enabledNodes, refineEnabled]);

  const handleGenerate = useCallback(async () => {
    // 실제 사용될 모델 수집 (전역 + 항목별 오버라이드)
    const usedOllamaModels = new Set<string>();
    const usedModels = new Set<string>();
    for (const cfg of Object.values(agentConfigs)) {
      usedModels.add(cfg.model);
      if (cfg.provider === "ollama") usedOllamaModels.add(cfg.model);
    }
    for (const overrides of Object.values(itemAgentConfigs)) {
      for (const cfg of Object.values(overrides)) {
        if (!cfg) continue;
        usedModels.add(cfg.model);
        if (cfg.provider === "ollama") usedOllamaModels.add(cfg.model);
      }
    }

    // 사전 검증 1 — 설치 안 된 Ollama 모델 (하드 차단: 사용자 PC의 확실한 사실)
    if (ollamaModels.length > 0) {
      const notInstalled = [...usedOllamaModels].filter((m) => !ollamaModels.includes(m));
      if (notInstalled.length > 0) {
        gen.fail(
          `설치되지 않은 Ollama 모델: ${notInstalled.join(", ")}\n\n설치된 모델: ${ollamaModels.join(", ")}\n("🤖 모델 관리"에서 다운로드하세요)`,
        );
        return;
      }
    }

    // 사전 검증 2 — VRAM 초과 모델 (하드 차단: 런타임 GPU 조회로 확실)
    const overUsed = [...usedOllamaModels].filter((m) => overModels[m]);
    if (overUsed.length > 0) {
      gen.fail(
        `GPU VRAM이 부족한 모델이 선택됐습니다:\n${overUsed.map((m) => `• ${m}: ${overModels[m]}`).join("\n")}\n\n더 작은 모델로 변경하거나 "🤖 모델 관리"에서 확인하세요.`,
      );
      return;
    }

    // 사전 검증 3 — 유료 티어 전용 모델 (소프트 경고: 사용자 티어를 알 수 없어 막지 않고 확인)
    const paidWarnings = [...usedModels]
      .filter((m) => PAID_TIER_ONLY_MODELS[m])
      .map((m) => ({ name: m, reason: PAID_TIER_ONLY_MODELS[m] }));
    if (paidWarnings.length > 0) {
      setPendingWarning(paidWarnings);
      return;
    }

    executeGenerate();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentConfigs, itemAgentConfigs, ollamaModels, overModels, executeGenerate]);


  // ── 풀스크린 레이아웃 ────────────────────────────────────────────

  const isGenerating = step === "generating";
  const isDone = step === "done" || results.length > 0;

  return (
    <div className="flex overflow-hidden" style={{ height: "calc(100vh - 56px)" }}>

      {/* ── 왼쪽 사이드바 ── */}
      <aside className="w-80 flex-shrink-0 border-r border-border bg-card flex flex-col overflow-hidden">

        {/* 상단 고정 헤더 */}
        <div className="px-4 py-3 border-b border-border flex-shrink-0">
          <h1 className="text-sm font-semibold text-foreground">자소서 생성</h1>
          <p className="text-xs text-muted-foreground mt-0.5">공고 입력 → 항목 선택 → 생성</p>
        </div>

        {/* 스크롤 가능한 설정 영역 */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">

          {/* 공고 입력 */}
          <section>
            <label className="text-[13px] font-semibold text-foreground">채용 공고</label>
            <textarea
              rows={8}
              value={jd}
              onChange={(e) => setJd(e.target.value)}
              disabled={isGenerating}
              placeholder="공고 전문 붙여넣기 (최소 50자)..."
              className="mt-1.5 w-full resize-none rounded-lg border border-border bg-muted px-3 py-2 text-xs font-mono text-foreground outline-none focus:border-muted-foreground focus:bg-card transition-colors disabled:opacity-50"
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
                className="mt-1.5 w-full py-1.5 rounded-md border border-blue-300 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/40 text-xs font-medium text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors disabled:opacity-50"
              >
                {fetching ? "가져오는 중..." : "URL에서 공고 가져오기"}
              </button>
            )}
            {fetchError && <p className="mt-1 text-xs text-red-500">{fetchError}</p>}
            {spaError && (
              <div className="mt-1 rounded-md border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
                <p className="font-medium">{spaError.siteName ?? "이 사이트"} 자동 추출 불가</p>
                <p className="mt-0.5">{spaError.message}</p>
                <div className="mt-1.5 flex items-center gap-2">
                  <button
                    onClick={() => setShowSpaGuide(true)}
                    className="rounded bg-amber-600 px-2 py-1 text-xs font-medium text-white hover:bg-amber-700 transition-colors"
                  >
                    📋 복사 방법 보기
                  </button>
                  <button onClick={() => setSpaError(null)} className="text-amber-600 underline">닫기</button>
                </div>
              </div>
            )}
          </section>

          {/* 대화형 모드에선 항목·설정·생성은 캔버스에서 하므로 사이드바엔 공고만 (ADR-031) */}
          {mode === "auto" && (
          <>

          {/* 항목 선택 */}
          <section>
            <label className="text-[13px] font-semibold text-foreground">항목 선택</label>
            <div className="mt-1.5 flex flex-col gap-1.5">
              {[
                { name: "자기소개", default: 500 },
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
                    onClick={() => !isGenerating && handleItemChange(preset.name, { checked: !checked }, preset.default)}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer select-none transition-all ${
                      checked ? "border-primary bg-primary/10" : "border-border bg-card hover:bg-muted"
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-[5px] border-2 flex items-center justify-center text-xs flex-shrink-0 text-white ${
                      checked ? "border-primary bg-primary" : "border-zinc-300 dark:border-zinc-600 bg-transparent"
                    }`}>
                      {checked && "✓"}
                    </div>
                    <span className={`text-xs font-medium flex-1 ${checked ? "text-primary" : "text-foreground"}`}>{preset.name}</span>
                    {checked ? (
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="number" min={50} max={2000} step={50}
                          value={limit}
                          onChange={(e) => handleItemChange(preset.name, { charLimit: Number(e.target.value) })}
                          className="w-14 text-center text-xs border border-blue-200 rounded px-1 py-0.5 outline-none bg-card"
                          disabled={isGenerating}
                        />
                        <span className="text-xs text-muted-foreground">자</span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">{preset.default}자</span>
                    )}
                  </div>
                );
              })}

              {/* 직접 입력 */}
              <div
                onClick={() => !isGenerating && setUseCustom((p) => !p)}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer select-none transition-all ${
                  useCustom ? "border-violet-500 bg-violet-50 dark:bg-violet-950/30" : "border-border bg-card hover:bg-muted"
                }`}
              >
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center text-xs flex-shrink-0 text-white ${
                  useCustom ? "border-violet-500 bg-violet-500" : "border-zinc-300 dark:border-zinc-600 bg-transparent"
                }`}>
                  {useCustom ? "✓" : "+"}
                </div>
                <span className={`text-xs font-medium flex-1 ${useCustom ? "text-violet-700 dark:text-violet-400" : "text-foreground"}`}>직접 입력</span>
              </div>
              {useCustom && (
                <div className="flex gap-1.5 pl-6" onClick={(e) => e.stopPropagation()}>
                  <input type="text" placeholder="항목명" value={customCategory} onChange={(e) => setCustomCategory(e.target.value)}
                    className="flex-1 text-xs border border-violet-200 rounded-md px-2 py-1 outline-none" disabled={isGenerating} />
                  <input type="number" min={50} max={2000} step={50} value={customLimit} onChange={(e) => setCustomLimit(Number(e.target.value))}
                    className="w-16 text-center text-xs border border-violet-200 rounded-md px-1 py-1 outline-none" disabled={isGenerating} />
                  <span className="text-xs text-muted-foreground self-center">자</span>
                </div>
              )}
            </div>
          </section>

          {/* 공통 설정 */}
          <section>
            <label className="text-[13px] font-semibold text-foreground">공통 설정</label>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              <div>
                <div className="text-xs text-muted-foreground mb-1">톤</div>
                <select value={globalTone} onChange={(e) => setGlobalTone(e.target.value as EssayTone)} disabled={isGenerating}
                  className="w-full text-xs border border-border rounded-md px-2 py-1.5 outline-none bg-card">
                  {(["공식적","친근함","도전적"] as EssayTone[]).map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">페르소나</div>
                <select value={globalPersona} onChange={(e) => setGlobalPersona(e.target.value as EssayPersona)} disabled={isGenerating}
                  className="w-full text-xs border border-border rounded-md px-2 py-1.5 outline-none bg-card">
                  {(["신입","경력직","전환"] as EssayPersona[]).map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>
          </section>

          {/* 파이프라인 노드 on/off (ADR-028 단계 2) */}
          <section>
            <label className="text-[13px] font-semibold text-foreground">파이프라인 노드</label>
            <div className="mt-1.5 flex flex-col gap-1.5">
              {([
                { key: "retrieve", label: "RAG 검색", desc: "관련 경험 자동 참고" },
                { key: "compress", label: "글자수 조정", desc: "목표 글자수로 압축/확장" },
                { key: "evaluate", label: "자가 평가", desc: "5항목 루브릭 채점" },
              ] as const).map((n) => {
                const on = enabledNodes[n.key];
                return (
                  <div
                    key={n.key}
                    onClick={() => !isGenerating && setEnabledNodes((p) => ({ ...p, [n.key]: !p[n.key] }))}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer select-none transition-all ${
                      on ? "border-primary bg-primary/10" : "border-border bg-card hover:bg-muted"
                    }`}
                  >
                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center text-xs flex-shrink-0 text-white ${
                      on ? "border-primary bg-primary" : "border-zinc-300 dark:border-zinc-600 bg-transparent"
                    }`}>
                      {on && "✓"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`text-xs font-medium ${on ? "text-primary" : "text-foreground"}`}>{n.label}</div>
                      <div className="text-xs text-muted-foreground">{n.desc}</div>
                    </div>
                  </div>
                );
              })}
              <p className="text-xs text-muted-foreground mt-0.5">※ 작성(write)은 필수라 항상 포함됩니다</p>
              {/* 재작성 검증 (ADR-029 4a) — evaluate 켜진 경우만 의미 */}
              <div
                onClick={() => !isGenerating && enabledNodes.evaluate && setRefineEnabled((p) => !p)}
                className={`mt-2 flex items-center gap-2 rounded-lg border px-3 py-2 select-none transition-all ${
                  enabledNodes.evaluate ? "cursor-pointer" : "opacity-50 cursor-not-allowed"
                } ${refineEnabled && enabledNodes.evaluate ? "border-primary bg-primary/10" : "border-border bg-card hover:bg-muted"}`}
              >
                <div className={`w-4 h-4 rounded border-2 flex items-center justify-center text-xs flex-shrink-0 text-white ${
                  refineEnabled && enabledNodes.evaluate ? "border-primary bg-primary" : "border-zinc-300 dark:border-zinc-600 bg-transparent"
                }`}>
                  {refineEnabled && enabledNodes.evaluate && "✓"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-xs font-medium ${refineEnabled && enabledNodes.evaluate ? "text-primary" : "text-foreground"}`}>평가 미달 시 재작성</div>
                  <div className="text-xs text-muted-foreground">루브릭 6점 미만이면 다시 작성 (최대 2회)</div>
                </div>
              </div>
            </div>
          </section>

          {/* 진행 로그 */}
          {log.length > 0 && (
            <section>
              <label className="text-[13px] font-semibold text-foreground">진행 로그</label>
              <div className="mt-1.5 space-y-1 max-h-40 overflow-y-auto">
                {log.map((entry) => (
                  <div key={entry.id} className="flex items-start gap-1.5 text-xs">
                    {entry.type === "error"
                      ? <span className="text-red-500 flex-shrink-0">✗</span>
                      : <span className="text-emerald-500 flex-shrink-0">✓</span>}
                    <span className={entry.type === "error" ? "text-red-600" : "text-muted-foreground"}>{entry.message}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
          </>
          )}
        </div>

        {/* 하단 고정 버튼 영역 (자동 모드만) */}
        {mode === "auto" && (
        <div className="flex-shrink-0 border-t border-border px-4 py-3 space-y-2">
          {genError && (
            <div className="rounded-lg bg-red-50 border border-red-200 dark:bg-red-950/30 dark:border-red-900 px-3 py-2">
              <p className="text-xs font-medium text-red-700">생성 불가</p>
              <p className="text-xs text-red-600 whitespace-pre-line mt-0.5">{genError}</p>
              <button onClick={() => gen.setGenError(null)} className="text-xs text-red-500 underline mt-1">닫기</button>
            </div>
          )}
          <div className="flex gap-2">
            {(isDone || isGenerating || genError) && (
              <button
                onClick={() => { gen.reset(); setStep("jd"); }}
                className="flex-1 py-2 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
                disabled={isGenerating}
              >
                초기화
              </button>
            )}
            <button
              onClick={handleGenerate}
              disabled={!canGenerate || isGenerating}
              className="flex-1 py-2 rounded-lg text-xs font-semibold transition-colors bg-primary text-primary-foreground disabled:bg-muted disabled:text-muted-foreground disabled:opacity-60"
            >
              {isGenerating ? "생성 중..." : "▶ 자소서 생성"}
            </button>
          </div>
        </div>
        )}
      </aside>

      {/* ── 메인 영역 (자동/대화형 모드, ADR-031) ── */}
      <main className="flex-1 flex flex-col overflow-hidden relative">

        {/* 모드 토글 */}
        <div className="absolute top-3 right-3 z-20 flex rounded-lg border border-border bg-card p-0.5 text-xs shadow-sm">
          <button type="button" onClick={() => setMode("auto")} className={`rounded-md px-2.5 py-1 transition-colors ${mode === "auto" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>빠른 자동</button>
          <button type="button" onClick={() => setMode("interactive")} className={`rounded-md px-2.5 py-1 transition-colors ${mode === "interactive" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>대화형</button>
        </div>

        {mode === "interactive" ? (
          <div className="flex-1 overflow-y-auto">
            <InteractiveStudio jd={jd} ollamaModels={ollamaModels} />
          </div>
        ) : (
        <>

        {/* 캔버스 상태 배너 */}
        {isGenerating && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 rounded-full bg-card border border-border shadow-sm px-4 py-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            <span className="text-xs font-medium text-foreground">자소서 생성 중...</span>
          </div>
        )}
        {isDone && !isGenerating && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 rounded-full bg-card border border-emerald-300 dark:border-emerald-700 shadow-sm px-4 py-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-xs font-medium text-foreground">생성 완료 — 아래에서 결과를 확인하세요</span>
          </div>
        )}
        {!isGenerating && !isDone && selectedItems.length === 0 && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 rounded-full bg-card border border-border shadow-sm px-4 py-1.5">
            <span className="text-xs text-muted-foreground">← 왼쪽에서 항목을 선택하면 파이프라인이 구성됩니다</span>
          </div>
        )}

        {/* React Flow 워크플로우 캔버스 */}
        <div className="flex-1 min-h-0">
          <WorkflowCanvas
            categories={selectedItems.map((i) => i.category)}
            configs={agentConfigs}
            itemConfigs={itemAgentConfigs}
            events={pipelineEvents}
            editable={!isGenerating}
            ollamaModels={ollamaModels}
            enabledNodes={enabledNodes}
            onConfigChange={handleConfigChange}
            onItemConfigChange={handleItemAgentConfigChange}
          />
        </div>

        {/* 결과 패널 (생성 완료 시 하단에서 슬라이드업) */}
        {results.length > 0 && (
          <div
            className="flex-shrink-0 border-t border-border bg-card overflow-y-auto"
            style={{ maxHeight: "45vh" }}
          >
            <div className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-foreground">생성 결과</h2>
                <span className="text-xs text-muted-foreground">{results.length}개 항목</span>
              </div>
              <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))" }}>
                {results.map((draft) => {
                  const currentContent = editedContents[draft.category] ?? draft.content;
                  const currentCharCount = currentContent.length;
                  const isEdited = draft.category in editedContents;
                  const charOk = Math.abs(currentCharCount - draft.char_target) / draft.char_target < 0.05;
                  return (
                    <div key={draft.category} className="rounded-xl border border-border overflow-hidden">
                      <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-border bg-muted">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-sm font-semibold text-foreground truncate">{draft.category}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${charOk ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}>
                            {currentCharCount}/{draft.char_target}자
                          </span>
                          {isEdited && <span className="text-xs bg-blue-100 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400 px-1.5 py-0.5 rounded-full">편집됨</span>}
                          {draft.evaluation_score !== null && (
                            <span className="text-xs font-semibold text-amber-600">★ {draft.evaluation_score?.toFixed(1)}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <CopyButton text={currentContent} />
                          {savedIds[draft.category] ? (
                            <span className="text-xs bg-muted text-muted-foreground px-2 py-1 rounded-md">저장됨</span>
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
                                } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
                                finally { setSaving((p) => ({ ...p, [draft.category]: false })); }
                              }}
                              className="text-xs bg-foreground text-background px-2.5 py-1 rounded-md hover:bg-foreground/90 transition-colors disabled:opacity-50"
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
                        className="w-full p-4 text-sm text-foreground leading-relaxed resize-y outline-none border-0"
                        style={{ background: "transparent" }}
                      />
                      <div className="px-4 pb-3 space-y-3">
                        {(draft.evaluation_scores || draft.evaluation_feedback) && (
                          <div className="border-t border-border pt-2.5 space-y-2">
                            {draft.evaluation_scores && (
                              <RubricBars scores={draft.evaluation_scores} />
                            )}
                            {draft.evaluation_feedback && (
                              <p className="text-xs text-muted-foreground leading-relaxed">
                                {draft.evaluation_scores
                                  ? draft.evaluation_feedback.split("|").slice(1).join("|").trim() || draft.evaluation_feedback
                                  : draft.evaluation_feedback}
                              </p>
                            )}
                          </div>
                        )}
                        {draft.rag_citations && draft.rag_citations.length > 0 && (
                          <RagCitations citations={draft.rag_citations} />
                        )}
                        {draft.draft_history && draft.draft_history.length > 0 && (
                          <DraftHistory
                            history={draft.draft_history}
                            target={draft.char_target}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
        </>
        )}
      </main>

      {/* 유료 티어 전용 모델 선택 시 생성 전 소프트 경고 (차단 아님 — 진행 허용) */}
      {pendingWarning && (
        <GenerateWarningModal
          warnings={pendingWarning}
          onCancel={() => setPendingWarning(null)}
          onProceed={() => { setPendingWarning(null); executeGenerate(); }}
        />
      )}

      {/* 사람인 등 SPA 사이트 복사 안내 (북마클릿·Ctrl+P) — 사이드바가 좁아 모달로 표시 */}
      {showSpaGuide && spaError && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 backdrop-blur-sm p-4"
          onClick={() => setShowSpaGuide(false)}
        >
          <div className="my-8 w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
            <SpaSiteGuide error={spaError} onClose={() => setShowSpaGuide(false)} />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 생성 전 경고 모달 ────────────────────────────────────────────────────────

// 유료 티어 전용 모델(예: gemini-2.5-pro)을 골랐을 때 생성 직전 확인받는 모달.
// 프론트는 사용자가 무료/유료 티어인지 알 수 없으므로 막지 않고 알려준 뒤 선택하게 한다.
function GenerateWarningModal({
  warnings, onCancel, onProceed,
}: {
  warnings: { name: string; reason: string }[];
  onCancel: () => void;
  onProceed: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onCancel}
    >
      <div
        className="bg-card rounded-xl shadow-2xl max-w-md w-full overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-amber-500 shrink-0" />
            <h2 className="text-base font-semibold text-foreground">확인이 필요해요</h2>
          </div>
          <div className="space-y-2">
            {warnings.map((w) => (
              <div key={w.name} className="rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-950/30 dark:border-amber-900 px-3 py-2">
                <p className="text-sm font-medium text-amber-900 dark:text-amber-200">{w.name}</p>
                <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5 leading-relaxed">{w.reason}</p>
              </div>
            ))}
          </div>
          <ul className="text-xs text-muted-foreground leading-relaxed list-disc list-inside space-y-0.5">
            <li>무료 키라면 생성이 <span className="font-medium text-foreground">429 오류</span>로 실패할 수 있어요.</li>
            <li>유료 티어(billing 연결) 키라면 그대로 진행하셔도 됩니다.</li>
          </ul>
        </div>
        <div className="flex gap-2 px-5 py-3 border-t border-border">
          <button
            onClick={onCancel}
            className="flex-1 py-2 rounded-lg border border-border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
          >
            모델 바꾸기
          </button>
          <button
            onClick={onProceed}
            className="flex-1 py-2 rounded-lg bg-foreground text-background text-sm font-semibold hover:bg-foreground/90 transition-colors"
          >
            그래도 진행 →
          </button>
        </div>
      </div>
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
    <div className="rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/20 p-4 space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <AlertTriangle className="size-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-900 dark:text-amber-200">{siteName} 자동 추출 불가</p>
            <p className="text-xs text-amber-800 dark:text-amber-300 mt-0.5 leading-relaxed">{error.message}</p>
            <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">아래 중 가장 편한 방법으로 본문을 가져와서 위 텍스트 영역에 붙여넣어 주세요.</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-amber-700 dark:text-amber-300 hover:text-amber-900 dark:hover:text-amber-100 text-xs underline shrink-0"
        >
          닫기
        </button>
      </div>

      {/* 사람인 한정 경고 */}
      {siteName === "사람인" && (
        <div className="bg-blue-50 border border-blue-200 dark:bg-blue-950/30 dark:border-blue-900 rounded-lg p-3 text-xs text-blue-900 dark:text-blue-200 leading-relaxed">
          <strong>💡 사람인 팁:</strong> 사람인은 공고 본문이 iframe에 보호되어 있어 북마클릿도 한 번에 안 될 수 있어요.
          가장 빠른 방법은 <strong><kbd className="px-1 py-0.5 bg-card rounded text-[10px]">Ctrl+P</kbd> 인쇄 미리보기</strong>입니다 (아래 ②).
          북마클릿을 시도하면 본문 iframe URL을 새 탭으로 여는 옵션이 뜹니다.
        </div>
      )}

      {/* 옵션 1: 북마클릿 (가장 강력, 한 번 설치) */}
      <div className="bg-card border-2 border-emerald-300 dark:border-emerald-800 rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 px-2 py-0.5 rounded">⭐ 다른 사이트엔 가장 빠름</span>
          <span className="text-sm font-semibold text-foreground">① 북마클릿 (한 번 설치, 평생 사용)</span>
        </div>

        <div>
          <p className="text-xs text-foreground leading-relaxed mb-2">
            <strong>방법 A — 드래그 (가장 쉬움):</strong>
          </p>
          <div className="flex items-center gap-3 flex-wrap pl-4">
            <a
              ref={linkRef}
              onClick={(e) => {
                e.preventDefault();
                toast.info("이 버튼은 클릭이 아니라 북마크 바에 끌어다 놓으세요! (북마크 바: Ctrl+Shift+B)");
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded-md cursor-grab active:cursor-grabbing select-none"
              draggable
            >
              📋 공고 본문 추출
            </a>
            <span className="text-xs text-muted-foreground">← 이 버튼을 마우스로 끌어서 북마크 바에 놓기</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1.5 pl-4">
            북마크 바가 안 보이면 <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">Ctrl+Shift+B</kbd>로 표시
          </p>
        </div>

        <div className="border-t border-border pt-3">
          <p className="text-xs text-foreground leading-relaxed mb-2">
            <strong>방법 B — 수동 등록 (드래그가 안 되는 경우):</strong>
          </p>
          <ol className="text-xs text-muted-foreground leading-relaxed pl-4 space-y-1 list-decimal list-inside">
            <li>북마크 바에서 우클릭 → <strong>"페이지 추가"</strong> 또는 <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">Ctrl+D</kbd> 후 "더보기"</li>
            <li>이름: <code className="bg-muted px-1 rounded">공고 본문 추출</code></li>
            <li>URL 칸에 아래 코드 전체를 붙여넣기 → 저장</li>
          </ol>
          <div className="mt-2 pl-4">
            <button
              onClick={copyBookmarkletCode}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-muted hover:bg-muted text-xs font-medium text-foreground rounded transition-colors"
            >
              {codeCopied ? <><Check className="size-3" /> 복사됨!</> : <><Copy className="size-3" /> 북마클릿 코드 복사</>}
            </button>
            <p className="text-xs text-muted-foreground mt-1">
              ※ Chrome 주소창에 직접 붙여넣어도 동작 안 함 (보안 차단). 반드시 북마크 URL 칸에 붙여넣어야 함.
            </p>
          </div>
        </div>

        <div className="border-t border-border pt-3">
          <p className="text-xs text-foreground leading-relaxed">
            <strong>사용:</strong> 사람인 등 채용 페이지를 연 상태에서 북마크 클릭 → "✅ 본문 N자 복사 완료!" 알림 뜨면 성공 → 이 페이지로 돌아와 Ctrl+V
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* 옵션 2: Ctrl+P 인쇄 → PDF 저장 → 텍스트 복사 */}
        <div className="bg-card border-2 border-blue-200 dark:border-blue-900 rounded-lg p-3">
          <div className="text-xs font-semibold text-foreground mb-1.5">
            ② <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">Ctrl+P</kbd> → PDF 저장 → 복사 <span className="text-blue-600">(사람인 추천)</span>
          </div>
          <ol className="text-xs text-muted-foreground leading-relaxed space-y-0.5 list-decimal list-inside">
            <li>채용 페이지에서 <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">Ctrl+P</kbd></li>
            <li>대상을 <strong>"PDF로 저장"</strong>으로 변경 → 저장</li>
            <li>저장한 PDF 열기 → 본문 드래그 → <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">Ctrl+C</kbd></li>
          </ol>
          <p className="text-xs text-muted-foreground mt-1">iframe 본문도 함께 렌더링됨</p>
        </div>

        {/* 옵션 3: 페이지 소스 */}
        <div className="bg-card border border-amber-200 dark:border-amber-900 rounded-lg p-3">
          <div className="text-xs font-semibold text-foreground mb-1.5">③ <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">Ctrl+U</kbd> 페이지 소스</div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            HTML 원본이 새 탭에 열림. <kbd className="px-1 py-0.5 bg-muted rounded text-[10px]">Ctrl+F</kbd>로 직무 키워드 찾기 → 주변 텍스트 복사. 사이트 차단 무시. 조금 번거롭지만 확실.
          </p>
        </div>
      </div>

      <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
        💡 사이트가 마우스 드래그를 막아도 위 방법은 모두 통합니다. 북마클릿이 가장 빠르고, 인쇄 미리보기는 즉시 가능.
      </p>
    </div>
  );
}
