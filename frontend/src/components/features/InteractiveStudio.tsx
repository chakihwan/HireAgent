"use client";

import { useState } from "react";
import { Loader2, Check, Sparkles } from "lucide-react";
import { runJdAnalyze, type JdAnalyzeCandidate } from "@/lib/api";

// 대화형 단계 실행 (ADR-031 B1) — JD 분석을 N개 모델로 돌려 후보를 비교·택1.
// 첫 단계: JD 분석만. 선택 후 다음 노드 연결은 단계 C에서.
export function InteractiveStudio({
  jd,
  ollamaModels,
}: {
  jd: string;
  ollamaModels: string[];
}) {
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [candidates, setCandidates] = useState<JdAnalyzeCandidate[] | null>(null);
  const [chosen, setChosen] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canRun = selectedModels.length > 0 && jd.trim().length >= 10 && !loading;

  function toggleModel(m: string) {
    setSelectedModels((p) => (p.includes(m) ? p.filter((x) => x !== m) : [...p, m]));
  }

  async function analyze() {
    if (!canRun) return;
    setLoading(true);
    setError(null);
    setCandidates(null);
    setChosen(null);
    try {
      const r = await runJdAnalyze({
        job_description: jd,
        models: selectedModels.map((m) => ({ provider: "ollama", model: m })),
      });
      setCandidates(r.candidates);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8 space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <Sparkles className="size-5 text-primary" /> 대화형 — JD 분석
        </h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          여러 모델로 공고를 분석하고, 가장 잘 분석한 것을 직접 고르세요.
        </p>
      </div>

      {jd.trim().length < 10 && (
        <p className="rounded-lg border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
          ← 왼쪽 사이드바에 채용 공고를 먼저 붙여넣어 주세요.
        </p>
      )}

      {/* 모델 선택 (설치된 ollama) */}
      <div>
        <p className="mb-2 text-[13px] font-semibold text-foreground">
          분석할 모델 {selectedModels.length > 0 && `(${selectedModels.length}개)`}
        </p>
        {ollamaModels.length === 0 ? (
          <p className="text-xs text-muted-foreground">설치된 ollama 모델이 없어요. 모델 관리에서 받아주세요.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {ollamaModels.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => toggleModel(m)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                  selectedModels.includes(m)
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-card text-foreground hover:bg-muted"
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={analyze}
        disabled={!canRun}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors disabled:opacity-40"
      >
        {loading ? (
          <span className="flex items-center gap-1.5">
            <Loader2 className="size-4 animate-spin" /> 분석 중...
          </span>
        ) : (
          `${selectedModels.length || ""}개 모델로 분석 실행`
        )}
      </button>

      {error && <p className="text-sm text-red-500 dark:text-red-400">{error}</p>}

      {/* 후보 카드 — 비교·택1 */}
      {candidates && (
        <div className="space-y-3">
          <p className="text-[13px] font-semibold text-foreground">
            분석 후보 — 가장 정확한 걸 고르세요
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            {candidates.map((c, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setChosen(i)}
                className={`rounded-xl border p-4 text-left transition-all ${
                  chosen === i
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "border-border bg-card hover:border-muted-foreground"
                }`}
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-mono text-xs font-semibold text-foreground">{c.model}</span>
                  {chosen === i && <Check className="size-4 text-primary" />}
                </div>
                <p className="mb-1 text-xs text-muted-foreground">회사: {c.target_company}</p>
                <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap font-sans text-xs leading-relaxed text-muted-foreground">
                  {c.jd_analysis}
                </pre>
              </button>
            ))}
          </div>
          {chosen !== null && (
            <p className="text-sm text-success">
              ✓ {candidates[chosen].model}의 분석을 선택했어요 (다음 단계 연결은 곧 추가됩니다).
            </p>
          )}
        </div>
      )}
    </div>
  );
}
