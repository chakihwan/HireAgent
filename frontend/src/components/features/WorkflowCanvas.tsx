"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  BackgroundVariant,
  Handle,
  Position,
  MarkerType,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { AgentKey, ProviderConfig } from "@/lib/types";
import type { PipelineEvent } from "./PipelineView";

// ── 타입 ──────────────────────────────────────────────────────────

export type NodePhase = "idle" | "running" | "done" | "error";

type ConfigNodeData = {
  kind: "config";
  label: string; role: string; icon: string;
  hasLLM: boolean; agentKey?: AgentKey;
  config?: ProviderConfig;
  phase: NodePhase; detail: string; iterations: number;
  editable: boolean; ollamaModels: string[];
  onConfigChange?: (key: AgentKey, field: keyof ProviderConfig, value: string) => void;
};

// 항목별 에이전트 노드 (config + status 통합)
type ItemAgentNodeData = {
  kind: "itemAgent";
  label: string; role: string; icon: string;
  category: string; stepKey: string;
  agentKey?: AgentKey;
  config?: ProviderConfig;       // 이미 항목별 오버라이드 적용된 config
  isOverridden: boolean;         // 전역과 다른 설정이면 true
  phase: NodePhase; detail: string; iterations: number;
  editable: boolean; ollamaModels: string[];
  // 항목별 config 변경 콜백 (category + agentKey 이미 바인딩)
  onItemConfigChange?: (field: keyof ProviderConfig, value: string) => void;
};

type AnyNodeData = ConfigNodeData | ItemAgentNodeData;

// ── 스타일 ────────────────────────────────────────────────────────

const PHASE_BORDER: Record<NodePhase, string> = {
  idle: "#e4e4e7", running: "#3b82f6", done: "#22c55e", error: "#ef4444",
};
const PHASE_BG: Record<NodePhase, string> = {
  idle: "#fff", running: "#eff6ff", done: "#f0fdf4", error: "#fef2f2",
};
const PHASE_GLOW: Record<NodePhase, string> = {
  idle: "none",
  running: "0 0 0 4px rgba(59,130,246,0.15), 0 2px 12px rgba(0,0,0,0.08)",
  done: "0 2px 8px rgba(34,197,94,0.15)",
  error: "0 2px 8px rgba(239,68,68,0.15)",
};
const PHASE_DOT: Record<NodePhase, string> = {
  idle: "#d4d4d8", running: "#3b82f6", done: "#22c55e", error: "#ef4444",
};
const PHASE_TEXT: Record<NodePhase, string> = {
  idle: "대기", running: "실행 중...", done: "완료", error: "오류",
};

const CLOUD_MODELS: Record<string, string[]> = {
  anthropic: ["claude-haiku-4-5-20251001", "claude-sonnet-4-6", "claude-opus-4-8"],
  openai:    ["gpt-4.1-mini", "gpt-4o-mini", "gpt-4.1", "gpt-4o", "o4-mini"],
  google:    ["gemini-2.0-flash", "gemini-2.5-flash", "gemini-2.5-pro"],
};
const PROVIDER_LABEL: Record<string, string> = {
  ollama: "Ollama", anthropic: "Anthropic", openai: "OpenAI", google: "Google",
};

// ── 공통 모델 설정 UI ─────────────────────────────────────────────

