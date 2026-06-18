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
import { groupNeurons, neuronKey, SOURCE_ICON, type Neuron } from "@/lib/neurons";
import type { RagSource, RequirementCoverage } from "@/lib/api";

// 직무 충족도 지도 (ADR-032) — JD 코어 → 핵심 요구(안쪽 고리) → 내 경험(바깥 고리).
// 요구↔경험을 매칭 점수로 잇는다. 받쳐주는 경험이 약한 요구 = "보강 필요"(주황).
// 경험을 켜고 끄면 작성에 인용된다. 노드에 올리면 내용 미리보기.

const COV_THR = 0.4; // 이 유사도 이상이면 "그 요구를 충족"으로 본다
const CORE = 108;
const REQ_R = 152;
const REQ_W = 132;
const REQ_H = 34;
const EXP_R = 330;
const EXP_MIN = 50;
const EXP_MAX = 94;
const AMBER = "#f59e0b";

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const polar = (a: number, r: number) => ({ x: Math.cos(a) * r, y: Math.sin(a) * r });

const H = { left: "50%", top: "50%", opacity: 0, pointerEvents: "none" as const };

// ── 노드 데이터 ────────────────────────────────────────────────────

type CoreData = { company: string };
type ReqData = { text: string; gap: boolean; bestPct: number };
type ExpData = {
  label: string;
  icon: string;
  count: number;
  similarity: number;
  active: boolean;
  size: number;
};

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
          "0 0 0 6px color-mix(in srgb, var(--primary) 10%, transparent), 0 0 30px color-mix(in srgb, var(--primary) 32%, transparent)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 1,
        padding: "0 10px",
        fontFamily: "inherit",
      }}
    >
      <Handle type="source" position={Position.Right} style={H} />
      <span style={{ fontSize: 19, lineHeight: 1 }}>🎯</span>
      <span
        style={{
          fontSize: 11.5,
          fontWeight: 700,
          color: "var(--foreground)",
          maxWidth: CORE - 24,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          textAlign: "center",
        }}
      >
        {data.company}
      </span>
      <span style={{ fontSize: 8.5, color: "var(--muted-foreground)" }}>이 직무</span>
    </div>
  );
}

function ReqNode({ data: d }: NodeProps) {
  const data = d as ReqData;
  const color = data.gap ? AMBER : "var(--primary)";
  return (
    <div
      style={{
        width: REQ_W,
        minHeight: REQ_H,
        borderRadius: 9,
        border: `1.5px solid ${data.gap ? AMBER : "var(--border)"}`,
        background: data.gap
          ? "color-mix(in srgb, #f59e0b 14%, var(--card))"
          : "var(--card)",
        boxShadow: data.gap ? "0 0 12px color-mix(in srgb, #f59e0b 30%, transparent)" : "none",
        padding: "5px 8px",
        display: "flex",
        flexDirection: "column",
        gap: 1,
        cursor: "default",
        fontFamily: "inherit",
      }}
    >
      <Handle type="target" position={Position.Left} style={H} />
      <Handle type="source" position={Position.Right} style={H} />
      <span
        style={{
          fontSize: 10.5,
          fontWeight: 600,
          color: "var(--foreground)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          lineHeight: 1.25,
        }}
      >
        {data.text}
      </span>
      <span style={{ fontSize: 8.5, fontWeight: 700, color, fontVariantNumeric: "tabular-nums" }}>
        {data.gap ? "보강 필요" : `충족 ${data.bestPct}%`}
      </span>
    </div>
  );
}

function ExpNode({ data: d }: NodeProps) {
  const data = d as ExpData;
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
          ? "0 0 18px color-mix(in srgb, var(--primary) 36%, transparent)"
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
      <span style={{ fontSize: data.size > 72 ? 16 : 13, lineHeight: 1 }}>{data.icon}</span>
      <span
        style={{
          fontSize: 9,
          fontWeight: 600,
          color: data.active ? "var(--foreground)" : "var(--muted-foreground)",
          maxWidth: data.size - 8,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          lineHeight: 1.15,
        }}
      >
        {data.label}
      </span>
    </div>
  );
}

