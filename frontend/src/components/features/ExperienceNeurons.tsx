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
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeProps,
  type NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { groupNeurons, neuronKey, SOURCE_ICON, type Neuron } from "@/lib/neurons";
import type { RagSource, RequirementCoverage } from "@/lib/api";

// 직무 적합도 지도 (ADR-032) — JD 코어 → 핵심 요구(안쪽 고리) → 내 경험(바깥 고리).
// 선(요구↔경험 매칭)은 평소 유령처럼 흐리고, 노드에 마우스를 올리면 관련된 것만 환해진다
// (거미줄 방지). 받쳐주는 경험이 약한 요구 = "보강 필요"(주황). 경험을 켜고 끄면 작성에 인용.
//
// 깜빡임 방지: 노드 위치/정체성은 고정(useNodesState)하고, hover는 data.faded·선 스타일만 패치.

const COV_THR = 0.4; // 이 유사도 이상이면 "그 요구에 적합"으로 본다
const CORE = 112;
const REQ_R = 156;
const REQ_W = 152;
const REQ_H = 48;
const EXP_R = 332;
const EXP_MIN = 50;
const EXP_MAX = 94;
const AMBER = "#f59e0b";
const GHOST = 0.05; // 평소 매칭선 투명도 (배경 텍스처)

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const polar = (a: number, r: number) => ({ x: Math.cos(a) * r, y: Math.sin(a) * r });
// 경험 라벨에서 owner/ 접두 제거 (chakihwan/HireAgent → HireAgent)
const shortLabel = (s: string) => (s.includes("/") ? s.split("/").pop()! : s);

// ── 노드 데이터 ────────────────────────────────────────────────────

type CoreData = { company: string };
type ReqData = { text: string; gap: boolean; bestPct: number; faded: boolean };
type ExpData = {
  label: string;
  icon: string;
  count: number;
  similarity: number;
  active: boolean;
  size: number;
  faded: boolean;
};
// 엣지에 실어두는 메타 — hover 시 스타일만 다시 계산
type EdgeMeta = { kind: "spoke" | "match"; reqIdx: number; expKey?: string; sim?: number; gap?: boolean };

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
  const fill = data.gap ? AMBER : "var(--primary)";
  return (
    <div
      style={{
        width: REQ_W,
        borderRadius: 12,
        border: `1px solid ${data.gap ? "color-mix(in srgb, #f59e0b 50%, var(--border))" : "var(--border)"}`,
        background: "var(--card)",
        boxShadow: data.gap
          ? "0 1px 3px rgba(0,0,0,.06), 0 0 0 3px color-mix(in srgb, #f59e0b 13%, transparent)"
          : "0 1px 3px rgba(0,0,0,.06)",
        padding: "7px 10px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
        cursor: "default",
        fontFamily: "inherit",
        opacity: data.faded ? 0.28 : 1,
        transition: "opacity .2s",
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
          lineHeight: 1.2,
        }}
      >
        {data.text}
      </span>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{ flex: 1, height: 4, borderRadius: 999, background: "var(--muted)", overflow: "hidden" }}>
          <div
            style={{
              width: `${Math.max(5, data.bestPct)}%`,
              height: "100%",
              borderRadius: 999,
              background: fill,
              transition: "width .3s",
            }}
          />
        </div>
        <span
          style={{
            fontSize: 8.5,
            fontWeight: 700,
            color: data.gap ? AMBER : "var(--muted-foreground)",
            fontVariantNumeric: "tabular-nums",
            minWidth: 22,
            textAlign: "right",
          }}
        >
          {data.gap ? "부족" : `${data.bestPct}%`}
        </span>
      </div>
    </div>
  );
}

