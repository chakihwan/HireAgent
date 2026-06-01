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

// ── 타입 ─────────────────────────────────────────────────────────

export type NodePhase = "idle" | "running" | "done" | "error";

type ConfigNodeData = {
  kind: "config";
  label: string;
  role: string;
  icon: string;
  hasLLM: boolean;
  agentKey?: AgentKey;
  config?: ProviderConfig;
  editable: boolean;
  ollamaModels: string[];
  onConfigChange?: (key: AgentKey, field: keyof ProviderConfig, value: string) => void;
};

type StatusNodeData = {
  kind: "status";
  category: string;
  step: "rag" | "write" | "compress" | "evaluate";
  stepLabel: string;
  icon: string;
  phase: NodePhase;
  detail: string;
};

type AnyNodeData = ConfigNodeData | StatusNodeData;

// ── 스타일 ────────────────────────────────────────────────────────

const PHASE_BORDER: Record<NodePhase, string> = {
  idle: "#e4e4e7", running: "#3b82f6", done: "#22c55e", error: "#ef4444",
};
const PHASE_BG: Record<NodePhase, string> = {
  idle: "#fff", running: "#eff6ff", done: "#f0fdf4", error: "#fef2f2",
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

// ── 설정 노드 (프로바이더·모델 드롭다운 포함) ───────────────────

function ConfigNode({ data: d }: NodeProps) {
  const data = d as ConfigNodeData;
  return (
    <div style={{
      width: 230, borderRadius: 14,
      border: `2px solid ${data.hasLLM ? "#e4e4e7" : "#f0abfc"}`,
      background: data.hasLLM ? "#fff" : "#fdf4ff",
      boxShadow: "0 2px 10px rgba(0,0,0,0.06)",
      fontFamily: "inherit",
    }}>
      <Handle type="target" position={Position.Left} style={{ opacity: 0, pointerEvents: "none" }} />

      <div style={{ padding: "12px 14px 10px", borderBottom: "1px solid #f4f4f5" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 24 }}>{data.icon}</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 14, color: "#18181b" }}>{data.label}</div>
            <div style={{ fontSize: 11, color: "#a1a1aa", marginTop: 1 }}>{data.role}</div>
          </div>
        </div>
      </div>

      <div style={{ padding: "10px 14px 12px" }}>
        {data.hasLLM && data.config ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#a1a1aa", letterSpacing: "0.06em", marginBottom: 3 }}>PROVIDER</div>
              {data.editable ? (
                <select
                  className="nodrag nopan"
                  value={data.config.provider}
                  onChange={(e) => data.onConfigChange?.(data.agentKey!, "provider", e.target.value)}
                  style={{ width: "100%", padding: "5px 7px", borderRadius: 7, border: "1.5px solid #e4e4e7", fontSize: 12, background: "#fafafa", cursor: "pointer", outline: "none" }}
                >
                  {["ollama","anthropic","openai","google"].map((p) => (
                    <option key={p} value={p}>{PROVIDER_LABEL[p]}</option>
                  ))}
                </select>
              ) : (
                <div style={{ fontSize: 12, color: "#52525b" }}>{PROVIDER_LABEL[data.config.provider]}</div>
              )}
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#a1a1aa", letterSpacing: "0.06em", marginBottom: 3 }}>MODEL</div>
              {data.editable ? (
                <>
                  <input
                    className="nodrag nopan"
                    list={`ml-${data.agentKey}`}
                    value={data.config.model}
                    onChange={(e) => data.onConfigChange?.(data.agentKey!, "model", e.target.value)}
                    placeholder="모델명 입력 또는 선택"
                    style={{ width: "100%", padding: "5px 7px", borderRadius: 7, border: "1.5px solid #e4e4e7", fontSize: 11, fontFamily: "monospace", background: "#fafafa", outline: "none", boxSizing: "border-box" }}
                  />
                  <datalist id={`ml-${data.agentKey}`}>
                    {(data.config.provider === "ollama"
                      ? (data.ollamaModels.length ? data.ollamaModels : [data.config.model])
                      : (CLOUD_MODELS[data.config.provider] ?? [])
                    ).map((m) => <option key={m} value={m} />)}
                  </datalist>
                </>
              ) : (
                <div style={{ fontSize: 11, color: "#52525b", fontFamily: "monospace" }}>{data.config.model}</div>
              )}
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 11, color: "#a1a1aa" }}>KURE-v1 벡터 임베딩 검색</div>
        )}
      </div>

      <Handle type="source" position={Position.Right} style={{ opacity: 0, pointerEvents: "none" }} />
    </div>
  );
}

