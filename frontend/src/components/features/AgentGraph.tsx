"use client";

import { useCallback, useEffect, useRef } from "react";
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
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { AgentKey, ProviderConfig } from "@/lib/types";

// ── 이벤트 타입 (백엔드 SSE) ─────────────────────────────────────

export type NodePhase = "idle" | "running" | "done" | "error";

export type NodeEventData = {
  node: "rag" | "write" | "compress" | "evaluate" | "jd_analyzer";
  category?: string;
  phase: "start" | "done" | "error";
  detail?: string;
  iteration?: number;
};

export type GraphEvent = NodeEventData;

// ── 상수 ────────────────────────────────────────────────────────

const PROVIDERS = ["ollama", "anthropic", "openai", "google"] as const;

const PROVIDER_LABEL: Record<string, string> = {
  ollama: "Ollama",
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
};

const PROVIDER_MODELS: Record<string, string[]> = {
  ollama: ["exaone3.5:7.8b", "gemma4:e4b", "llama3.1:8b", "qwen2.5:7b"],
  anthropic: ["claude-haiku-4-5-20251001", "claude-sonnet-4-6", "claude-opus-4-8"],
  openai: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini"],
  google: ["gemini-2.0-flash", "gemini-2.5-flash", "gemini-2.5-pro"],
};

// 각 에이전트 노드 메타데이터
type AgentMeta = {
  key: AgentKey | "rag";
  label: string;
  role: string;
  icon: string;
  configurable: boolean;  // RAG는 LLM 없음
};

const PIPELINE: AgentMeta[] = [
  { key: "jd_analyzer", label: "JD 분석",    role: "공고 분석 · 회사명 추출",       icon: "📋", configurable: true },
  { key: "rag",         label: "RAG 검색",   role: "관련 경험 자료 검색",            icon: "🔍", configurable: false },
  { key: "essay_writer",label: "초안 작성",   role: "자소서 초안 생성",               icon: "✍️", configurable: true },
  { key: "compressor",  label: "글자수 조정", role: "목표 글자수에 맞게 압축/확장",   icon: "✂️", configurable: true },
  { key: "evaluator",   label: "자가 평가",   role: "품질 점수 · 개선 피드백 산출",   icon: "⭐", configurable: true },
];

const NODE_W = 210;
const NODE_GAP = 60;

// ── 노드 데이터 타입 ─────────────────────────────────────────────

type AgentNodeData = {
  meta: AgentMeta;
  config: ProviderConfig | null;   // configurable 노드만
  phase: NodePhase;
  detail: string;
  editable: boolean;               // 생성 중엔 false
  onConfigChange?: (key: AgentKey, field: keyof ProviderConfig, value: string) => void;
};

// ── 상태 스타일 ──────────────────────────────────────────────────

const PHASE_BORDER: Record<NodePhase, string> = {
  idle:    "#e4e4e7",
  running: "#3b82f6",
  done:    "#22c55e",
  error:   "#ef4444",
};

const PHASE_BG: Record<NodePhase, string> = {
  idle:    "#fff",
  running: "#eff6ff",
  done:    "#f0fdf4",
  error:   "#fef2f2",
};

const PHASE_LABEL: Record<NodePhase, string> = {
  idle:    "대기",
  running: "실행 중...",
  done:    "완료",
  error:   "오류",
};

const PHASE_DOT: Record<NodePhase, string> = {
  idle:    "#a1a1aa",
  running: "#3b82f6",
  done:    "#22c55e",
  error:   "#ef4444",
};

// ── 커스텀 노드 컴포넌트 ─────────────────────────────────────────