const NODE_TYPES = { coreNode: CoreNode, reqNode: ReqNode, expNode: ExpNode };

// ── 그래프 빌드 ────────────────────────────────────────────────────

function buildGraph(
  neurons: Neuron[],
  requirements: RequirementCoverage[],
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

  const expByKey = new Map(neurons.map((n) => [n.key, n]));

  // 요구가 없으면(추출 실패) 경험만 단순 방사형으로 (폴백).
  if (requirements.length === 0) {
    const n = neurons.length;
    neurons.forEach((nu, i) => {
      const sim = clamp01(nu.similarity);
      const p = polar(-Math.PI / 2 + (i * 2 * Math.PI) / Math.max(1, n), EXP_R * 0.75);
      const size = EXP_MIN + sim * (EXP_MAX - EXP_MIN);
      const on = active.has(nu.key);
      nodes.push(expNode(nu, p, size, on));
      edges.push(edge(`e-jd-${nu.key}`, "__jd", nu.key, on ? "var(--primary)" : "var(--border)", 1.5 + sim * 2.5, on ? 0.85 : 0.25));
    });
    return { nodes, edges };
  }

  const R = requirements.length;
  const reqAngle = requirements.map((_, i) => -Math.PI / 2 + (i * 2 * Math.PI) / R);

  // 요구 노드 + JD→요구 스포크
  requirements.forEach((req, i) => {
    const best = req.matches.length ? req.matches[0].similarity : 0;
    const gap = best < COV_THR;
    const p = polar(reqAngle[i], REQ_R);
    nodes.push({
      id: `req-${i}`,
      type: "reqNode",
      position: { x: p.x - REQ_W / 2, y: p.y - REQ_H / 2 },
      data: { text: req.text, gap, bestPct: Math.round(best * 100) } as ReqData,
      draggable: false,
      selectable: false,
    });
    edges.push(edge(`e-jd-req-${i}`, "__jd", `req-${i}`, gap ? AMBER : "var(--border)", 1.5, gap ? 0.6 : 0.4));
  });

  // 경험을 "가장 잘 맞는 요구"에 배정 → 그 요구 주변에 부채꼴 배치
  const groups = new Map<string, { key: string; sim: number }[]>(); // reqIdx|"none" → exps
  for (const nu of neurons) {
    let bestReq = -1;
    let bestSim = COV_THR;
    requirements.forEach((req, i) => {
      const m = req.matches.find((x) => neuronKey(x.project_name, x.source_type) === nu.key);
      if (m && m.similarity >= bestSim) {
        bestSim = m.similarity;
        bestReq = i;
      }
    });
    const g = bestReq < 0 ? "none" : String(bestReq);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push({ key: nu.key, sim: clamp01(nu.similarity) });
  }

  const placeExp = (key: string, angle: number) => {
    const nu = expByKey.get(key)!;
    const sim = clamp01(nu.similarity);
    const size = EXP_MIN + sim * (EXP_MAX - EXP_MIN);
    const p = polar(angle, EXP_R);
    const on = active.has(key);
    nodes.push(expNode(nu, p, size, on));
  };

  groups.forEach((exps, g) => {
    const base = g === "none" ? Math.PI / 2 : reqAngle[Number(g)];
    const m = exps.length;
    const fan = Math.min(0.9, 0.32 * m);
    exps
      .sort((a, b) => b.sim - a.sim)
      .forEach((e, j) => {
        const off = m > 1 ? (j - (m - 1) / 2) / (m - 1) : 0;
        placeExp(e.key, base + off * fan);
      });
  });

  // 요구→경험 매칭 엣지 (임계 이상). 여러 요구에 걸친 경험은 교차 연결 → 신경망 느낌.
  requirements.forEach((req, i) => {
    req.matches.forEach((m) => {
      if (m.similarity < COV_THR) return;
      const key = neuronKey(m.project_name, m.source_type);
      if (!expByKey.has(key)) return;
      const on = active.has(key);
      edges.push(
        edge(
          `e-req${i}-${key}`,
          `req-${i}`,
          key,
          on ? "var(--primary)" : "var(--border)",
          0.8 + clamp01(m.similarity) * 2.6,
          on ? 0.8 : 0.2,
        ),
      );
    });
  });

  return { nodes, edges };
}

