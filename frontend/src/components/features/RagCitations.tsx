"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Sparkles } from "lucide-react";
import type { RagCitation } from "@/lib/types";

// source_type → 한글 라벨 (projects 페이지 SOURCE_LABELS와 동기화)
const SOURCE_LABELS: Record<string, string> = {
  resume: "이력서",
  essay: "기존 자소서",
  project_readme: "프로젝트 README",
  project_doc: "프로젝트 문서",
  custom: "기타 경험",
};

// 자소서 작성에 실제 참고한 RAG 청크 펼치기 (차별점: 근거 기반 작성 가시화)
export function RagCitations({ citations }: { citations: RagCitation[] }) {
  const [open, setOpen] = useState(false);
  if (!citations.length) return null;

  return (
    <div className="border-t border-border pt-2.5">
      <button
        onClick={() => setOpen((p) => !p)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        <Sparkles className="size-3 text-primary" />
        참고한 경험 {citations.length}개
      </button>
      {open && (
        <ul className="mt-2 space-y-1.5">
          {citations.map((c, i) => (
            <li key={i} className="text-xs border-l-2 border-primary/40 pl-2.5 py-0.5">
              <div className="mb-0.5 flex items-center gap-1.5 flex-wrap">
                <span className="font-medium text-foreground">
                  {SOURCE_LABELS[c.source_type] ?? c.source_type}
                </span>
                {c.project_name && (
                  <span className="text-muted-foreground">· {c.project_name}</span>
                )}
              </div>
              <p className="text-muted-foreground leading-relaxed line-clamp-2">{c.snippet}…</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
