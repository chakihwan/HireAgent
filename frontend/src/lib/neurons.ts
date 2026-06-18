import type { RagSource } from "./api";

// "내 경험" 뉴런 — 하나의 프로젝트 = 하나의 경험 = 하나의 뉴런 (ADR-031 D).
// 검색된 청크를 project_name으로 묶어, 옵시디언 그래프처럼 직무 중심 방사형으로 시각화한다.

export const SOURCE_LABELS: Record<string, string> = {
  resume: "이력서",
  essay: "기존 자소서",
  project_readme: "README",
  project_doc: "문서",
  custom: "기타",
};

export const SOURCE_ICON: Record<string, string> = {
  resume: "📄",
  essay: "📝",
  project_readme: "📦",
  project_doc: "📑",
  custom: "🗂️",
};

// 이 유사도 이상이면 기본으로 켜둔다 (직무와 가까운 경험 자동 활성).
export const SIM_THRESHOLD = 0.4;

export type Neuron = {
  key: string; // 프로젝트명 또는 source_type 기반 (그룹 식별자)
  label: string; // 화면 표시 이름
  sourceType: string; // 대표 출처 (아이콘용)
  chunks: RagSource[]; // 이 경험에 속한 청크들 (작성 시 전부 rag_context로)
  similarity: number; // 청크 중 최대 유사도 (= 직무 적합도)
};

// 그룹 식별자 — project_name 우선, 없으면(이력서 등) source_type. coverage 매칭과 공유.
export function neuronKey(projectName: string | null | undefined, sourceType: string): string {
  return projectName?.trim() || `__${sourceType}`;
}

// 청크 → 뉴런 그룹. project_name이 없으면(이력서 등) source_type으로 묶는다.
export function groupNeurons(sources: RagSource[]): Neuron[] {
  const map = new Map<string, Neuron>();
  for (const s of sources) {
    const name = s.project_name?.trim();
    const key = neuronKey(s.project_name, s.source_type);
    const label = name || SOURCE_LABELS[s.source_type] || s.source_type;
    const ex = map.get(key);
    if (ex) {
      ex.chunks.push(s);
      ex.similarity = Math.max(ex.similarity, s.similarity);
    } else {
      map.set(key, { key, label, sourceType: s.source_type, chunks: [s], similarity: s.similarity });
    }
  }
  // 각 경험 안의 청크도 유사도순 (위성 배치·미리보기 순서용).
  for (const n of map.values()) n.chunks.sort((a, b) => b.similarity - a.similarity);
  // 직무 적합도(유사도) 높은 순 — 방사형에서 중심 가까이 배치.
  return [...map.values()].sort((a, b) => b.similarity - a.similarity);
}

// 임계값 이상 뉴런을 기본 활성. 전부 미달이면 최상위 1개만 켠다(빈손 방지).
export function defaultActiveKeys(neurons: Neuron[]): string[] {
  const active = neurons.filter((n) => n.similarity >= SIM_THRESHOLD).map((n) => n.key);
  if (active.length === 0 && neurons.length) return [neurons[0].key];
  return active;
}
