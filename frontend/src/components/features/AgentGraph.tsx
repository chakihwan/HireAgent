"use client";

import { useCallback, useEffect } from "react";
import {
  ReactFlow,
  Background,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  BackgroundVariant,
  Handle,
  Position,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

// ── 타입 ────────────────────────────────────────────────────────

export type NodePhase = "idle" | "running" | "done" | "error";

export type NodeEventData = {
  node: "rag" | "write" | "compress" | "evaluate" | "jd_analyzer";
  category?: string;
  phase: "start" | "done" | "error";
  detail?: string;
  iteration?: number;
};

export type GraphEvent = NodeEventData;

// ── 노드 스타일 ──────────────────────────────────────────────────

const PHASE_STYLE: Record<NodePhase, React.CSSProperties> = {
  idle: {
    background: "#f4f4f5",
    border: "1.5px solid #d4d4d8",
    color: "#71717a",
  },
  running: {
    background: "#eff6ff",
    border: "1.5px solid #3b82f6",
    color: "#1d4ed8",
    boxShadow: "0 0 0 3px rgba(59,130,246,0.2)",
  },
  done: {
    background: "#f0fdf4",
    border: "1.5px solid #22c55e",
    color: "#15803d",
  },
  error: {
    background: "#fef2f2",
    border: "1.5px solid #ef4444",
    color: "#b91c1c",
  },
};

const PHASE_ICON: Record<NodePhase, string> = {
  idle: "○",
  running: "◌",
  done: "✓",
  error: "✗",
};

// ── 커스텀 노드 ─────────────────────────────────────────────────

type AgentNodeData = {
  label: string;
  sublabel?: string;
  phase: NodePhase;
};

function AgentNode({ data }: { data: AgentNodeData }) {
  const style = PHASE_STYLE[data.phase];
  const isRunning = data.phase === "running";

  return (
    <div
      style={{
        ...style,
        borderRadius: 8,
        padding: "8px 14px",
        minWidth: 110,
        fontSize: 12,
        transition: "all 0.25s ease",
        textAlign: "center",
      }}
    >
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <div style={{ fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
        <span style={isRunning ? { animation: "spin 1.2s linear infinite", display: "inline-block" } : {}}>
          {PHASE_ICON[data.phase]}
        </span>
        {data.label}
      </div>
      {data.sublabel && (
        <div style={{ fontSize: 10, opacity: 0.75, marginTop: 2 }}>{data.sublabel}</div>
      )}
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

const NODE_TYPES = { agentNode: AgentNode };

// ── 레이아웃 상수 ────────────────────────────────────────────────

const ITEM_W = 120;    // 항목 컬럼 폭
const ITEM_GAP = 20;   // 컬럼 간격
const ROW_H = 70;      // 노드 행 높이
const JD_X = 0;        // JD 노드 X 기준

// 항목 sub-node 행 순서
const SUB_NODES: Array<{ key: string; label: string }> = [
  { key: "rag",      label: "RAG 검색" },
  { key: "write",    label: "초안 작성" },
  { key: "compress", label: "글자수 조정" },
  { key: "evaluate", label: "자가 평가" },
];

// ── 초기 그래프 빌더 ────────────────────────────────────────────

function buildGraph(categories: string[]): { nodes: Node[]; edges: Edge[] } {
  const n = categories.length;
  const totalW = n * ITEM_W + (n - 1) * ITEM_GAP;
  const startX = JD_X - totalW / 2;

  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // JD 분석 노드 (중앙 상단)
  nodes.push({
    id: "jd_analyzer",
    type: "agentNode",
    position: { x: JD_X - 60, y: 0 },
    data: { label: "JD 분석", phase: "idle" } as AgentNodeData,
  });

  categories.forEach((cat, ci) => {
    const colX = startX + ci * (ITEM_W + ITEM_GAP);
    const catId = `cat-${ci}`;

    // 항목 헤더 노드
    nodes.push({
      id: catId,
      type: "agentNode",
      position: { x: colX, y: ROW_H * 1.5 },
      data: { label: cat, phase: "idle" } as AgentNodeData,
    });

    edges.push({
      id: `e-jd-${catId}`,
      source: "jd_analyzer",
      target: catId,
      animated: false,
      style: { stroke: "#d4d4d8" },
    });

    SUB_NODES.forEach(({ key, label }, si) => {
      const nodeId = `${catId}-${key}`;
      const prevId = si === 0 ? catId : `${catId}-${SUB_NODES[si - 1].key}`;

      nodes.push({
        id: nodeId,
        type: "agentNode",
        position: { x: colX, y: ROW_H * (si + 2.5) },
        data: { label, phase: "idle" } as AgentNodeData,
      });

      edges.push({
        id: `e-${prevId}-${nodeId}`,
        source: prevId,
        target: nodeId,
        animated: false,
        style: { stroke: "#d4d4d8" },
      });
    });
  });

  return { nodes, edges };
}

// ── 메인 컴포넌트 ────────────────────────────────────────────────

type Props = {
  categories: string[];
  events: GraphEvent[];
};

export function AgentGraph({ categories, events }: Props) {
  const { nodes: initNodes, edges: initEdges } = buildGraph(categories);
  const [nodes, setNodes, onNodesChange] = useNodesState(initNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initEdges);

  const updateNode = useCallback(
    (id: string, patch: Partial<AgentNodeData>) => {
      setNodes((prev) =>
        prev.map((n) =>
          n.id === id
            ? { ...n, data: { ...(n.data as AgentNodeData), ...patch } }
            : n,
        ),
      );
    },
    [setNodes],
  );

  const updateEdge = useCallback(
    (sourceId: string, animated: boolean, color: string) => {
      setEdges((prev) =>
        prev.map((e) =>
          e.source === sourceId
            ? { ...e, animated, style: { stroke: color } }
            : e,
        ),
      );
    },
    [setEdges],
  );

  // 이벤트 적용
  useEffect(() => {
    const last = events[events.length - 1];
    if (!last) return;

    if (last.node === "jd_analyzer") {
      if (last.phase === "start") updateNode("jd_analyzer", { phase: "running", sublabel: undefined });
      else if (last.phase === "done") {
        updateNode("jd_analyzer", { phase: "done", sublabel: last.detail });
        updateEdge("jd_analyzer", false, "#22c55e");
      }
      return;
    }

    const cat = last.category ?? "";
    const ci = categories.indexOf(cat);
    if (ci < 0) return;
    const catId = `cat-${ci}`;
    const nodeId = `${catId}-${last.node}`;

    if (last.phase === "start") {
      updateNode(catId, { phase: "running" });
      updateNode(nodeId, { phase: "running" });
      setEdges((prev) =>
        prev.map((e) =>
          e.target === nodeId
            ? { ...e, animated: true, style: { stroke: "#3b82f6" } }
            : e,
        ),
      );
    } else {
      const detail = last.iteration && last.iteration > 1
        ? `${last.detail} (${last.iteration}회차)`
        : last.detail;
      updateNode(nodeId, {
        phase: last.phase === "done" ? "done" : "error",
        sublabel: detail,
      });
      setEdges((prev) =>
        prev.map((e) =>
          e.target === nodeId
            ? { ...e, animated: false, style: { stroke: last.phase === "done" ? "#22c55e" : "#ef4444" } }
            : e,
        ),
      );
      if (last.node === "evaluate" && last.phase === "done") {
        updateNode(catId, { phase: "done", sublabel: last.detail });
        updateEdge("jd_analyzer", false, "#22c55e");
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, categories]);

  const graphH = (SUB_NODES.length + 3) * ROW_H + 20;

  return (
    <div style={{ height: graphH, width: "100%", borderRadius: 10, overflow: "hidden", border: "1px solid #e4e4e7", background: "#fafafa" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={NODE_TYPES}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        nodesDraggable={false}
        nodesConnectable={false}
        panOnDrag={false}
        zoomOnScroll={false}
        zoomOnPinch={false}
        preventScrolling={false}
        elementsSelectable={false}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#e4e4e7" />
      </ReactFlow>
    </div>
  );
}