function ModelConfig({
  nodeId, agentKey, config, editable, ollamaModels, onChange,
}: {
  nodeId: string;
  agentKey?: AgentKey;
  config?: ProviderConfig;
  editable: boolean;
  ollamaModels: string[];
  onChange?: (field: keyof ProviderConfig, value: string) => void;
}) {
  if (!config || !agentKey) {
    return <div style={{ fontSize: 10, color: "#a1a1aa", padding: "2px 0 4px" }}>KURE-v1 벡터 검색</div>;
  }
  const listId = `ml-${nodeId}`;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <div>
        <div style={{ fontSize: 9, fontWeight: 700, color: "#a1a1aa", letterSpacing: "0.07em", marginBottom: 2 }}>PROVIDER</div>
        {editable ? (
          <select
            className="nodrag nopan"
            value={config.provider}
            onChange={(e) => onChange?.("provider", e.target.value)}
            style={{ width: "100%", padding: "4px 6px", borderRadius: 6, border: "1.5px solid #e4e4e7", fontSize: 11, background: "#fafafa", cursor: "pointer", outline: "none" }}
          >
            {["ollama","anthropic","openai","google"].map((p) => (
              <option key={p} value={p}>{PROVIDER_LABEL[p]}</option>
            ))}
          </select>
        ) : (
          <div style={{ fontSize: 11, color: "#52525b", fontWeight: 500 }}>{PROVIDER_LABEL[config.provider] ?? config.provider}</div>
        )}
      </div>
      <div>
        <div style={{ fontSize: 9, fontWeight: 700, color: "#a1a1aa", letterSpacing: "0.07em", marginBottom: 2 }}>MODEL</div>
        {editable ? (
          <>
            <input
              className="nodrag nopan"
              list={listId}
              value={config.model}
              onChange={(e) => onChange?.("model", e.target.value)}
              placeholder="모델명 입력 또는 선택"
              style={{ width: "100%", padding: "4px 6px", borderRadius: 6, border: "1.5px solid #e4e4e7", fontSize: 10, fontFamily: "monospace", background: "#fafafa", outline: "none", boxSizing: "border-box" }}
            />
            <datalist id={listId}>
              {(config.provider === "ollama"
                ? (ollamaModels.length ? ollamaModels : [config.model])
                : (CLOUD_MODELS[config.provider] ?? [])
              ).map((m) => <option key={m} value={m} />)}
            </datalist>
          </>
        ) : (
          <div style={{ fontSize: 10, color: "#52525b", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{config.model}</div>
        )}
      </div>
    </div>
  );
}

// ── 공통 상태 표시 ────────────────────────────────────────────────

function StatusRow({ phase, detail, iterations }: { phase: NodePhase; detail: string; iterations: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, paddingTop: 6, borderTop: "1px solid #f4f4f5", marginTop: 4 }}>
      <span style={{
        width: 7, height: 7, borderRadius: "50%", display: "inline-block", flexShrink: 0,
        background: PHASE_DOT[phase],
        animation: phase === "running" ? "pulseDot 1.2s infinite" : "none",
      }} />
      <span style={{ fontSize: 11, fontWeight: 600, color: PHASE_DOT[phase] }}>{PHASE_TEXT[phase]}</span>
      {iterations > 1 && (
        <span style={{ fontSize: 9, fontWeight: 700, background: "#fef3c7", color: "#d97706", borderRadius: 4, padding: "1px 5px", marginLeft: 2 }}>
          {iterations}회차
        </span>
      )}
      {detail && (
        <span style={{ fontSize: 10, color: "#a1a1aa", marginLeft: "auto", textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 70 }}>
          {detail}
        </span>
      )}
    </div>
  );
}

// ── JD 분석 노드 (큰 config 노드) ────────────────────────────────

function ConfigNode({ data: d }: NodeProps) {
  const data = d as ConfigNodeData;
  return (
    <div style={{
      width: 220, borderRadius: 14,
      border: `2px solid ${PHASE_BORDER[data.phase]}`,
      background: PHASE_BG[data.phase],
      boxShadow: PHASE_GLOW[data.phase],
      transition: "border-color 0.25s, box-shadow 0.25s, background 0.25s",
      fontFamily: "inherit",
    }}>
      <Handle type="target" position={Position.Left} style={{ opacity: 0, pointerEvents: "none" }} />
      <div style={{ padding: "12px 14px 10px", borderBottom: "1px solid #f4f4f5" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 24 }}>{data.icon}</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: "#18181b" }}>{data.label}</div>
            <div style={{ fontSize: 10, color: "#a1a1aa", marginTop: 1 }}>{data.role}</div>
          </div>
        </div>
      </div>
      <div style={{ padding: "10px 14px 12px" }}>
        <ModelConfig
          nodeId={`cfg-${data.agentKey ?? "rag"}`}
          agentKey={data.agentKey} config={data.config}
          editable={data.editable} ollamaModels={data.ollamaModels}
          onChange={data.agentKey
            ? (field, value) => data.onConfigChange?.(data.agentKey!, field as keyof ProviderConfig, value)
            : undefined}
        />
        <StatusRow phase={data.phase} detail={data.detail} iterations={data.iterations} />
      </div>
      <Handle type="source" position={Position.Right} style={{ opacity: 0, pointerEvents: "none" }} />
      <style>{`@keyframes pulseDot{0%,100%{opacity:1}50%{opacity:0.25}}`}</style>
    </div>
  );
}