// ── 상태 노드 (항목별 각 단계 실행 상태) ─────────────────────────

function StatusNode({ data: d }: NodeProps) {
  const data = d as StatusNodeData;
  const isRunning = data.phase === "running";
  return (
    <div style={{
      width: 150, borderRadius: 10,
      border: `2px solid ${PHASE_BORDER[data.phase]}`,
      background: PHASE_BG[data.phase],
      boxShadow: isRunning ? "0 0 0 4px rgba(59,130,246,0.12)" : "0 1px 4px rgba(0,0,0,0.05)",
      transition: "all 0.2s ease",
      padding: "10px 12px",
      fontFamily: "inherit",
    }}>
      <Handle type="target" position={Position.Left} style={{ opacity: 0, pointerEvents: "none" }} />
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <span style={{ fontSize: 16 }}>{data.icon}</span>
        <div style={{ fontWeight: 600, fontSize: 12, color: "#18181b" }}>{data.stepLabel}</div>
      </div>
      <div style={{ fontSize: 10, color: "#a1a1aa", marginBottom: 5 }}>{data.category}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <span style={{
          width: 7, height: 7, borderRadius: "50%", display: "inline-block",
          background: PHASE_DOT[data.phase],
          animation: isRunning ? "pulseDot 1.2s infinite" : "none",
        }} />
        <span style={{ fontSize: 11, fontWeight: 600, color: PHASE_DOT[data.phase] }}>{PHASE_TEXT[data.phase]}</span>
      </div>
      {data.detail && (
        <div style={{ fontSize: 10, color: "#a1a1aa", marginTop: 4 }}>{data.detail}</div>
      )}
      <Handle type="source" position={Position.Right} style={{ opacity: 0, pointerEvents: "none" }} />
      <style>{`@keyframes pulseDot{0%,100%{opacity:1}50%{opacity:0.25}}`}</style>
    </div>
  );
}

const NODE_TYPES = { configNode: ConfigNode, statusNode: StatusNode };

// ── 그래프 빌더 ────────────────────────────────────────────────────

const ABSTRACT_PIPELINE = [
  { id: "jd_analyzer",  label: "JD 분석",    role: "공고 분석 · 회사명 추출",      icon: "📋", hasLLM: true,  agentKey: "jd_analyzer"  as AgentKey },
  { id: "rag",          label: "RAG 검색",   role: "유사 경험 자료 검색",          icon: "🔍", hasLLM: false, agentKey: undefined },
  { id: "essay_writer", label: "초안 작성",   role: "자소서 초안 생성",             icon: "✍️", hasLLM: true,  agentKey: "essay_writer" as AgentKey },
  { id: "compressor",   label: "글자수 조정", role: "목표 글자수 압축 · 확장",      icon: "✂️", hasLLM: true,  agentKey: "compressor"   as AgentKey },
  { id: "evaluator",    label: "자가 평가",   role: "품질 점수 · 개선 피드백",      icon: "⭐", hasLLM: true,  agentKey: "evaluator"    as AgentKey },
];

const ITEM_STEPS = [
  { key: "rag",      label: "RAG 검색",   icon: "🔍" },
  { key: "write",    label: "초안 작성",   icon: "✍️" },
  { key: "compress", label: "글자수 조정", icon: "✂️" },
  { key: "evaluate", label: "자가 평가",   icon: "⭐" },
];

const CFG_W = 230; const CFG_H = 200; const CFG_GAP_X = 80;
const ST_W  = 150; const ST_H  = 110; const ST_GAP_X = 50; const ST_GAP_Y = 30;
const START_X = 0; const FAN_X = CFG_W + CFG_GAP_X * 2;