function AgentNode({ data }: { data: AgentNodeData }) {
  const { meta, config, phase, detail, editable, onConfigChange } = data;
  const isRunning = phase === "running";

  return (
    <div
      style={{
        width: NODE_W,
        background: PHASE_BG[phase],
        border: `2px solid ${PHASE_BORDER[phase]}`,
        borderRadius: 12,
        boxShadow: isRunning ? `0 0 0 4px rgba(59,130,246,0.15)` : "0 1px 4px rgba(0,0,0,0.06)",
        transition: "all 0.25s ease",
        fontFamily: "inherit",
        fontSize: 12,
        overflow: "hidden",
      }}
    >
      <Handle type="target" position={Position.Left} style={{ opacity: 0, pointerEvents: "none" }} />

      {/* 헤더 */}
      <div style={{
        padding: "10px 14px 8px",
        borderBottom: "1px solid #f4f4f5",
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}>
        <span style={{ fontSize: 18, lineHeight: 1 }}>{meta.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: "#18181b" }}>{meta.label}</div>
          <div style={{ color: "#71717a", fontSize: 11, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {meta.role}
          </div>
        </div>
      </div>

      {/* 설정 영역 */}
      <div style={{ padding: "8px 14px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
        {meta.configurable && config ? (
          <>
            {/* 프로바이더 */}
            <div>
              <div style={{ color: "#a1a1aa", fontSize: 10, fontWeight: 600, letterSpacing: "0.05em", marginBottom: 3 }}>
                PROVIDER
              </div>
              {editable ? (
                <select
                  value={config.provider}
                  onChange={(e) => onConfigChange?.(meta.key as AgentKey, "provider", e.target.value)}
                  style={{
                    width: "100%", padding: "4px 6px", borderRadius: 6,
                    border: "1px solid #e4e4e7", fontSize: 12, background: "#fafafa",
                    color: "#18181b", cursor: "pointer", outline: "none",
                  }}
                >
                  {PROVIDERS.map((p) => (
                    <option key={p} value={p}>{PROVIDER_LABEL[p]}</option>
                  ))}
                </select>
              ) : (
                <div style={{ color: "#52525b", fontSize: 12, fontWeight: 500 }}>
                  {PROVIDER_LABEL[config.provider]}
                </div>
              )}
            </div>

            {/* 모델 */}
            <div>
              <div style={{ color: "#a1a1aa", fontSize: 10, fontWeight: 600, letterSpacing: "0.05em", marginBottom: 3 }}>
                MODEL
              </div>
              {editable ? (
                <select
                  value={config.model}
                  onChange={(e) => onConfigChange?.(meta.key as AgentKey, "model", e.target.value)}
                  style={{
                    width: "100%", padding: "4px 6px", borderRadius: 6,
                    border: "1px solid #e4e4e7", fontSize: 12, background: "#fafafa",
                    color: "#18181b", cursor: "pointer", outline: "none",
                    fontFamily: "monospace",
                  }}
                >
                  {(PROVIDER_MODELS[config.provider] ?? []).map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              ) : (
                <div style={{ color: "#52525b", fontSize: 11, fontFamily: "monospace" }}>
                  {config.model}
                </div>
              )}
            </div>
          </>
        ) : (
          <div style={{ color: "#a1a1aa", fontSize: 11 }}>
            벡터 임베딩 검색 (KURE-v1)
          </div>
        )}

        {/* 상태 */}
        <div style={{
          marginTop: 4, paddingTop: 8, borderTop: "1px solid #f4f4f5",
          display: "flex", alignItems: "center", gap: 6,
        }}>
          <div style={{
            width: 7, height: 7, borderRadius: "50%",
            background: PHASE_DOT[phase],
            boxShadow: isRunning ? `0 0 0 3px rgba(59,130,246,0.2)` : "none",
            animation: isRunning ? "pulse 1.2s infinite" : "none",
          }} />
          <span style={{ color: PHASE_DOT[phase], fontWeight: 600, fontSize: 11 }}>
            {PHASE_LABEL[phase]}
          </span>
          {detail && (
            <span style={{ color: "#a1a1aa", fontSize: 10, marginLeft: "auto", textAlign: "right" }}>
              {detail}
            </span>
          )}
        </div>
      </div>

      <Handle type="source" position={Position.Right} style={{ opacity: 0, pointerEvents: "none" }} />

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}

const NODE_TYPES = { agentNode: AgentNode };

// ── 초기 노드/엣지 빌드 ─────────────────────────────────────────

function buildGraph(
  configs: Record<AgentKey, ProviderConfig>,
  editable: boolean,
  onConfigChange?: AgentNodeData["onConfigChange"],
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = PIPELINE.map((meta, i) => ({
    id: meta.key,
    type: "agentNode",
    position: { x: i * (NODE_W + NODE_GAP), y: 0 },
    data: {
      meta,
      config: meta.configurable ? (configs[meta.key as AgentKey] ?? null) : null,
      phase: "idle",
      detail: "",
      editable,
      onConfigChange,
    } satisfies AgentNodeData,
  }));

  const edges: Edge[] = PIPELINE.slice(0, -1).map((meta, i) => ({
    id: `e-${meta.key}-${PIPELINE[i + 1].key}`,
    source: meta.key,
    target: PIPELINE[i + 1].key,
    type: "smoothstep",
    animated: false,
    markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: "#d4d4d8" },
    style: { stroke: "#d4d4d8", strokeWidth: 2 },
  }));

  return { nodes, edges };
}

// ── 메인 컴포넌트 ────────────────────────────────────────────────

type Props = {
  configs: Record<AgentKey, ProviderConfig>;
  events: GraphEvent[];
  editable: boolean;
  onConfigChange?: (key: AgentKey, field: keyof ProviderConfig, value: string) => void;
};

export function AgentGraph({ configs, events, editable, onConfigChange }: Props) {
  const { nodes: initNodes, edges: initEdges } = buildGraph(configs, editable, onConfigChange);
  const [nodes, setNodes, onNodesChange] = useNodesState(initNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initEdges);

  // configs 또는 editable 변경 시 노드 데이터 업데이트
  const onConfigChangeRef = useRef(onConfigChange);
  onConfigChangeRef.current = onConfigChange;

  useEffect(() => {
    setNodes((prev) =>
      prev.map((n) => ({
        ...n,
        data: {
          ...n.data,
          config: (n.data as AgentNodeData).meta.configurable
            ? (configs[(n.data as AgentNodeData).meta.key as AgentKey] ?? null)
            : null,
          editable,
          onConfigChange: onConfigChangeRef.current,
        },
      })),
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configs, editable]);

  // SSE 이벤트 → 노드 상태 업데이트
  const updateNode = useCallback(
    (id: string, patch: Partial<AgentNodeData>) => {
      setNodes((prev) =>
        prev.map((n) =>
          n.id === id ? { ...n, data: { ...(n.data as AgentNodeData), ...patch } } : n,
        ),
      );
    },
    [setNodes],
  );

  const setEdgeStyle = useCallback(
    (targetId: string, animated: boolean, color: string) => {
      setEdges((prev) =>
        prev.map((e) =>
          e.target === targetId
            ? {
                ...e,
                animated,
                style: { stroke: color, strokeWidth: 2 },
                markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color },
              }
            : e,
        ),
      );
    },
    [setEdges],
  );

  // 노드 key 매핑 (SSE node 이름 → graph node id)
  const SSE_TO_NODE: Record<string, string> = {
    jd_analyzer: "jd_analyzer",
    rag:         "rag",
    write:       "essay_writer",
    compress:    "compressor",
    evaluate:    "evaluator",
  };

  useEffect(() => {
    const last = events[events.length - 1];
    if (!last) return;

    const nodeId = SSE_TO_NODE[last.node];
    if (!nodeId) return;

    if (last.phase === "start") {
      updateNode(nodeId, { phase: "running", detail: "" });
      setEdgeStyle(nodeId, true, "#3b82f6");
    } else {
      const detail = last.iteration && last.iteration > 1
        ? `${last.detail} (${last.iteration}회차)`
        : (last.detail ?? "");
      updateNode(nodeId, {
        phase: last.phase === "done" ? "done" : "error",
        detail,
      });
      setEdgeStyle(nodeId, false, last.phase === "done" ? "#22c55e" : "#ef4444");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events]);

  const graphW = PIPELINE.length * NODE_W + (PIPELINE.length - 1) * NODE_GAP;

  return (
    <div style={{
      height: 230,
      width: "100%",
      borderRadius: 12,
      overflow: "hidden",
      border: "1px solid #e4e4e7",
      background: "#fafafa",
    }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={NODE_TYPES}
        fitView
        fitViewOptions={{ padding: 0.12, maxZoom: 1 }}
        nodesDraggable={false}
        nodesConnectable={false}
        panOnDrag={!editable}
        zoomOnScroll={false}
        zoomOnPinch={false}
        preventScrolling={false}
        elementsSelectable={false}
        minZoom={0.3}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#e4e4e7" />
      </ReactFlow>
      {editable && (
        <div style={{
          position: "absolute",
          bottom: 8, right: 10,
          fontSize: 10, color: "#a1a1aa",
          pointerEvents: "none",
        }}>
          각 에이전트의 프로바이더·모델을 선택하세요
        </div>
      )}
    </div>
  );
}