// ── 항목별 에이전트 노드 (config + status 통합) ───────────────────

function ItemAgentNode({ data: d }: NodeProps) {
  const data = d as ItemAgentNodeData;
  return (
    <div style={{
      width: 175, borderRadius: 12,
      border: `2px solid ${PHASE_BORDER[data.phase]}`,
      background: PHASE_BG[data.phase],
      boxShadow: PHASE_GLOW[data.phase],
      transition: "border-color 0.25s, box-shadow 0.25s, background 0.25s",
      fontFamily: "inherit",
    }}>
      <Handle type="target" position={Position.Left} style={{ opacity: 0, pointerEvents: "none" }} />
      <div style={{ padding: "10px 12px 8px", borderBottom: "1px solid #f4f4f5" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ fontSize: 18 }}>{data.icon}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 12, color: "#18181b" }}>{data.label}</div>
            <div style={{ fontSize: 10, color: "#a1a1aa", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{data.category}</div>
          </div>
        </div>
      </div>
      <div style={{ padding: "8px 12px 10px" }}>
        {data.isOverridden && data.editable && (
          <div style={{ fontSize: 9, color: "#7c3aed", fontWeight: 700, marginBottom: 4, background: "#f5f3ff", borderRadius: 4, padding: "1px 5px", display: "inline-block" }}>
            ★ 항목 전용 설정
          </div>
        )}
        <ModelConfig
          nodeId={`${data.category}-${data.stepKey}`}
          agentKey={data.agentKey} config={data.config}
          editable={data.editable} ollamaModels={data.ollamaModels}
          onChange={data.onItemConfigChange}
        />
        <StatusRow phase={data.phase} detail={data.detail} iterations={data.iterations} />
      </div>
      <Handle type="source" position={Position.Right} style={{ opacity: 0, pointerEvents: "none" }} />
    </div>
  );
}

const NODE_TYPES = { configNode: ConfigNode, itemAgentNode: ItemAgentNode };

// ── 파이프라인 정의 ────────────────────────────────────────────────

const ABSTRACT_PIPELINE = [
  { id: "jd_analyzer",  label: "JD 분석",    role: "공고 분석 · 회사명 추출",  icon: "📋", agentKey: "jd_analyzer"  as AgentKey },
  { id: "rag",          label: "RAG 검색",   role: "경험 자료 검색 (KURE-v1)", icon: "🔍", agentKey: undefined },
  { id: "essay_writer", label: "초안 작성",   role: "자소서 초안 생성",         icon: "✍️", agentKey: "essay_writer" as AgentKey },
  { id: "compressor",   label: "글자수 조정", role: "최대 3회 압축 · 확장",     icon: "✂️", agentKey: "compressor"   as AgentKey },
  { id: "evaluator",    label: "자가 평가",   role: "품질 점수 · 개선 피드백",  icon: "⭐", agentKey: "evaluator"    as AgentKey },
];

const ITEM_STEPS = [
  { key: "rag",      sseKey: "rag",      label: "RAG 검색",   icon: "🔍", agentKey: undefined },
  { key: "write",    sseKey: "write",    label: "초안 작성",   icon: "✍️", agentKey: "essay_writer" as AgentKey },
  { key: "compress", sseKey: "compress", label: "글자수 조정", icon: "✂️", agentKey: "compressor"   as AgentKey },
  { key: "evaluate", sseKey: "evaluate", label: "자가 평가",   icon: "⭐", agentKey: "evaluator"    as AgentKey },
];

