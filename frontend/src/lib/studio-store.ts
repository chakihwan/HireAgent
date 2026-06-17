import { create } from "zustand";
import type { JdAnalyzeCandidate, WriteCandidate } from "./api";

// 대화형 세션 상태 (ADR-031 ④) — 컴포넌트 언마운트(모드 전환)와 무관하게 유지.
export type ModelRef = { provider: string; model: string };

type StudioState = {
  // ── 단계 1: JD 분석 ──
  slots: (ModelRef | null)[];
  candidates: JdAnalyzeCandidate[] | null;
  chosen: number | null;
  // ── 단계 2: 작성 ──
  category: string;
  charLimit: number;
  writeSlots: (ModelRef | null)[];
  writeCandidates: WriteCandidate[] | null;
  writeChosen: number | null;
  // setters
  setSlots: (s: (ModelRef | null)[]) => void;
  setCandidates: (c: JdAnalyzeCandidate[] | null) => void;
  setChosen: (i: number | null) => void;
  setCategory: (c: string) => void;
  setCharLimit: (n: number) => void;
  setWriteSlots: (s: (ModelRef | null)[]) => void;
  setWriteCandidates: (c: WriteCandidate[] | null) => void;
  setWriteChosen: (i: number | null) => void;
  reset: () => void;
};

const INITIAL = {
  slots: [null, null] as (ModelRef | null)[],
  candidates: null as JdAnalyzeCandidate[] | null,
  chosen: null as number | null,
  category: "자기소개",
  charLimit: 500,
  writeSlots: [null, null] as (ModelRef | null)[],
  writeCandidates: null as WriteCandidate[] | null,
  writeChosen: null as number | null,
};

export const useStudioStore = create<StudioState>((set) => ({
  ...INITIAL,
  setSlots: (slots) => set({ slots }),
  setCandidates: (candidates) => set({ candidates }),
  setChosen: (chosen) => set({ chosen }),
  setCategory: (category) => set({ category }),
  setCharLimit: (charLimit) => set({ charLimit }),
  setWriteSlots: (writeSlots) => set({ writeSlots }),
  setWriteCandidates: (writeCandidates) => set({ writeCandidates }),
  setWriteChosen: (writeChosen) => set({ writeChosen }),
  reset: () => set({ ...INITIAL, slots: [null, null], writeSlots: [null, null] }),
}));
