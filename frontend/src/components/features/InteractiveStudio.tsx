"use client";

import { useEffect, useState } from "react";
import { Loader2, Check, Sparkles, ArrowRight, Minus, Plus, FileText, Brain, Maximize2, X, Ruler } from "lucide-react";
import { runJdAnalyze, runWrite, runRagSearch, runCoverage, runAdjust, saveToLibrary } from "@/lib/api";
import { useCloudModels } from "@/lib/queries";
import { useStudioStore, type ModelRef } from "@/lib/studio-store";
import { groupNeurons, defaultActiveKeys } from "@/lib/neurons";
import { ExperienceNeurons } from "./ExperienceNeurons";

const PROVIDER_LABEL: Record<string, string> = {
  ollama: "💻 로컬 · Ollama (무료)",
  anthropic: "☁️ Claude (API 비용)",
  openai: "☁️ GPT (API 비용)",
  google: "☁️ Gemini (API 비용)",
};
const MAX_RUNS = 5;
const CATEGORIES = ["자기소개", "지원동기", "성장과정", "직무경험", "강점/역량", "입사 후 포부"];

type Group = { provider: string; models: string[] };

// 모델 슬롯 선택 (횟수 +/- + 슬롯별 드롭다운) — JD분석·작성 재사용 (ADR-031 공통 골격)
function ModelSlots({
  groups,
  slots,
  setSlots,
}: {
  groups: Group[];
  slots: (ModelRef | null)[];
  setSlots: (s: (ModelRef | null)[]) => void;
}) {
  function setCount(n: number) {
    const next = Math.max(1, Math.min(MAX_RUNS, n));
    const arr = [...slots];
    while (arr.length < next) arr.push(null);
    arr.length = next;
    setSlots(arr);
  }
  function setSlot(i: number, value: string) {
    if (!value) return;
    const [provider, ...rest] = value.split(":");
    setSlots(slots.map((s, idx) => (idx === i ? { provider, model: rest.join(":") } : s)));
  }
  return (
    <>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-foreground">횟수</span>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setCount(slots.length - 1)} disabled={slots.length <= 1} className="flex size-6 items-center justify-center rounded-md border border-border bg-card text-foreground hover:bg-muted disabled:opacity-40">
            <Minus className="size-3.5" />
          </button>
          <span className="w-6 text-center text-sm font-semibold tabular-nums text-foreground">{slots.length}</span>
          <button type="button" onClick={() => setCount(slots.length + 1)} disabled={slots.length >= MAX_RUNS} className="flex size-6 items-center justify-center rounded-md border border-border bg-card text-foreground hover:bg-muted disabled:opacity-40">
            <Plus className="size-3.5" />
          </button>
        </div>
      </div>
      <div className="space-y-1.5">
        {slots.map((slot, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-4 shrink-0 text-center text-xs text-muted-foreground">{i + 1}</span>
            <select
              value={slot ? `${slot.provider}:${slot.model}` : ""}
              onChange={(e) => setSlot(i, e.target.value)}
              className="flex-1 rounded-md border border-border bg-card px-2 py-1.5 text-xs text-foreground outline-none focus:border-muted-foreground"
            >
              <option value="" disabled>
                모델 선택...
              </option>
              {groups.map((g) => (
                <optgroup key={g.provider} label={PROVIDER_LABEL[g.provider] ?? g.provider}>
                  {g.models.map((m) => (
                    <option key={m} value={`${g.provider}:${m}`}>
                      {m}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        ))}
      </div>
    </>
  );
}

const Arrow = () => (
  <div className="flex shrink-0 items-center text-muted-foreground">
    <ArrowRight className="size-5" />
  </div>
);

// 대화형 단계 실행 (ADR-031) — JD 분석 → 내 경험(뉴런) → 초안 작성, 각 단계 N번 후보 택1.
export function InteractiveStudio({ jd, ollamaModels }: { jd: string; ollamaModels: string[] }) {
  const cloudModelsQ = useCloudModels();
  const cloudModels = cloudModelsQ.data ?? {};
  const groups: Group[] = [
    { provider: "ollama", models: ollamaModels },
    ...Object.entries(cloudModels).map(([provider, models]) => ({ provider, models })),
  ].filter((g) => g.models.length > 0);

  const s = useStudioStore();
  const [jdLoading, setJdLoading] = useState(false);
  const [jdError, setJdError] = useState<string | null>(null);
  const [wLoading, setWLoading] = useState(false);
  const [wError, setWError] = useState<string | null>(null);
  const [rLoading, setRLoading] = useState(false);
  const [expanded, setExpanded] = useState(false); // 충족도 지도 크게보기

  // 크게보기 — ESC 닫기 + 배경 스크롤 잠금
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [expanded]);

  const jdValid = s.slots.filter((x): x is ModelRef => x !== null);
  const wValid = s.writeSlots.filter((x): x is ModelRef => x !== null);
  const chosenCand = s.chosen !== null && s.candidates ? s.candidates[s.chosen] : null;
  const chosenDraft = s.writeChosen !== null && s.writeCandidates ? s.writeCandidates[s.writeChosen] : null;

  // ── 마무리 단계: 글자수 조정 · 저장 (ADR-031 E) ──
  const [finalContent, setFinalContent] = useState("");
  const [adjusting, setAdjusting] = useState(false);
  const [adjMsg, setAdjMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // 초안 택1이 바뀌면 마무리 칸을 그 초안으로 초기화
  useEffect(() => {
    if (chosenDraft) {
      setFinalContent(chosenDraft.content);
      setAdjMsg(null);
      setSaved(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.writeChosen, s.writeCandidates]);

  async function adjust() {
    if (!chosenDraft) return;
    setAdjusting(true);
    setAdjMsg(null);
    try {
      const r = await runAdjust({
        content: finalContent,
        char_limit: s.charLimit,
        provider: chosenDraft.provider,
        model: chosenDraft.model,
      });
      setFinalContent(r.content);
      setSaved(false);
      setAdjMsg(
        r.status === "ok"
          ? `목표에 맞췄어요 — ${r.char_count}자 (${r.iterations}회)`
          : `${r.char_count}자 (${r.iterations}회 시도, 아직 ${r.status === "compress" ? "초과" : "부족"})`,
      );
    } catch (e) {
      setAdjMsg(e instanceof Error ? e.message : "조정 실패");
    } finally {
      setAdjusting(false);
    }
  }

  async function save() {
    if (!finalContent.trim()) return;
    setSaving(true);
    try {
      await saveToLibrary({
        category: s.category,
        content: finalContent,
        char_target: s.charLimit,
        is_final: true,
        generation_metadata: {
          source: "interactive",
          company: chosenCand?.target_company,
          model: chosenDraft ? `${chosenDraft.provider}:${chosenDraft.model}` : undefined,
        },
      });
      setSaved(true);
    } catch (e) {
      setAdjMsg(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  }

  async function analyze() {
    if (!jdValid.length || jd.trim().length < 10) return;
    setJdLoading(true);
    setJdError(null);
    s.setCandidates(null);
    s.setChosen(null);
    s.resetRag();
    try {
      const r = await runJdAnalyze({ job_description: jd, models: jdValid });
      s.setCandidates(r.candidates);
    } catch (e) {
      setJdError(e instanceof Error ? e.message : String(e));
    } finally {
      setJdLoading(false);
    }
  }

  // JD 후보 택1 — 바꾸면 내 경험을 새로 떠올린다.
  function chooseJd(i: number) {
    s.setChosen(i);
    s.resetRag();
  }

  // 직무 분석 기반으로 내 경험 검색 + 충족도 매칭 → 유사도 임계로 자동 활성 (ADR-031 D · 032).
  async function loadRag(analysis: string) {
    setRLoading(true);
    try {
      const [r, cov] = await Promise.all([
        runRagSearch({ jd_analysis: analysis }),
        runCoverage({ jd_analysis: analysis }).catch(() => ({ requirements: [] })),
      ]);
      s.setRagSources(r.sources);
      s.setCoverage(cov.requirements);
      s.setRagActiveKeys(defaultActiveKeys(groupNeurons(r.sources)));
    } catch {
      s.setRagSources([]);
      s.setCoverage([]);
      s.setRagActiveKeys([]);
    } finally {
      setRLoading(false);
    }
  }

  // JD 선택되면 내 경험 자동 검색 (한 번만).
  useEffect(() => {
    if (chosenCand && s.ragSources === null && !rLoading) {
      void loadRag(chosenCand.jd_analysis);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosenCand, s.ragSources]);

  async function write() {
    if (!chosenCand || !wValid.length) return;
    setWLoading(true);
    setWError(null);
    s.setWriteCandidates(null);
    s.setWriteChosen(null);
    try {
      // 켜둔 뉴런(프로젝트)의 청크 전체 + 직접 붙여넣은 근거 → rag_context
      const neurons = groupNeurons(s.ragSources ?? []);
      const activeChunks = neurons
        .filter((n) => s.ragActiveKeys.includes(n.key))
        .flatMap((n) => n.chunks.map((c) => c.content));
      const ragContext = [...activeChunks, ...(s.customRag.trim() ? [s.customRag.trim()] : [])];
      const r = await runWrite({
        jd_analysis: chosenCand.jd_analysis,
        target_company: chosenCand.target_company,
        category: s.category,
        char_limit: s.charLimit,
        rag_context: ragContext,
        models: wValid,
      });
      s.setWriteCandidates(r.candidates);
    } catch (e) {
      setWError(e instanceof Error ? e.message : String(e));
    } finally {
      setWLoading(false);
    }
  }

  const activeNeuronCount = s.ragActiveKeys.length;

  return (
    <div className="flex h-full gap-4 overflow-x-auto p-6">
      {/* ── 단계 1: JD 분석 ── */}
      <div className="w-80 shrink-0 space-y-3">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <Sparkles className="size-4 text-primary" /> JD 분석
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">N번 분석 → 택1</p>
          </div>
          {(s.candidates || s.slots.some((x) => x)) && (
            <button
              type="button"
              onClick={() => {
                s.reset();
                setJdError(null);
                setWError(null);
              }}
              className="shrink-0 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              초기화
            </button>
          )}
        </div>
        {jd.trim().length < 10 && (
          <p className="rounded-lg border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
            ← 사이드바에 공고를 붙여넣어 주세요.
          </p>
        )}
        {groups.length === 0 ? (
          <p className="text-xs text-muted-foreground">사용 가능한 모델이 없어요.</p>
        ) : (
          <ModelSlots groups={groups} slots={s.slots} setSlots={s.setSlots} />
        )}
        <button
          type="button"
          onClick={analyze}
          disabled={!jdValid.length || jd.trim().length < 10 || jdLoading}
          className="w-full rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-40"
        >
          {jdLoading ? (
            <span className="flex items-center justify-center gap-1.5">
              <Loader2 className="size-3.5 animate-spin" /> 분석 중...
            </span>
          ) : (
            `${jdValid.length || ""}개 분석`
          )}
        </button>
        {jdError && <p className="text-xs text-red-500 dark:text-red-400">{jdError}</p>}
        {s.candidates && (
          <div className="space-y-2 border-t border-border pt-3">
            <p className="text-xs font-semibold text-foreground">후보 {s.candidates.length}개 — 고르세요</p>
            {s.candidates.map((c, i) => (
              <button
                key={i}
                type="button"
                onClick={() => chooseJd(i)}
                className={`block w-full rounded-xl border p-3 text-left transition-all ${
                  s.chosen === i ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border bg-card hover:border-muted-foreground"
                }`}
              >
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="font-mono text-xs font-semibold text-foreground">{c.model}</span>
                  {s.chosen === i && <Check className="size-3.5 text-primary" />}
                </div>
                <p className="mb-1 text-[11px] text-muted-foreground">회사: {c.target_company}</p>
                <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap font-sans text-[11px] leading-relaxed text-muted-foreground">{c.jd_analysis}</pre>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── 단계 D: 내 경험 (뉴런) — JD 선택 시 ── */}
      {chosenCand && (
        <>
          <Arrow />
          <div className="flex w-[32rem] shrink-0 flex-col">
            <div className="mb-2 flex items-start justify-between">
              <div>
                <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                  <Brain className="size-4 text-primary" /> 내 경험
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  직무 요구별로 내 경험이 얼마나 받쳐주는지 · 클릭해 켜고 끄기
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2.5">
                {s.ragSources && s.ragSources.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setExpanded(true)}
                    className="flex items-center gap-1 text-[11px] text-primary hover:underline"
                  >
                    <Maximize2 className="size-3" /> 크게보기
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => loadRag(chosenCand.jd_analysis)}
                  disabled={rLoading}
                  className="text-[11px] text-primary hover:underline disabled:opacity-40"
                >
                  {rLoading ? "검색 중..." : "다시 검색"}
                </button>
              </div>
            </div>

            {/* 뉴런 캔버스 */}
            <div className="relative h-[30rem] overflow-hidden rounded-xl border border-border bg-card">
              {rLoading ? (
                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                  <Loader2 className="mr-1.5 size-4 animate-spin" /> 경험을 떠올리는 중...
                </div>
              ) : s.ragSources && s.ragSources.length > 0 ? (
                <ExperienceNeurons
                  sources={s.ragSources}
                  coverage={s.coverage ?? []}
                  company={chosenCand.target_company}
                  activeKeys={s.ragActiveKeys}
                  onToggle={s.toggleRagKey}
                />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-1 px-6 text-center">
                  <p className="text-xs text-muted-foreground">관련 경험을 못 찾았어요.</p>
                  <p className="text-[11px] text-muted-foreground">아래에 직접 붙여넣거나 그냥 작성해도 돼요.</p>
                </div>
              )}
              {s.ragSources && s.ragSources.length > 0 && (
                <span className="pointer-events-none absolute bottom-2 left-2 rounded-md bg-muted/80 px-2 py-1 text-[10px] text-muted-foreground">
                  켜진 경험 {activeNeuronCount}개 · 주황 요구 = 보강 필요
                </span>
              )}
            </div>

            {/* 직접 근거 + 다음 단계 */}
            <textarea
              value={s.customRag}
              onChange={(e) => s.setCustomRag(e.target.value)}
              rows={2}
              placeholder="직접 경험·근거 붙여넣기 (선택 — 옵시디언 노트 등)"
              className="mt-2 w-full resize-none rounded-md border border-border bg-card px-2 py-1.5 text-[11px] text-foreground outline-none focus:border-muted-foreground"
            />
            <button
              type="button"
              onClick={() => s.setRagConfirmed(true)}
              disabled={rLoading}
              className="mt-2 w-full rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-40"
            >
              이 경험으로 초안 작성 →
            </button>
          </div>

          {/* 크게보기 — 같은 store 공유라 켜고 끄기 동기화 */}
          {expanded && s.ragSources && s.ragSources.length > 0 && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
              onClick={() => setExpanded(false)}
            >
              <div
                className="relative flex h-[94vh] w-full max-w-7xl flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <Brain className="size-4 text-primary" />
                    <span className="text-sm font-semibold text-foreground">내 경험 — 직무 적합도 지도</span>
                    <span className="text-xs text-muted-foreground">· {chosenCand.target_company}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setExpanded(false)}
                    className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    aria-label="닫기"
                  >
                    <X className="size-4" />
                  </button>
                </div>
                <div className="relative flex-1">
                  <ExperienceNeurons
                    sources={s.ragSources}
                    coverage={s.coverage ?? []}
                    company={chosenCand.target_company}
                    activeKeys={s.ragActiveKeys}
                    onToggle={s.toggleRagKey}
                  />
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── 단계 2: 작성 — 경험 확정 시 ── */}
      {chosenCand && s.ragConfirmed && (
        <>
          <Arrow />
          <div className="w-80 shrink-0 space-y-3">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <FileText className="size-4 text-primary" /> 초안 작성
            </h2>
            <p className="text-xs text-muted-foreground">
              켜둔 경험 {activeNeuronCount}개{s.customRag.trim() ? " + 직접 근거" : ""}를 반영해요
            </p>
            {/* 항목 + 글자수 */}
            <div className="flex gap-2">
              <select
                value={s.category}
                onChange={(e) => s.setCategory(e.target.value)}
                className="flex-1 rounded-md border border-border bg-card px-2 py-1.5 text-xs text-foreground outline-none"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={50}
                max={2000}
                step={50}
                value={s.charLimit}
                onChange={(e) => s.setCharLimit(Number(e.target.value))}
                className="w-16 rounded-md border border-border bg-card px-2 py-1.5 text-xs text-foreground outline-none"
              />
              <span className="self-center text-xs text-muted-foreground">자</span>
            </div>

            <ModelSlots groups={groups} slots={s.writeSlots} setSlots={s.setWriteSlots} />
            <button
              type="button"
              onClick={write}
              disabled={!wValid.length || wLoading}
              className="w-full rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-40"
            >
              {wLoading ? (
                <span className="flex items-center justify-center gap-1.5">
                  <Loader2 className="size-3.5 animate-spin" /> 작성 중...
                </span>
              ) : (
                `${wValid.length || ""}개 작성`
              )}
            </button>
            {wError && <p className="text-xs text-red-500 dark:text-red-400">{wError}</p>}
            {s.writeCandidates && (
              <div className="space-y-2 border-t border-border pt-3">
                <p className="text-xs font-semibold text-foreground">초안 {s.writeCandidates.length}개 — 고르세요</p>
                {s.writeCandidates.map((c, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => s.setWriteChosen(i)}
                    className={`block w-full rounded-xl border p-3 text-left transition-all ${
                      s.writeChosen === i ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border bg-card hover:border-muted-foreground"
                    }`}
                  >
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="font-mono text-xs font-semibold text-foreground">{c.model}</span>
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        {c.char_count}자{s.writeChosen === i && <Check className="size-3.5 text-primary" />}
                      </span>
                    </div>
                    <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap font-sans text-[11px] leading-relaxed text-foreground">{c.content}</pre>
                  </button>
                ))}
              </div>
            )}
            {s.writeChosen !== null && (
              <p className="text-sm text-success">✓ 초안 선택 — 오른쪽에서 마무리해요 →</p>
            )}
          </div>
        </>
      )}

      {/* ── 마무리: 글자수 조정 · 저장 — 초안 택1 시 ── */}
      {chosenCand && chosenDraft && (
        <>
          <Arrow />
          <div className="w-80 shrink-0 space-y-3">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              <Ruler className="size-4 text-primary" /> 글자수 조정 · 저장
            </h2>
            {(() => {
              const len = finalContent.length;
              const lo = Math.floor(s.charLimit * 0.95);
              const hi = Math.ceil(s.charLimit * 1.05);
              const within = len >= lo && len <= hi;
              return (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">목표 {s.charLimit}자</span>
                  <span className={within ? "font-semibold text-success" : "font-semibold text-amber-600 dark:text-amber-400"}>
                    {len}자 {within ? "✓" : len > hi ? "(초과)" : "(부족)"}
                  </span>
                </div>
              );
            })()}
            <textarea
              value={finalContent}
              onChange={(e) => {
                setFinalContent(e.target.value);
                setSaved(false);
              }}
              rows={12}
              className="w-full resize-none rounded-md border border-border bg-card px-3 py-2 text-xs leading-relaxed text-foreground outline-none focus:border-muted-foreground"
            />
            <button
              type="button"
              onClick={adjust}
              disabled={adjusting}
              className="w-full rounded-lg border border-primary/40 bg-primary/5 px-3 py-2 text-xs font-semibold text-primary disabled:opacity-40"
            >
              {adjusting ? (
                <span className="flex items-center justify-center gap-1.5">
                  <Loader2 className="size-3.5 animate-spin" /> 조정 중...
                </span>
              ) : (
                `글자수 맞추기 (${chosenDraft.model})`
              )}
            </button>
            {adjMsg && <p className="text-[11px] text-muted-foreground">{adjMsg}</p>}
            <button
              type="button"
              onClick={save}
              disabled={saving || !finalContent.trim()}
              className="w-full rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-40"
            >
              {saving ? (
                <span className="flex items-center justify-center gap-1.5">
                  <Loader2 className="size-3.5 animate-spin" /> 저장 중...
                </span>
              ) : (
                "라이브러리에 저장"
              )}
            </button>
            {saved && (
              <p className="text-sm text-success">
                ✓ 저장 완료 —{" "}
                <a href="/library" className="underline">
                  라이브러리
                </a>
                에서 확인
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