function buildAbstractGraph(
  configs: Record<AgentKey, ProviderConfig>,
  editable: boolean,
  ollamaModels: string[],
  onChange?: (key: AgentKey, field: keyof ProviderConfig, value: string) => void,
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = ABSTRACT_PIPELINE.map((m, i) => ({
    id: m.id,
    type: "configNode",
    position: { x: i * (CFG_W + CFG_GAP_X), y: 0 },
    data: {
      kind: "config", label: m.label, role: m.role, icon: m.icon,
      hasLLM: m.hasLLM, agentKey: m.agentKey,
      config: m.agentKey ? configs[m.agentKey] : undefined,
      editable, ollamaModels, onConfigChange: onChange,
    } satisfies ConfigNodeData,
  }));
  const edges: Edge[] = ABSTRACT_PIPELINE.slice(0, -1).map((m, i) => ({
    id: `ae-${m.id}`,
    source: m.id, target: ABSTRACT_PIPELINE[i + 1].id,
    type: "smoothstep", animated: false,
    markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: "#d4d4d8" },
    style: { stroke: "#d4d4d8", strokeWidth: 2 },
  }));
  return { nodes, edges };
}

function buildParallelGraph(
  categories: string[],
  configs: Record<AgentKey, ProviderConfig>,
  editable: boolean,
  ollamaModels: string[],
  onChange?: (key: AgentKey, field: keyof ProviderConfig, value: string) => void,
): { nodes: Node[]; edges: Edge[] } {
  const n = categories.length;
  const rowH = ST_H + ST_GAP_Y;
  const totalH = n * rowH;
  const jdY = (totalH - CFG_H) / 2;

  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // JD 분석 노드 (왼쪽, 세로 중앙)
  nodes.push({
    id: "jd_analyzer",
    type: "configNode",
    position: { x: START_X, y: jdY },
    data: {
      kind: "config", label: "JD 분석", role: "공고 분석 · 회사명 추출", icon: "📋",
      hasLLM: true, agentKey: "jd_analyzer",
      config: configs.jd_analyzer,
      editable, ollamaModels, onConfigChange: onChange,
    } satisfies ConfigNodeData,
  });

  // 항목별 병렬 파이프라인
  categories.forEach((cat, ci) => {
    const rowY = ci * rowH;

    ITEM_STEPS.forEach((step, si) => {
      const nodeId = `${cat}-${step.key}`;
      const x = FAN_X + si * (ST_W + ST_GAP_X);
      nodes.push({
        id: nodeId,
        type: "statusNode",
        position: { x, y: rowY },
        data: {
          kind: "status",
          category: cat,
          step: step.key as StatusNodeData["step"],
          stepLabel: step.label,
          icon: step.icon,
          phase: "idle",
          detail: "",
        } satisfies StatusNodeData,
      });

      if (si === 0) {
        // JD Analyzer → 첫 번째 스텝
        edges.push({
          id: `e-jd-${cat}`,
          source: "jd_analyzer", target: nodeId,
          type: "smoothstep", animated: false,
          markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: "#d4d4d8" },
          style: { stroke: "#d4d4d8", strokeWidth: 1.5 },
        });
      } else {
        // 스텝 → 다음 스텝
        const prevId = `${cat}-${ITEM_STEPS[si - 1].key}`;
        edges.push({
          id: `e-${prevId}-${nodeId}`,
          source: prevId, target: nodeId,
          type: "smoothstep", animated: false,
          markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: "#d4d4d8" },
          style: { stroke: "#d4d4d8", strokeWidth: 1.5 },
        });
      }
    });
  });

  return { nodes, edges };
}

// ── SSE 이벤트 → 노드 ID 매핑 ────────────────────────────────────

const SSE_STEP_KEY: Record<string, string> = {
  rag: "rag", write: "write", compress: "compress", evaluate: "evaluate",
};

// ── 메인 컴포넌트 ─────────────────────────────────────────────────

type Props = {
  categories: string[];
  configs: Record<AgentKey, ProviderConfig>;
  events: PipelineEvent[];
  editable: boolean;
  ollamaModels: string[];
  onConfigChange?: (key: AgentKey, field: keyof ProviderConfig, value: string) => void;
};