const CFG_W = 220; const CFG_GAP_X = 70;
const ITEM_W = 175; const ITEM_GAP_X = 40; const ITEM_ROW_H = 175;
const JD_X = 0; const ITEM_START_X = CFG_W + CFG_GAP_X;

function mkEdge(id: string, src: string, tgt: string, color = "#e4e4e7", animated = false): Edge {
  return {
    id, source: src, target: tgt,
    type: "smoothstep", animated,
    markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color },
    style: { stroke: color, strokeWidth: 2 },
  };
}

function buildAbstractGraph(
  configs: Record<AgentKey, ProviderConfig>,
  editable: boolean, ollamaModels: string[],
  onChange?: (key: AgentKey, field: keyof ProviderConfig, value: string) => void,
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = ABSTRACT_PIPELINE.map((m, i) => ({
    id: m.id, type: "configNode",
    position: { x: i * (CFG_W + CFG_GAP_X), y: 0 },
    data: {
      kind: "config", label: m.label, role: m.role, icon: m.icon,
      hasLLM: !!m.agentKey, agentKey: m.agentKey,
      config: m.agentKey ? configs[m.agentKey] : undefined,
      phase: "idle", detail: "", iterations: 0,
      editable, ollamaModels, onConfigChange: onChange,
    } as ConfigNodeData,
  }));
  const edges = ABSTRACT_PIPELINE.slice(0, -1).map((m, i) =>
    mkEdge(`ae-${i}`, m.id, ABSTRACT_PIPELINE[i + 1].id),
  );
  return { nodes, edges };
}

function buildParallelGraph(
  categories: string[],
  configs: Record<AgentKey, ProviderConfig>,
  itemConfigs: Record<string, Partial<Record<AgentKey, ProviderConfig>>>,
  editable: boolean, ollamaModels: string[],
  onChange?: (key: AgentKey, field: keyof ProviderConfig, value: string) => void,
  onItemChange?: (category: string, key: AgentKey, field: keyof ProviderConfig, value: string) => void,
): { nodes: Node[]; edges: Edge[] } {
  const n = categories.length;
  const totalH = n * ITEM_ROW_H;
  const jdY = Math.max(0, (totalH - 200) / 2);

  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // JD 분석 (왼쪽, 세로 중앙)
  nodes.push({
    id: "jd_analyzer", type: "configNode",
    position: { x: JD_X, y: jdY },
    data: {
      kind: "config", label: "JD 분석", role: "공고 분석 · 회사명 추출", icon: "📋",
      hasLLM: true, agentKey: "jd_analyzer",
      config: configs.jd_analyzer,
      phase: "idle", detail: "", iterations: 0,
      editable, ollamaModels, onConfigChange: onChange,
    } as ConfigNodeData,
  });

  categories.forEach((cat, ci) => {
    const rowY = ci * ITEM_ROW_H;

    ITEM_STEPS.forEach((step, si) => {
      const nodeId = `${cat}:${step.key}`;
      const x = ITEM_START_X + si * (ITEM_W + ITEM_GAP_X);

      const globalCfg = step.agentKey ? configs[step.agentKey] : undefined;
      const itemOverride = step.agentKey ? (itemConfigs[cat]?.[step.agentKey]) : undefined;
      const effectiveCfg = itemOverride ?? globalCfg;
      const isOverridden = !!itemOverride;

      nodes.push({
        id: nodeId, type: "itemAgentNode",
        position: { x, y: rowY },
        data: {
          kind: "itemAgent",
          label: step.label, icon: step.icon,
          category: cat, stepKey: step.key,
          agentKey: step.agentKey,
          config: effectiveCfg,
          isOverridden,
          phase: "idle", detail: "", iterations: 0,
          editable, ollamaModels,
          onItemConfigChange: step.agentKey
            ? (field, value) => onItemChange?.(cat, step.agentKey!, field as keyof ProviderConfig, value)
            : undefined,
        } as ItemAgentNodeData,
      });

      if (si === 0) {
        edges.push(mkEdge(`e-jd:${cat}`, "jd_analyzer", nodeId));
      } else {
        const prevId = `${cat}:${ITEM_STEPS[si - 1].key}`;
        edges.push(mkEdge(`e-${prevId}:${nodeId}`, prevId, nodeId));
      }
    });
  });

  return { nodes, edges };
}

