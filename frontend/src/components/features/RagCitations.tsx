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

// 청크 하나 — 출처·프로젝트·유사도 + 스니펫(클릭 시 전체 펼치기)
function CitationItem({ c }: { c: RagCitation }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <li className="border-l-2 border-primary/40 pl-2.5 py-0.5 text-xs">
      <div className="mb-0.5 flex items-center gap-1.5 flex-wrap">
        <span className="font-medium text-foreground">
          {SOURCE_LABELS[c.source_type] ?? c.source_type}
        </span>
        {c.project_name && (
          <span className="text-muted-foreground">· {c.project_name}</span>
        )}
        {/* 유사도 = 왜 이 청크가 뽑혔나 (공고·항목과의 의미적 거리) */}
        <span className="ml-auto rounded bg-info/10 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-info">
          유사도 {c.similarity.toFixed(2)}
        </span>
      </div>
      <p
        onClick={() => setExpanded((p) => !p)}
        className={`cursor-pointer leading-relaxed text-muted-foreground transition-colors hover:text-foreground/80 ${
          expanded ? "" : "line-clamp-2"
        }`}
        title={expanded ? "접기" : "클릭하면 전체 보기"}
      >
        {c.snippet}
        {!expanded && "…"}
      </p>
    </li>
  );
}

// 자소서 작성에 실제 참고한 RAG 청크 펼치기 (차별점: 근거 기반 작성 가시화)
export function RagCitations({ citations }: { citations: RagCitation[] }) {
  const [open, setOpen] = useState(false);
  if (!citations.length) return null;

  return (
    <div className="border-t border-border pt-2.5">
      <button
        onClick={() => setOpen((p) => !p)}
        className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        <Sparkles className="size-3 text-primary" />
        참고한 경험 {citations.length}개
      </button>
      {open && (
        <>
          <p className="mt-1.5 text-[10px] text-muted-foreground">
            공고·항목과 의미적으로 가까운 순 · 스니펫 클릭하면 전체 보기
          </p>
          <ul className="mt-1.5 space-y-2">
            {citations.map((c, i) => (
              <CitationItem key={i} c={c} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
