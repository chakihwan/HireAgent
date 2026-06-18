"use client";

import { useEffect, useState } from "react";
import { Loader2, Check, Sparkles, ArrowRight, Minus, Plus, FileText, Brain } from "lucide-react";
import { runJdAnalyze, runWrite, runRagSearch, runCoverage } from "@/lib/api";
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

  const jdValid = s.slots.filter((x): x is ModelRef => x !== null);
  const wValid = s.writeSlots.filter((x): x is ModelRef => x !== null);
  const chosenCand = s.chosen !== null && s.candidates ? s.candidates[s.chosen] : null;

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
          <div className="flex w-[28rem] shrink-0 flex-col">
            <div className="mb-2 flex items-start justify-between">
              <div>
                <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                  <Brain className="size-4 text-primary" /> 내 경험
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  직무 요구별로 내 경험이 얼마나 받쳐주는지 · 클릭해 켜고 끄기
                </p>
              </div>
              <button
                type="button"
                onClick={() => loadRag(chosenCand.jd_analysis)}
                disabled={rLoading}
                className="shrink-0 text-[11px] text-primary hover:underline disabled:opacity-40"
              >
                {rLoading ? "검색 중..." : "다시 검색"}
              </button>
            </div>

            {/* 뉴런 캔버스 */}
            <div className="relative h-[22rem] overflow-hidden rounded-xl border border-border bg-card">
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
              <p className="text-sm text-success">✓ 초안 선택 완료 (글자수 조정·저장은 다음 단계)</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
