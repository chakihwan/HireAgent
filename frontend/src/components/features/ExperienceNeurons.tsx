"use client";

import { useEffect, useMemo, useState } from "react";
import { useTheme } from "next-themes";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Panel,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeProps,
  type NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { groupNeurons, SOURCE_ICON, type Neuron } from "@/lib/neurons";
import type { RagSource } from "@/lib/api";

// 직무 중심 2계층 신경망 (ADR-031 D) — JD 코어 → 프로젝트 허브(경험) → 청크 위성.
// 유사도 높을수록 중심에 가깝고 크고 밝게. 클릭으로 경험을 켜고 끄고, 노드에 올리면 내용 미리보기.

const HUB_R_MIN = 155;
const HUB_R_MAX = 285;
const HUB_MIN = 54;
const HUB_MAX = 100;
const CHUNK_MIN = 15;
const CHUNK_MAX = 32;
const CHUNK_R_MIN = 54;
const CHUNK_R_MAX = 86;
const CHUNK_FAN = 1.35; // 청크가 허브 바깥으로 퍼지는 부채꼴 폭(rad)
const CORE = 116;

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

// ── 노드 데이터 ────────────────────────────────────────────────────

type CoreData = { company: string };
type HubData = {
  kind: "hub";
  label: string;
  count: number;
  similarity: number;
  icon: string;
  active: boolean;
  size: number;
};
type ChunkData = {
  kind: "chunk";
  active: boolean;
  similarity: number;
  size: number;
};

const H = { left: "50%", top: "50%", opacity: 0, pointerEvents: "none" as const };

function CoreNode({ data: d }: NodeProps) {
  const data = d as CoreData;
  return (
    <div
      style={{
        width: CORE,
        height: CORE,
        borderRadius: "50%",
        border: "2px solid var(--primary)",
        background:
          "radial-gradient(circle at 50% 38%, color-mix(in srgb, var(--primary) 32%, var(--card)), color-mix(in srgb, var(--primary) 12%, var(--card)))",
        boxShadow:
          "0 0 0 6px color-mix(in srgb, var(--primary) 10%, transparent), 0 0 34px color-mix(in srgb, var(--primary) 35%, transparent)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
        padding: "0 12px",
        fontFamily: "inherit",
      }}
    >
      <Handle type="source" position={Position.Right} style={H} />
      <span style={{ fontSize: 20, lineHeight: 1 }}>🎯</span>
      <span
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: "var(--foreground)",
          maxWidth: CORE - 26,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          textAlign: "center",
        }}
      >
        {data.company}
      </span>
      <span style={{ fontSize: 9, color: "var(--muted-foreground)" }}>이 직무</span>
    </div>
  );
}

