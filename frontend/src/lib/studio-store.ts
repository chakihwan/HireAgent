import { create } from "zustand";
import type { JdAnalyzeCandidate, RagSource, WriteCandidate } from "./api";

// 대화형 세션 상태 (ADR-031 ④) — 컴포넌트 언마운트(모드 전환)와 무관하게 유지.
export type ModelRef = { provider: string; model: string };

type StudioState = {
  // ── 단계 1: JD 분석 ──
  slots: (ModelRef | null)[];
  candidates: JdAnalyzeCandidate[] | null;
  chosen: number | null;
  // ── 단계 D: 내 경험(뉴런) 큐레이션 ──
  ragSources: RagSource[] | null;
  ragActiveKeys: string[]; // 켜둔 뉴런(프로젝트) 키 — 작성에 인용
  ragConfirmed: boolean; // "이 경험으로 작성" 확정 → 작성 컬럼 노출
  customRag: string; // 직접 붙여넣은 근거 (옵시디언 노트 등)
  // ── 단계 2: 작성 (항목·글자수) ──
  category: string;
  charLimit: number;
  // ── 작성 슬롯/후보 ──
  writeSlots: (ModelRef | null)[];
  writeCandidates: WriteCandidate[] | null;
  writeChosen: number | null;
  // setters
  setSlots: (s: (ModelRef | null)[]) => void;
  setCandidates: (c: JdAnalyzeCandidate[] | null) => void;
  setChosen: (i: number | null) => void;
  setCategory: (c: string) => void;
  setCharLimit: (n: number) => void;
  setRagSources: (s: RagSource[] | null) => void;
  setRagActiveKeys: (keys: string[]) => void;
  toggleRagKey: (key: string) => void;
  setRagConfirmed: (b: boolean) => void;
  resetRag: () => void; // JD 후보 바꿀 때 내 경험 초기화
  setCustomRag: (s: string) => void;
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
  ragSources: null as RagSource[] | null,
  ragActiveKeys: [] as string[],
  ragConfirmed: false,
  customRag: "",
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
  setRagSources: (ragSources) => set({ ragSources }),
  setRagActiveKeys: (ragActiveKeys) => set({ ragActiveKeys }),
  toggleRagKey: (key) =>
    set((s) => ({
      ragActiveKeys: s.ragActiveKeys.includes(key)
        ? s.ragActiveKeys.filter((k) => k !== key)
        : [...s.ragActiveKeys, key],
    })),
  setRagConfirmed: (ragConfirmed) => set({ ragConfirmed }),
  resetRag: () =>
    set({ ragSources: null, ragActiveKeys: [], ragConfirmed: false, customRag: "" }),
  setCustomRag: (customRag) => set({ customRag }),
  setWriteSlots: (writeSlots) => set({ writeSlots }),
  setWriteCandidates: (writeCandidates) => set({ writeCandidates }),
  setWriteChosen: (writeChosen) => set({ writeChosen }),
  reset: () =>
    set({ ...INITIAL, slots: [null, null], writeSlots: [null, null], ragActiveKeys: [] }),
}));
