import { create } from "zustand";
import type { JdAnalyzeCandidate } from "./api";

// 대화형 세션 상태 (ADR-031 ④) — 컴포넌트 언마운트(모드 전환)와 무관하게 유지.
export type ModelRef = { provider: string; model: string };

type StudioState = {
  slots: (ModelRef | null)[];
  candidates: JdAnalyzeCandidate[] | null;
  chosen: number | null;
  setSlots: (s: (ModelRef | null)[]) => void;
  setCandidates: (c: JdAnalyzeCandidate[] | null) => void;
  setChosen: (i: number | null) => void;
  reset: () => void;
};

const INITIAL = {
  slots: [null, null] as (ModelRef | null)[],
  candidates: null,
  chosen: null,
};

export const useStudioStore = create<StudioState>((set) => ({
  ...INITIAL,
  setSlots: (slots) => set({ slots }),
  setCandidates: (candidates) => set({ candidates }),
  setChosen: (chosen) => set({ chosen }),
  reset: () => set({ ...INITIAL, slots: [null, null] }),
}));