// ── 이벤트 → 노드 ID 매핑 ────────────────────────────────────────

const SSE_TO_STEP: Record<string, string> = {
  rag: "rag", write: "write", compress: "compress", evaluate: "evaluate",
};

// ── 노드 데이터 업데이트 헬퍼 ────────────────────────────────────

function patchNodeData<T extends object>(prev: Node[], id: string, patch: Partial<T>): Node[] {
  return prev.map((nd) => nd.id === id ? { ...nd, data: { ...(nd.data as T), ...patch } } : nd);
}

function patchEdgeStyle(prev: Edge[], targetId: string, color: string, animated: boolean): Edge[] {
  return prev.map((e) =>
    e.target === targetId
      ? { ...e, animated, style: { stroke: color, strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color } }
      : e,
  );
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────

type Props = {
  categories: string[];
  configs: Record<AgentKey, ProviderConfig>;                          // 전역 기본 설정
  itemConfigs: Record<string, Partial<Record<AgentKey, ProviderConfig>>>;  // 항목별 오버라이드
  events: PipelineEvent[];
  editable: boolean;
  ollamaModels: string[];
  onConfigChange?: (key: AgentKey, field: keyof ProviderConfig, value: string) => void;
  onItemConfigChange?: (category: string, key: AgentKey, field: keyof ProviderConfig, value: string) => void;
};

export function WorkflowCanvas({ categories, configs, itemConfigs, events, editable, ollamaModels, onConfigChange, onItemConfigChange }: Props) {
  const onChangeRef = useRef(onConfigChange);
  onChangeRef.current = onConfigChange;
  const onItemChangeRef = useRef(onItemConfigChange);
  onItemChangeRef.current = onItemConfigChange;

  const stableChange = useCallback(
    (key: AgentKey, field: keyof ProviderConfig, value: string) => onChangeRef.current?.(key, field, value),
    [],
  );
  const stableItemChange = useCallback(
    (cat: string, key: AgentKey, field: keyof ProviderConfig, value: string) => onItemChangeRef.current?.(cat, key, field, value),
    [],
  );

  const isParallel = categories.length > 0;
  const { nodes: initNodes, edges: initEdges } = isParallel
    ? buildParallelGraph(categories, configs, itemConfigs, editable, ollamaModels, stableChange, stableItemChange)
    : buildAbstractGraph(configs, editable, ollamaModels, stableChange);

  const [nodes, setNodes, onNodesChange] = useNodesState(initNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initEdges);

  // 그래프 구조 재빌드 (categories / editable 변경)
  useEffect(() => {
    const { nodes: n, edges: e } = isParallel
      ? buildParallelGraph(categories, configs, itemConfigs, editable, ollamaModels, stableChange, stableItemChange)
      : buildAbstractGraph(configs, editable, ollamaModels, stableChange);
    setNodes(n); setEdges(e);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories.join(","), editable]);

  // configs / itemConfigs / ollamaModels 변경 → config 데이터 업데이트
  useEffect(() => {
    setNodes((prev) => prev.map((nd) => {
      const d = nd.data as AnyNodeData;
      if (d.kind === "config") {
        const cd = d as ConfigNodeData;
        return { ...nd, data: { ...cd, config: cd.agentKey ? configs[cd.agentKey] : undefined, editable, ollamaModels, onConfigChange: stableChange } };
      }
      if (d.kind === "itemAgent") {
        const id = d as ItemAgentNodeData;
        if (!id.agentKey) return nd;
        const override = itemConfigs[id.category]?.[id.agentKey];
        const effectiveCfg = override ?? configs[id.agentKey];
        return { ...nd, data: { ...id, config: effectiveCfg, isOverridden: !!override, editable, ollamaModels, onItemConfigChange: (field: keyof ProviderConfig, value: string) => stableItemChange(id.category, id.agentKey!, field, value) } };
      }
      return nd;
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configs, itemConfigs, editable, ollamaModels]);

  // SSE 이벤트 → 노드·엣지 실시간 업데이트
  useEffect(() => {
    const last = events[events.length - 1];
    if (!last) return;

    if (last.node === "jd_analyzer") {
      const phase: NodePhase = last.phase === "start" ? "running" : last.phase === "done" ? "done" : "error";
      setNodes((prev) => patchNodeData<ConfigNodeData>(prev, "jd_analyzer", { phase, detail: last.detail ?? "" }));
      if (last.phase !== "start") {
        const color = phase === "done" ? "#22c55e" : "#ef4444";
        setEdges((prev) => prev.map((e) =>
          e.source === "jd_analyzer" ? { ...e, animated: false, style: { stroke: color, strokeWidth: 2 }, markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color } } : e,
        ));
      }
      return;
    }

    const stepKey = SSE_TO_STEP[last.node];
    if (!stepKey) return;

    // done 이벤트 → 다음 스텝 running으로 자동 전환
    const NEXT_STEP: Record<string, string> = {
      rag: "write", write: "compress", compress: "compress", // compress는 반복 가능
    };

    // 추상 그래프 모드
    if (!isParallel) {
      const nodeId = last.node === "write" ? "essay_writer" : last.node === "compress" ? "compressor" : last.node === "evaluate" ? "evaluator" : last.node;
      const phase: NodePhase = last.phase === "start" ? "running" : last.phase === "done" ? "done" : "error";
      setNodes((prev) => patchNodeData<ConfigNodeData>(prev, nodeId, { phase, detail: last.detail ?? "", iterations: last.iteration ?? 0 }));
      const color = last.phase === "start" ? "#3b82f6" : phase === "done" ? "#22c55e" : "#ef4444";
      setEdges((prev) => patchEdgeStyle(prev, nodeId, color, last.phase === "start"));
      return;
    }

    // 병렬 그래프 모드 — category 필수
    if (!last.category) return;
    const nodeId = `${last.category}:${stepKey}`;
    const phase: NodePhase = last.phase === "start" ? "running" : last.phase === "done" ? "done" : "error";
    const detail = last.phase !== "start" ? (last.detail ?? "") : "";
    setNodes((prev) => patchNodeData<ItemAgentNodeData>(prev, nodeId, { phase, detail, iterations: last.iteration ?? 0 }));
    const color = last.phase === "start" ? "#3b82f6" : phase === "done" ? "#22c55e" : "#ef4444";
    setEdges((prev) => patchEdgeStyle(prev, nodeId, color, last.phase === "start"));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events]);

  return (
    <ReactFlow
      nodes={nodes} edges={edges}
      onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
      nodeTypes={NODE_TYPES}
      fitView fitViewOptions={{ padding: 0.28, maxZoom: 0.95 }}
      nodesDraggable={true} nodesConnectable={false}
      panOnScroll={false} panOnDrag={[1, 2]}
      zoomOnScroll={true} zoomOnPinch={true}
      elementsSelectable={false}
      minZoom={0.2} maxZoom={1.5}
      proOptions={{ hideAttribution: true }}
    >
      <Background variant={BackgroundVariant.Dots} gap={28} size={1.2} color="#e8e8e8" />
      <Controls showInteractive={false} position="bottom-left" />
      <MiniMap
        nodeColor={(nd) => {
          const d = nd.data as AnyNodeData;
          const phase = d.kind === "config" ? (d as ConfigNodeData).phase : (d as ItemAgentNodeData).phase;
          return PHASE_DOT[phase];
        }}
        position="bottom-right"
        style={{ borderRadius: 10, border: "1px solid #e4e4e7" }}
        maskColor="rgba(255,255,255,0.8)"
      />
    </ReactFlow>
  );
}