function expNode(nu: Neuron, p: { x: number; y: number }, size: number, active: boolean): Node {
  return {
    id: nu.key,
    type: "expNode",
    position: { x: p.x - size / 2, y: p.y - size / 2 },
    data: {
      label: nu.label,
      icon: SOURCE_ICON[nu.sourceType] ?? "🗂️",
      count: nu.chunks.length,
      similarity: clamp01(nu.similarity),
      active,
      size,
    } as ExpData,
    draggable: false,
  };
}

function edge(id: string, source: string, target: string, stroke: string, width: number, opacity: number): Edge {
  return { id, source, target, type: "straight", style: { stroke, strokeWidth: width, opacity } };
}

// ── 컴포넌트 ───────────────────────────────────────────────────────

type Hover = { title: string; body: string; tone: "default" | "gap" } | null;

export function ExperienceNeurons({
  sources,
  coverage,
  company,
  activeKeys,
  onToggle,
}: {
  sources: RagSource[];
  coverage: RequirementCoverage[];
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
    () => buildGraph(neurons, coverage, company, activeKeys),
    [neurons, coverage, company, activeKeys],
  );

  const onNodeClick: NodeMouseHandler = (_, node) => {
    if (node.type === "expNode") onToggle(node.id);
  };

  const onNodeEnter: NodeMouseHandler = (_, node) => {
    if (node.type === "expNode") {
      const nu = neurons.find((x) => x.key === node.id);
      if (nu) setHover({ title: nu.label, body: nu.chunks[0]?.content.slice(0, 200) ?? "", tone: "default" });
    } else if (node.type === "reqNode") {
      const i = Number(node.id.split("-")[1]);
      const req = coverage[i];
      if (!req) return;
      const strong = req.matches.filter((m) => m.similarity >= COV_THR);
      if (strong.length === 0) {
        setHover({ title: req.text, body: "이 요구를 받쳐줄 경험이 약해요. 관련 경험을 보강하거나 다른 강점으로 풀어쓰는 게 좋아요.", tone: "gap" });
      } else {
        const list = strong
          .slice(0, 4)
          .map((m) => `· ${m.project_name ?? "이력서"} (${Math.round(m.similarity * 100)}%)`)
          .join("\n");
        setHover({ title: req.text, body: `충족하는 경험:\n${list}`, tone: "default" });
      }
    }
  };

  return (
    <>
      <style>{`@keyframes neuronPulse{0%,100%{box-shadow:0 0 16px color-mix(in srgb,var(--primary) 30%,transparent)}50%{box-shadow:0 0 26px color-mix(in srgb,var(--primary) 48%,transparent)}}.neuron-pulse{animation:neuronPulse 2.4s ease-in-out infinite}`}</style>
      <ReactFlow
        colorMode={mounted && resolvedTheme === "dark" ? "dark" : "light"}
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        onNodeClick={onNodeClick}
        onNodeMouseEnter={onNodeEnter}
        onNodeMouseLeave={() => setHover(null)}
        fitView
        fitViewOptions={{ padding: 0.16 }}
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
        <Panel position="top-left" className="pointer-events-none m-2 max-w-[16rem]">
          {hover ? (
            <div
              className={`rounded-lg border bg-card/95 p-2 shadow-sm backdrop-blur ${
                hover.tone === "gap" ? "border-amber-500/60" : "border-border"
              }`}
            >
              <div className="mb-0.5 truncate text-[11px] font-semibold text-foreground">{hover.title}</div>
              <p className="whitespace-pre-line text-[10px] leading-relaxed text-muted-foreground">{hover.body}</p>
            </div>
          ) : (
            <p className="rounded-md bg-muted/70 px-2 py-1 text-[10px] text-muted-foreground">
              안쪽 = 직무 요구 · 바깥 = 내 경험 · 주황 = 보강 필요 · 클릭해 경험 켜고 끄기
            </p>
          )}
        </Panel>
      </ReactFlow>
    </>
  );
}
