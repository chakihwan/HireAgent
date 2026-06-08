"use client";

/**
 * 자소서 생성 SSE 로직 + 결과 상태를 캡슐화한 훅.
 * generate 페이지에서 생성 관련 상태(로그/결과/파이프라인 이벤트/저장)를 분리해
 * 페이지는 입력·검증·네비게이션만 담당하게 한다.
 */
import { useCallback, useRef, useState } from "react";
import { generateEssays, type EssayGenerateRequest } from "@/lib/api";
import type { DraftResult, SseDoneEvent } from "@/lib/types";
import type { PipelineEvent } from "@/components/features/WorkflowCanvas";

export type LogEntry = {
  id: string;
  type: "start" | "progress" | "error";
  message: string;
};

export function useEssayGeneration() {
  const [log, setLog] = useState<LogEntry[]>([]);
  const [results, setResults] = useState<DraftResult[]>([]);
  const [genError, setGenError] = useState<string | null>(null);
  const [pipelineEvents, setPipelineEvents] = useState<PipelineEvent[]>([]);
  const [savedIds, setSavedIds] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [editedContents, setEditedContents] = useState<Record<string, string>>({});
  const logEndRef = useRef<HTMLDivElement>(null);

  const appendLog = useCallback((type: LogEntry["type"], message: string) => {
    setLog((prev) => [...prev, { id: crypto.randomUUID(), type, message }]);
    setTimeout(() => logEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }, []);

  /** 검증 실패 등으로 생성 전에 에러만 표시할 때. */
  const fail = useCallback((message: string) => setGenError(message), []);

  /** 결과/로그/에러 초기화 (재시작용). */
  const reset = useCallback(() => {
    setResults([]);
    setLog([]);
    setGenError(null);
    setPipelineEvents([]);
  }, []);

  /**
   * SSE 생성 실행. done 이벤트 시 onDone 콜백 호출 (페이지가 step 전환).
   * @param categories 항목 카테고리 목록 (JD 분석 완료 후 RAG start 이벤트 주입용)
   */
  const run = useCallback(
    async (
      request: EssayGenerateRequest,
      categories: string[],
      onDone?: () => void,
      onError?: () => void,
    ): Promise<void> => {
      setLog([]);
      setResults([]);
      setGenError(null);
      setEditedContents({});
      setPipelineEvents([{ node: "jd_analyzer", phase: "start" }]);

      let succeeded = false;
      try {
        await generateEssays(request, (event, data) => {
          if (event === "start") {
            const d = data as { message: string; total_items: number };
            appendLog("start", `${d.message} (${d.total_items}개 항목)`);
          } else if (event === "progress") {
            const d = data as { node: string; message: string };
            appendLog("progress", d.message);
            if (d.node === "jd_analyzer" && d.message.includes("공고 분석 완료")) {
              setPipelineEvents((prev) => [
                ...prev,
                { node: "jd_analyzer", phase: "done", detail: d.message.split("—")[1]?.trim() ?? "" },
                ...categories.map((c) => ({ node: "rag" as const, category: c, phase: "start" as const })),
              ]);
            }
          } else if (event === "node_event") {
            setPipelineEvents((prev) => [...prev, data as PipelineEvent]);
          } else if (event === "error") {
            const d = data as { message: string };
            appendLog("error", d.message);
            setGenError(d.message);
          } else if (event === "done") {
            const d = data as SseDoneEvent;
            setResults(d.drafts);
            succeeded = true;
            onDone?.();
          }
        });
        // 스트림이 done 없이 끝남 = 실패/중단 → 호출자에게 알려 생성 상태(step) 해제
        if (!succeeded) onError?.();
      } catch (e) {
        setGenError(e instanceof Error ? e.message : String(e));
        onError?.();
      }
    },
    [appendLog],
  );

  return {
    // 상태
    log, results, genError, pipelineEvents, savedIds, saving, editedContents, logEndRef,
    // 세터 (결과 패널에서 사용)
    setSavedIds, setSaving, setEditedContents, setGenError,
    // 액션
    run, fail, reset,
  };
}
