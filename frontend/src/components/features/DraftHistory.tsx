"use client";

import { useState } from "react";
import type { DraftHistoryEntry } from "@/lib/types";

const STEP_LABEL: Record<DraftHistoryEntry["step"], string> = {
  write: "초안 작성",
  compress: "글자수 조정",
};

const STEP_ICON: Record<DraftHistoryEntry["step"], string> = {
  write: "✍️",
  compress: "✂️",
};

function charStatus(count: number, target: number) {
  const ratio = count / target;
  if (ratio > 1.05) return { label: `${count}자 (초과 +${count - target}자)`, color: "#ef4444" };
  if (ratio < 0.95) return { label: `${count}자 (부족 ${count - target}자)`, color: "#f59e0b" };
  return { label: `${count}자 (목표 달성)`, color: "#22c55e" };
}

export function DraftHistory({
  history,
  target,
}: {
  history: DraftHistoryEntry[];
  target: number;
}) {
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  if (history.length === 0) return null;

  return (
    <div className="border-t border-zinc-100 pt-3 mt-1">
      <p className="text-xs font-semibold text-zinc-500 mb-2">
        단계별 이력 ({history.length}단계)
      </p>
      <div className="space-y-1.5">
        {history.map((entry, i) => {
          const status = charStatus(entry.char_count, target);
          const isOpen = openIdx === i;
          const isLast = i === history.length - 1;

          return (
            <div
              key={i}
              className="rounded-lg border overflow-hidden"
              style={{ borderColor: isLast ? "#d1fae5" : "#f4f4f5" }}
            >
              {/* 헤더 — 클릭으로 토글 */}
              <button
                onClick={() => setOpenIdx(isOpen ? null : i)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-zinc-50 transition-colors"
                style={{ background: isLast ? "#f0fdf4" : undefined }}
              >
                <span className="text-sm">{STEP_ICON[entry.step]}</span>
                <span className="text-xs font-medium text-zinc-700">
                  {STEP_LABEL[entry.step]}
                  {entry.step === "compress" && entry.iteration > 2
                    ? ` (${entry.iteration - 1}회차)`
                    : ""}
                </span>
                <span
                  className="text-xs ml-auto tabular-nums"
                  style={{ color: status.color }}
                >
                  {status.label}
                </span>
                <span className="text-zinc-400 text-xs ml-1">{isOpen ? "▲" : "▼"}</span>
              </button>

              {/* 본문 — 펼치면 표시 */}
              {isOpen && (
                <div className="px-3 pb-3 pt-1 border-t border-zinc-100">
                  {/* 글자수 진행 바 */}
                  <div className="flex items-center gap-2 mb-2">
                    <div className="flex-1 h-1.5 rounded-full bg-zinc-100 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min((entry.char_count / target) * 100, 110)}%`,
                          background: status.color,
                        }}
                      />
                    </div>
                    <span className="text-xs text-zinc-400 tabular-nums shrink-0">
                      목표 {target}자
                    </span>
                  </div>
                  <p className="text-xs text-zinc-600 leading-relaxed whitespace-pre-wrap">
                    {entry.content}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
