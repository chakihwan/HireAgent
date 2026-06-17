"use client";

import { useState } from "react";
import { Loader2, Check, Sparkles, ArrowRight, Minus, Plus } from "lucide-react";
import { runJdAnalyze, type JdAnalyzeCandidate } from "@/lib/api";
import { useCloudModels } from "@/lib/queries";

// optgroup 라벨 (로컬/클라우드 + 비용 표시)
const PROVIDER_LABEL: Record<string, string> = {
  ollama: "💻 로컬 · Ollama (무료)",
  anthropic: "☁️ Claude (API 비용)",
  openai: "☁️ GPT (API 비용)",
  google: "☁️ Gemini (API 비용)",
};

const MAX_RUNS = 5;
type ModelRef = { provider: string; model: string };

// 대화형 단계 실행 (ADR-031 B1) — JD 분석을 N번(각 슬롯 모델 지정) 돌려 후보를 비교·택1.
// 흐름: 횟수 입력 → N개 슬롯에 모델 배정(중복 가능) → 분석 → 후보 세로 스택 → 택1.
export function InteractiveStudio({
  jd,
  ollamaModels,
}: {
  jd: string;
  ollamaModels: string[];
}) {
  const cloudModelsQ = useCloudModels();
  const cloudModels = cloudModelsQ.data ?? {};

  // 드롭다운용 provider 그룹 (로컬 먼저)
  const groups: { provider: string; models: string[] }[] = [
    { provider: "ollama", models: ollamaModels },
    ...Object.entries(cloudModels).map(([provider, models]) => ({ provider, models })),
  ].filter((g) => g.models.length > 0);

  const [slots, setSlots] = useState<(ModelRef | null)[]>([null, null]);
  const [candidates, setCandidates] = useState<JdAnalyzeCandidate[] | null>(null);
  const [chosen, setChosen] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validSlots = slots.filter((s): s is ModelRef => s !== null);
  const canRun = validSlots.length > 0 && jd.trim().length >= 10 && !loading;

  function setCount(n: number) {
    const next = Math.max(1, Math.min(MAX_RUNS, n));
    setSlots((prev) => {
      const arr = [...prev];
      while (arr.length < next) arr.push(null);
      arr.length = next;
      return arr;
    });
  }

  function setSlot(i: number, value: string) {
    if (!value) return;
    const [provider, ...rest] = value.split(":");
    const ref = { provider, model: rest.join(":") };
    setSlots((prev) => prev.map((s, idx) => (idx === i ? ref : s)));
  }

  async function analyze() {
    if (!canRun) return;
    setLoading(true);
    setError(null);
    setCandidates(null);
    setChosen(null);
    try {
      const r = await runJdAnalyze({ job_description: jd, models: validSlots });
      setCandidates(r.candidates);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    // 좌→우 칼럼 흐름 (가로 스크롤). 각 칼럼 = 한 단계.
    <div className="flex h-full gap-4 overflow-x-auto p-6">
      {/* ── 단계 1: JD 분석 칼럼 ── */}
      <div className="w-80 shrink-0 space-y-3">
        <div>
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <Sparkles className="size-4 text-primary" /> JD 분석
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">N번 분석 → 가장 정확한 것 택1</p>
        </div>

        {jd.trim().length < 10 && (
          <p className="rounded-lg border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
            ← 사이드바에 공고를 먼저 붙여넣어 주세요.
          </p>
        )}

        {/* 횟수 입력 */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-foreground">분석 횟수</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setCount(slots.length - 1)}
              disabled={slots.length <= 1}
              className="flex size-6 items-center justify-center rounded-md border border-border bg-card text-foreground hover:bg-muted disabled:opacity-40"
            >
              <Minus className="size-3.5" />
            </button>
            <span className="w-6 text-center text-sm font-semibold tabular-nums text-foreground">{slots.length}</span>
            <button
              type="button"
              onClick={() => setCount(slots.length + 1)}
              disabled={slots.length >= MAX_RUNS}
              className="flex size-6 items-center justify-center rounded-md border border-border bg-card text-foreground hover:bg-muted disabled:opacity-40"
            >
              <Plus className="size-3.5" />
            </button>
          </div>
        </div>

        {/* 슬롯별 모델 선택 (중복 가능) */}
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

        <button
          type="button"
          onClick={analyze}
          disabled={!canRun}
          className="w-full rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition-colors disabled:opacity-40"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-1.5">
              <Loader2 className="size-3.5 animate-spin" /> 분석 중...
            </span>
          ) : (
            `${validSlots.length || ""}개 분석 실행`
          )}
        </button>

        {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}

        {/* 후보 세로 스택 */}
        {candidates && (
          <div className="space-y-2 border-t border-border pt-3">
            <p className="text-xs font-semibold text-foreground">후보 {candidates.length}개 — 고르세요</p>
            {candidates.map((c, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setChosen(i)}
                className={`block w-full rounded-xl border p-3 text-left transition-all ${
                  chosen === i
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "border-border bg-card hover:border-muted-foreground"
                }`}
              >
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="font-mono text-xs font-semibold text-foreground">{c.model}</span>
                  {chosen === i && <Check className="size-3.5 text-primary" />}
                </div>
                <p className="mb-1 text-[11px] text-muted-foreground">회사: {c.target_company}</p>
                <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap font-sans text-[11px] leading-relaxed text-muted-foreground">
                  {c.jd_analysis}
                </pre>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── 선택되면 다음 단계 칼럼이 오른쪽에 (단계 C 예정) ── */}
      {chosen !== null && (
        <>
          <div className="flex shrink-0 items-center text-muted-foreground">
            <ArrowRight className="size-5" />
          </div>
          <div className="flex w-80 shrink-0 flex-col items-center justify-center rounded-xl border-2 border-dashed border-border p-4 text-center">
            <p className="text-sm font-medium text-foreground">초안 작성</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {candidates![chosen].model}의 분석을 받아
              <br />
              여러 모델로 작성 (곧 추가)
            </p>
          </div>
        </>
      )}
    </div>
  );
}