export function WorkflowCanvas({ categories, configs, events, editable, ollamaModels, onConfigChange }: Props) {
  const onChangeRef = useRef(onConfigChange);
  onChangeRef.current = onConfigChange;

  const stableChange = useCallback(
    (key: AgentKey, field: keyof ProviderConfig, value: string) => onChangeRef.current?.(key, field, value),
    [],
  );

  const isParallel = categories.length > 0;

  const { nodes: initNodes, edges: initEdges } = isParallel
    ? buildParallelGraph(categories, configs, editable, ollamaModels, stableChange)
    : buildAbstractGraph(configs, editable, ollamaModels, stableChange);

  const [nodes, setNodes, onNodesChange] = useNodesState(initNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initEdges);

  // 그래프 구조 재빌드 (categories / editable 변경 시)
  useEffect(() => {
    const { nodes: n, edges: e } = isParallel
      ? buildParallelGraph(categories, configs, editable, ollamaModels, stableChange)
      : buildAbstractGraph(configs, editable, ollamaModels, stableChange);
    setNodes(n);
    setEdges(e);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories.join(","), editable]);

  // configs / ollamaModels 변경 → configNode 데이터만 업데이트
  useEffect(() => {
    setNodes((prev) =>
      prev.map((nd) => {
        if ((nd.data as AnyNodeData).kind !== "config") return nd;
        const d = nd.data as ConfigNodeData;
        return {
          ...nd,
          data: {
            ...d,
            config: d.agentKey ? configs[d.agentKey] : undefined,
            editable,
            ollamaModels,
            onConfigChange: stableChange,
          },
        };
      }),
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configs, editable, ollamaModels]);

  // SSE 이벤트 → 상태 노드 업데이트
  useEffect(() => {
    const last = events[events.length - 1];
    if (!last) return;

    if (last.node === "jd_analyzer") {
      setNodes((prev) =>
        prev.map((nd) =>
          nd.id === "jd_analyzer"
            ? { ...nd, data: { ...(nd.data as AnyNodeData), ...(last.phase === "start" ? {} : {}) } }
            : nd,
        ),
      );
      return;
    }

    const stepKey = SSE_STEP_KEY[last.node];
    if (!stepKey || !last.category) return;

    const nodeId = `${last.category}-${stepKey}`;
    const detail = last.iteration && last.iteration > 1
      ? `${last.detail} (${last.iteration}회차)` : (last.detail ?? "");

    setNodes((prev) =>
      prev.map((nd) =>
        nd.id === nodeId
          ? {
              ...nd,
              data: {
                ...(nd.data as StatusNodeData),
                phase: last.phase === "start" ? "running" : last.phase === "done" ? "done" : "error",
                detail: last.phase === "start" ? "" : detail,
              },
            }
          : nd,
      ),
    );

    const edgeColor = last.phase === "start" ? "#3b82f6" : last.phase === "done" ? "#22c55e" : "#ef4444";
    setEdges((prev) =>
      prev.map((e) =>
        e.target === nodeId
          ? {
              ...e, animated: last.phase === "start",
              style: { stroke: edgeColor, strokeWidth: 1.5 },
              markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: edgeColor },
            }
          : e,
      ),
    );

    // jd_analyzer 완료 → 출발 엣지 색상 갱신
    if (last.node === "rag" && last.phase === "done") {
      setEdges((prev) =>
        prev.map((e) =>
          e.source === "jd_analyzer" && e.target === `${last.category}-rag`
            ? { ...e, animated: false, style: { stroke: "#22c55e", strokeWidth: 1.5 }, markerEnd: { type: MarkerType.ArrowClosed, width: 14, height: 14, color: "#22c55e" } }
            : e,
        ),
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={NODE_TYPES}
      fitView
      fitViewOptions={{ padding: 0.25, maxZoom: 1 }}
      nodesDraggable={true}
      nodesConnectable={false}
      panOnScroll={false}
      panOnDrag={[1, 2]}
      zoomOnScroll={true}
      zoomOnPinch={true}
      elementsSelectable={false}
      minZoom={0.25}
      maxZoom={1.5}
      proOptions={{ hideAttribution: true }}
    >
      <Background variant={BackgroundVariant.Dots} gap={28} size={1.2} color="#e8e8e8" />
      <Controls showInteractive={false} position="bottom-left" />
      <MiniMap
        nodeColor={(nd) => {
          const d = nd.data as AnyNodeData;
          if (d.kind === "config") return "#94a3b8";
          return PHASE_DOT[(d as StatusNodeData).phase];
        }}
        position="bottom-right"
        style={{ borderRadius: 10, border: "1px solid #e4e4e7" }}
        maskColor="rgba(255,255,255,0.8)"
      />
    </ReactFlow>
  );
}