function HubNode({ data: d }: NodeProps) {
  const data = d as HubData;
  const pct = Math.round(data.similarity * 100);
  return (
    <div
      className={data.active ? "neuron-pulse" : undefined}
      style={{
        width: data.size,
        height: data.size,
        borderRadius: "50%",
        border: `2px solid ${data.active ? "var(--primary)" : "var(--border)"}`,
        background: data.active
          ? "radial-gradient(circle at 50% 40%, color-mix(in srgb, var(--primary) 22%, var(--card)), var(--card))"
          : "var(--card)",
        boxShadow: data.active
          ? "0 0 20px color-mix(in srgb, var(--primary) 38%, transparent)"
          : "none",
        opacity: data.active ? 1 : 0.5,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 1,
        cursor: "pointer",
        transition: "border-color .2s, background .2s, opacity .2s, box-shadow .2s",
        fontFamily: "inherit",
        padding: 4,
        textAlign: "center",
      }}
    >
      <Handle type="target" position={Position.Left} style={H} />
      <Handle type="source" position={Position.Right} style={H} />
      <span style={{ fontSize: data.size > 78 ? 17 : 13, lineHeight: 1 }}>{data.icon}</span>
      <span
        style={{
          fontSize: 9.5,
          fontWeight: 600,
          color: data.active ? "var(--foreground)" : "var(--muted-foreground)",
          maxWidth: data.size - 10,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          lineHeight: 1.2,
        }}
      >
        {data.label}
      </span>
      <span
        style={{
          fontSize: 8.5,
          fontWeight: 700,
          color: data.active ? "var(--primary)" : "var(--muted-foreground)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {pct}%
      </span>
    </div>
  );
}

function ChunkNode({ data: d }: NodeProps) {
  const data = d as ChunkData;
  return (
    <div
      style={{
        width: data.size,
        height: data.size,
        borderRadius: "50%",
        border: `1.5px solid ${data.active ? "var(--primary)" : "var(--border)"}`,
        background: data.active
          ? "color-mix(in srgb, var(--primary) 70%, var(--card))"
          : "var(--muted)",
        boxShadow: data.active
          ? "0 0 10px color-mix(in srgb, var(--primary) 45%, transparent)"
          : "none",
        opacity: data.active ? 0.95 : 0.4,
        cursor: "pointer",
        transition: "background .2s, opacity .2s, box-shadow .2s",
      }}
    >
      <Handle type="target" position={Position.Left} style={H} />
    </div>
  );
}

const NODE_TYPES = { coreNode: CoreNode, hubNode: HubNode, chunkNode: ChunkNode };

// ── 그래프 빌드 (2계층 방사형) ─────────────────────────────────────

function buildGraph(
  neurons: Neuron[],
  company: string,
  activeKeys: string[],
): { nodes: Node[]; edges: Edge[] } {
  const active = new Set(activeKeys);
  const nodes: Node[] = [
    {
      id: "__jd",
      type: "coreNode",
      position: { x: -CORE / 2, y: -CORE / 2 },
      data: { company } as CoreData,
      draggable: false,
      selectable: false,
    },
  ];
  const edges: Edge[] = [];
  const n = neurons.length;

  neurons.forEach((neuron, i) => {
    const sim = clamp01(neuron.similarity);
    const hubAngle = -Math.PI / 2 + (i * 2 * Math.PI) / Math.max(1, n);
    const hubR = HUB_R_MIN + (1 - sim) * (HUB_R_MAX - HUB_R_MIN);
    const hubSize = HUB_MIN + sim * (HUB_MAX - HUB_MIN);
    const hx = Math.cos(hubAngle) * hubR;
    const hy = Math.sin(hubAngle) * hubR;
    const isActive = active.has(neuron.key);

    nodes.push({
      id: neuron.key,
      type: "hubNode",
      position: { x: hx - hubSize / 2, y: hy - hubSize / 2 },
      data: {
        kind: "hub",
        label: neuron.label,
        count: neuron.chunks.length,
        similarity: sim,
        icon: SOURCE_ICON[neuron.sourceType] ?? "🗂️",
        active: isActive,
        size: hubSize,
      } as HubData,
      draggable: false,
    });
    edges.push({
      id: `e-jd-${neuron.key}`,
      source: "__jd",
      target: neuron.key,
      type: "straight",
      style: {
        stroke: isActive ? "var(--primary)" : "var(--border)",
        strokeWidth: 1.5 + sim * 3,
        opacity: isActive ? 0.9 : 0.22,
      },
    });

    // 청크 위성 — 허브 바깥쪽(중심 반대 방향)으로 부채꼴 배치
    const m = neuron.chunks.length;
    neuron.chunks.forEach((chunk, j) => {
      const csim = clamp01(chunk.similarity);
      const offset = m > 1 ? (j - (m - 1) / 2) / (m - 1) : 0; // -0.5..0.5
      const cAngle = hubAngle + offset * CHUNK_FAN;
      const cR = CHUNK_R_MIN + (1 - csim) * (CHUNK_R_MAX - CHUNK_R_MIN);
      const cSize = CHUNK_MIN + csim * (CHUNK_MAX - CHUNK_MIN);
      const cx = hx + Math.cos(cAngle) * cR;
      const cy = hy + Math.sin(cAngle) * cR;
      const cid = `${neuron.key}::${j}`;

      nodes.push({
        id: cid,
        type: "chunkNode",
        position: { x: cx - cSize / 2, y: cy - cSize / 2 },
        data: { kind: "chunk", active: isActive, similarity: csim, size: cSize } as ChunkData,
        draggable: false,
      });
      edges.push({
        id: `e-${cid}`,
        source: neuron.key,
        target: cid,
        type: "straight",
        style: {
          stroke: isActive ? "var(--primary)" : "var(--border)",
          strokeWidth: 1,
          opacity: isActive ? 0.45 : 0.18,
        },
      });
    });
  });

  return { nodes, edges };
}

// ── 컴포넌트 ───────────────────────────────────────────────────────

type Hover = { title: string; body: string; sim: number } | null;

export function ExperienceNeurons({
  sources,
  company,
  activeKeys,
  onToggle,
}: {
  sources: RagSource[];
  company: string;
  activeKeys: string[];
  onToggle: (key: string) => void;
}) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [hover, setHover] = useState<Hover>(null);

  const neurons = useMemo(() => groupNeurons(sources), [sources]);
  const { nodes, edges } = useMemo(
    () => buildGraph(neurons, company, activeKeys),
    [neurons, company, activeKeys],
  );

  // id → 토글할 프로젝트 키 (청크는 부모 키). 코어는 무시.
  function projectKeyOf(id: string): string | null {
    if (id === "__jd") return null;
    return id.includes("::") ? id.split("::")[0] : id;
  }

  const onNodeClick: NodeMouseHandler = (_, node) => {
    const key = projectKeyOf(node.id);
    if (key) onToggle(key);
  };

  const onNodeEnter: NodeMouseHandler = (_, node) => {
    if (node.id === "__jd") return;
    const key = projectKeyOf(node.id)!;
    const neuron = neurons.find((x) => x.key === key);
    if (!neuron) return;
    if (node.id.includes("::")) {
      const j = Number(node.id.split("::")[1]);
      const c = neuron.chunks[j];
      if (c) setHover({ title: neuron.label, body: c.content.slice(0, 220), sim: c.similarity });
    } else {
      setHover({ title: neuron.label, body: `청크 ${neuron.chunks.length}개 · 가장 가까운 경험 묶음`, sim: neuron.similarity });
    }
  };

  return (
    <>
      <style>{`@keyframes neuronPulse{0%,100%{box-shadow:0 0 16px color-mix(in srgb,var(--primary) 30%,transparent)}50%{box-shadow:0 0 26px color-mix(in srgb,var(--primary) 50%,transparent)}}.neuron-pulse{animation:neuronPulse 2.4s ease-in-out infinite}`}</style>
      <ReactFlow
        colorMode={mounted && resolvedTheme === "dark" ? "dark" : "light"}
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        onNodeClick={onNodeClick}
        onNodeMouseEnter={onNodeEnter}
        onNodeMouseLeave={() => setHover(null)}
        fitView
        fitViewOptions={{ padding: 0.18 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnScroll={false}
        panOnDrag={[1, 2]}
        zoomOnScroll
        minZoom={0.3}
        maxZoom={1.8}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="var(--border)" />
        <Panel position="top-left" className="pointer-events-none m-2 max-w-[15rem]">
          {hover ? (
            <div className="rounded-lg border border-border bg-card/95 p-2 shadow-sm backdrop-blur">
              <div className="mb-0.5 flex items-center gap-1.5">
                <span className="truncate text-[11px] font-semibold text-foreground">{hover.title}</span>
                <span className="shrink-0 rounded bg-primary/15 px-1 text-[9px] font-bold text-primary">
                  {Math.round(hover.sim * 100)}%
                </span>
              </div>
              <p className="line-clamp-4 text-[10px] leading-relaxed text-muted-foreground">{hover.body}</p>
            </div>
          ) : (
            <p className="rounded-md bg-muted/70 px-2 py-1 text-[10px] text-muted-foreground">
              노드에 올리면 내용 미리보기 · 클릭해 경험 켜고 끄기
            </p>
          )}
        </Panel>
      </ReactFlow>
    </>
  );
}
