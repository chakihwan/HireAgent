"use client";

import { useState } from "react";
import { Loader2, Check, Sparkles, ArrowRight } from "lucide-react";
import { runJdAnalyze, type JdAnalyzeCandidate } from "@/lib/api";
import { useCloudModels } from "@/lib/queries";

const PROVIDER_LABEL: Record<string, string> = {
  ollama: "로컬 (Ollama)",
  anthropic: "Claude",
  openai: "GPT",
  google: "Gemini",
};

type ModelRef = { provider: string; model: string };

// 대화형 단계 실행 (ADR-031 B1) — JD 분석을 N개 모델로 돌려 후보를 비교·택1.
// 레이아웃: 각 단계 = 세로 칼럼(후보 스택), 칼럼들이 좌→우로 늘어남.
export function InteractiveStudio({
  jd,
  ollamaModels,
}: {
  jd: string;
  ollamaModels: string[];
}) {
  const cloudModelsQ = useCloudModels();
  const cloudModels = cloudModelsQ.data ?? {};

  // 로컬 + 등록된 클라우드 키의 모델을 provider 그룹으로
  const groups: { provider: string; models: string[] }[] = [
    { provider: "ollama", models: ollamaModels },
    ...Object.entries(cloudModels).map(([provider, models]) => ({ provider, models })),
  ].filter((g) => g.models.length > 0);

  const [selected, setSelected] = useState<ModelRef[]>([]);
  const [candidates, setCandidates] = useState<JdAnalyzeCandidate[] | null>(null);
  const [chosen, setChosen] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canRun = selected.length > 0 && jd.trim().length >= 10 && !loading;
  const isSel = (p: string, m: string) => selected.some((s) => s.provider === p && s.model === m);

  function toggle(provider: string, model: string) {
    setSelected((prev) =>
      isSel(provider, model)
        ? prev.filter((s) => !(s.provider === provider && s.model === model))
        : [...prev, { provider, model }],
    );
  }

  async function analyze() {
    if (!canRun) return;
    setLoading(true);
    setError(null);
    setCandidates(null);
    setChosen(null);
    try {
      const r = await runJdAnalyze({ job_description: jd, models: selected });
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
          <p className="mt-0.5 text-xs text-muted-foreground">여러 모델로 분석 → 가장 정확한 것 택1</p>
        </div>

        {jd.trim().length < 10 && (
          <p className="rounded-lg border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
            ← 사이드바에 공고를 먼저 붙여넣어 주세요.
          </p>
        )}

        {/* 모델 선택 (provider 그룹: 로컬 + 클라우드) */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-foreground">
            모델 {selected.length > 0 && `(${selected.length}개)`}
          </p>
          {groups.length === 0 ? (
            <p className="text-xs text-muted-foreground">사용 가능한 모델이 없어요. 모델 관리에서 받거나 API 키를 등록하세요.</p>
          ) : (
            groups.map((g) => (
              <div key={g.provider}>
                <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {PROVIDER_LABEL[g.provider] ?? g.provider}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {g.models.map((m) => (
                    <button
                      key={`${g.provider}:${m}`}
                      type="button"
                      onClick={() => toggle(g.provider, m)}
                      className={`rounded-md border px-2 py-1 text-xs font-medium transition-colors ${
                        isSel(g.provider, m)
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border bg-card text-foreground hover:bg-muted"
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
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
            `${selected.length || ""}개 모델로 분석`
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