function ExpNode({ data: d }: NodeProps) {
  const data = d as ExpData;
  const opacity = data.faded ? 0.22 : data.active ? 1 : 0.5;
  return (
    <div
      className={data.active && !data.faded ? "neuron-pulse" : undefined}
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
        opacity,
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

// ── 포커스·스타일 계산 (hover 패치에 재사용) ──────────────────────

type Focus = { hasFocus: boolean; focusReq: Set<number>; focusExp: Set<string> };

function computeFocus(coverage: RequirementCoverage[], expKeys: Set<string>, hoverId: string | null): Focus {
  const focusReq = new Set<number>();
  const focusExp = new Set<string>();
  const isReq = hoverId?.startsWith("req-") ?? false;
  const isExp = hoverId != null && expKeys.has(hoverId);
  if (isReq) {
    const ri = Number(hoverId!.slice(4));
    focusReq.add(ri);
    coverage[ri]?.matches.forEach((m) => {
      const k = neuronKey(m.project_name, m.source_type);
      if (m.similarity >= COV_THR && expKeys.has(k)) focusExp.add(k);
    });
  } else if (isExp) {
    focusExp.add(hoverId!);
    coverage.forEach((req, i) => {
      if (req.matches.some((m) => neuronKey(m.project_name, m.source_type) === hoverId && m.similarity >= COV_THR))
        focusReq.add(i);
    });
  }
  return { hasFocus: isReq || isExp, focusReq, focusExp };
}

function edgeStyle(meta: EdgeMeta, f: Focus): React.CSSProperties {
  if (meta.kind === "spoke") {
    const on = f.hasFocus && f.focusReq.has(meta.reqIdx);
    const opacity = f.hasFocus ? (on ? 0.7 : 0.04) : meta.gap ? 0.4 : 0.22;
    return { stroke: meta.gap ? AMBER : "var(--border)", strokeWidth: on ? 1.5 : 1.2, opacity, transition: "opacity .2s" };
  }
  const on = f.hasFocus && f.focusReq.has(meta.reqIdx) && f.focusExp.has(meta.expKey!);
  const opacity = !f.hasFocus ? GHOST : on ? 0.9 : 0.03;
  return {
    stroke: on ? "var(--primary)" : "var(--border)",
    strokeWidth: 0.7 + (meta.sim ?? 0) * 2,
    opacity,
    transition: "opacity .2s",
  };
}

// ── 베이스 그래프 (위치·정체성 — hover와 무관) ────────────────────

const NO_FOCUS: Focus = { hasFocus: false, focusReq: new Set(), focusExp: new Set() };

function buildGraph(
  neurons: Neuron[],
  requirements: RequirementCoverage[],
  company: string,
  activeKeys: string[],
): { nodes: Node[]; edges: Edge[] } {
  const active = new Set(activeKeys);
  const expByKey = new Map(neurons.map((n) => [n.key, n]));
  const nodes: Node[] = [
    { id: "__jd", type: "coreNode", position: { x: -CORE / 2, y: -CORE / 2 }, data: { company } as CoreData, draggable: false, selectable: false },
  ];
  const edges: Edge[] = [];

  // 폴백 — 요구 추출 실패 시 경험만 단순 방사형
  if (requirements.length === 0) {
    const n = neurons.length;
    neurons.forEach((nu, i) => {
      const sim = clamp01(nu.similarity);
      const p = polar(-Math.PI / 2 + (i * 2 * Math.PI) / Math.max(1, n), EXP_R * 0.75);
      const size = EXP_MIN + sim * (EXP_MAX - EXP_MIN);
      nodes.push(expNode(nu, p, size, active.has(nu.key)));
    });
    return { nodes, edges };
  }

  const R = requirements.length;
  const reqAngle = requirements.map((_, i) => -Math.PI / 2 + (i * 2 * Math.PI) / R);
  const keyOfMatch = (m: { project_name: string | null; source_type: string }) => neuronKey(m.project_name, m.source_type);

  // 요구 노드 + JD→요구 스포크
  requirements.forEach((req, i) => {
    const best = req.matches.length ? req.matches[0].similarity : 0;
    const gap = best < COV_THR;
    const p = polar(reqAngle[i], REQ_R);
    nodes.push({
      id: `req-${i}`,
      type: "reqNode",
      position: { x: p.x - REQ_W / 2, y: p.y - REQ_H / 2 },
      data: { text: req.text, gap, bestPct: Math.round(best * 100), faded: false } as ReqData,
      draggable: false,
      selectable: false,
    });
    const meta: EdgeMeta = { kind: "spoke", reqIdx: i, gap };
    edges.push({ id: `e-jd-req-${i}`, source: "__jd", target: `req-${i}`, type: "straight", data: meta, style: edgeStyle(meta, NO_FOCUS) });
  });

  // 경험을 "가장 잘 맞는 요구"에 배정 → 그 요구 주변에 부채꼴 배치
  const groups = new Map<string, { key: string; sim: number }[]>();
  for (const nu of neurons) {
    let bestReq = -1;
    let bestSim = COV_THR;
    requirements.forEach((req, i) => {
      const m = req.matches.find((x) => keyOfMatch(x) === nu.key);
      if (m && m.similarity >= bestSim) {
        bestSim = m.similarity;
        bestReq = i;
      }
    });
    const g = bestReq < 0 ? "none" : String(bestReq);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push({ key: nu.key, sim: clamp01(nu.similarity) });
  }
  groups.forEach((exps, g) => {
    const base = g === "none" ? Math.PI / 2 : reqAngle[Number(g)];
    const m = exps.length;
    const fan = Math.min(0.9, 0.32 * m);
    exps
      .sort((a, b) => b.sim - a.sim)
      .forEach((e, j) => {
        const off = m > 1 ? (j - (m - 1) / 2) / (m - 1) : 0;
        const nu = expByKey.get(e.key)!;
        const size = EXP_MIN + clamp01(nu.similarity) * (EXP_MAX - EXP_MIN);
        nodes.push(expNode(nu, polar(base + off * fan, EXP_R), size, active.has(e.key)));
      });
  });

  // 요구→경험 매칭 엣지 (임계 이상)
  requirements.forEach((req, i) => {
    req.matches.forEach((m) => {
      if (m.similarity < COV_THR) return;
      const key = keyOfMatch(m);
      if (!expByKey.has(key)) return;
      const meta: EdgeMeta = { kind: "match", reqIdx: i, expKey: key, sim: clamp01(m.similarity) };
      edges.push({ id: `e-req${i}-${key}`, source: `req-${i}`, target: key, type: "straight", data: meta, style: edgeStyle(meta, NO_FOCUS) });
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
      label: shortLabel(nu.label),
      icon: SOURCE_ICON[nu.sourceType] ?? "🗂️",
      count: nu.chunks.length,
      similarity: clamp01(nu.similarity),
      active,
      size,
      faded: false,
    } as ExpData,
    draggable: false,
  };
}

// ── 컴포넌트 ───────────────────────────────────────────────────────

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
  const [hoverId, setHoverId] = useState<string | null>(null);

  const neurons = useMemo(() => groupNeurons(sources), [sources]);
  const base = useMemo(() => buildGraph(neurons, coverage, company, activeKeys), [neurons, coverage, company, activeKeys]);

  const [nodes, setNodes, onNodesChange] = useNodesState(base.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(base.edges);

  // 베이스(데이터·active) 변경 시 그래프 교체 → 이후 hover 패치가 다시 얹힘
  useEffect(() => {
    setNodes(base.nodes);
    setEdges(base.edges);
  }, [base, setNodes, setEdges]);

  // hover 변경 → faded·선 스타일만 in-place 패치 (재마운트 없음 = 깜빡임 없음)
  useEffect(() => {
    const f = computeFocus(coverage, new Set(neurons.map((n) => n.key)), hoverId);
    setNodes((prev) =>
      prev.map((n) => {
        let faded = false;
        if (n.type === "reqNode") faded = f.hasFocus && !f.focusReq.has(Number(n.id.slice(4)));
        else if (n.type === "expNode") faded = f.hasFocus && !f.focusExp.has(n.id);
        else return n;
        return (n.data as ReqData | ExpData).faded === faded ? n : { ...n, data: { ...n.data, faded } };
      }),
    );
    setEdges((prev) => prev.map((e) => ({ ...e, style: edgeStyle(e.data as EdgeMeta, f) })));
  }, [hoverId, base, coverage, neurons, setNodes, setEdges]);

  // hover 패널 — 요구면 적합한 경험 목록/보강, 경험이면 청크 미리보기
  const panel = useMemo(() => {
    if (!hoverId) return null;
    if (hoverId.startsWith("req-")) {
      const req = coverage[Number(hoverId.slice(4))];
      if (!req) return null;
      const strong = req.matches.filter((m) => m.similarity >= COV_THR);
      if (strong.length === 0)
        return { title: req.text, body: "이 요구를 받쳐줄 경험이 약해요. 관련 경험을 보강하거나 다른 강점으로 풀어쓰는 게 좋아요.", tone: "gap" as const };
      const list = strong
        .slice(0, 4)
        .map((m) => `· ${m.project_name ?? "이력서"} (${Math.round(m.similarity * 100)}%)`)
        .join("\n");
      return { title: req.text, body: `적합한 경험:\n${list}`, tone: "default" as const };
    }
    const nu = neurons.find((x) => x.key === hoverId);
    if (nu) return { title: nu.label, body: nu.chunks[0]?.content.slice(0, 200) ?? "", tone: "default" as const };
    return null;
  }, [hoverId, coverage, neurons]);

  const onNodeClick: NodeMouseHandler = (_, node) => {
    if (node.type === "expNode") onToggle(node.id);
  };
  const onNodeEnter: NodeMouseHandler = (_, node) => setHoverId(node.id === "__jd" ? null : node.id);

  return (
    <>
      <style>{`@keyframes neuronPulse{0%,100%{box-shadow:0 0 16px color-mix(in srgb,var(--primary) 30%,transparent)}50%{box-shadow:0 0 26px color-mix(in srgb,var(--primary) 48%,transparent)}}.neuron-pulse{animation:neuronPulse 2.4s ease-in-out infinite}`}</style>
      <ReactFlow
        colorMode={mounted && resolvedTheme === "dark" ? "dark" : "light"}
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={NODE_TYPES}
        onNodeClick={onNodeClick}
        onNodeMouseEnter={onNodeEnter}
        onNodeMouseLeave={() => setHoverId(null)}
        fitView
        fitViewOptions={{ padding: 0.12 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnScroll={false}
        panOnDrag
        zoomOnScroll
        minZoom={0.3}
        maxZoom={1.8}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="var(--border)" />
        <Panel position="top-left" className="pointer-events-none m-2 max-w-[16rem]">
          {panel ? (
            <div className={`rounded-lg border bg-card/95 p-2 shadow-sm backdrop-blur ${panel.tone === "gap" ? "border-amber-500/60" : "border-border"}`}>
              <div className="mb-0.5 truncate text-[11px] font-semibold text-foreground">{panel.title}</div>
              <p className="whitespace-pre-line text-[10px] leading-relaxed text-muted-foreground">{panel.body}</p>
            </div>
          ) : (
            <p className="rounded-md bg-muted/70 px-2 py-1 text-[10px] text-muted-foreground">
              안쪽 = 직무 요구 · 바깥 = 내 경험 · 주황 = 보강 필요 · 노드에 마우스를 올리면 이어진 관계가 보여요
            </p>
          )}
        </Panel>
      </ReactFlow>
    </>
  );
}
