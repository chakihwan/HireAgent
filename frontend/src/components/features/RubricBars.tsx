"use client";

import { RUBRIC_LABELS } from "@/lib/types";

/** 평가 항목별 점수(0~2)를 막대그래프로 표시. */
export function RubricBars({ scores }: { scores: Record<string, number> }) {
  // 백엔드 루브릭 순서 유지
  const order = ["job_fit", "specificity", "authenticity", "flow", "readability"];
  const entries = order.filter((k) => k in scores).map((k) => [k, scores[k]] as const);
  if (entries.length === 0) return null;

  const colorFor = (v: number) =>
    v >= 2 ? "#22c55e" : v >= 1 ? "#f59e0b" : "#ef4444";

  return (
    <div className="grid gap-1.5">
      {entries.map(([key, v]) => (
        <div key={key} className="flex items-center gap-2">
          <span className="text-xs text-zinc-500 w-12 shrink-0">{RUBRIC_LABELS[key] ?? key}</span>
          <div className="flex-1 h-2 rounded-full bg-zinc-100 overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${(v / 2) * 100}%`, background: colorFor(v) }}
            />
          </div>
          <span className="text-xs font-medium tabular-nums w-6 text-right" style={{ color: colorFor(v) }}>
            {v.toFixed(0)}
          </span>
        </div>
      ))}
    </div>
  );
}
