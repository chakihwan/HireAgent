"use client";

import { useState } from "react";
import type { AgentKey, ProviderConfig } from "@/lib/types";

// ── 타입 ────────────────────────────────────────────────────────

export type NodePhase = "idle" | "running" | "done" | "error";

export type PipelineEvent = {
  node: "jd_analyzer" | "rag" | "write" | "compress" | "evaluate";
  category?: string;
  phase: "start" | "done" | "error";
  detail?: string;
  iteration?: number;
};

export type ItemConfig = {
  name: string;
  defaultLimit: number;
};

export type SelectedItem = {
  checked: boolean;
  charLimit: number;
};

// ── 상수 ────────────────────────────────────────────────────────

const PRESET_ITEMS: ItemConfig[] = [
  { name: "자기소개",  defaultLimit: 300 },
  { name: "지원동기",  defaultLimit: 500 },
  { name: "성장과정",  defaultLimit: 500 },
  { name: "직무경험",  defaultLimit: 700 },
  { name: "강점/역량", defaultLimit: 500 },
  { name: "입사 후 포부", defaultLimit: 500 },
];

const PROVIDERS = ["ollama", "anthropic", "openai", "google"] as const;
type Provider = typeof PROVIDERS[number];

const PROVIDER_LABEL: Record<Provider, string> = {
  ollama: "Ollama", anthropic: "Anthropic", openai: "OpenAI", google: "Google",
};

// Ollama는 동적으로 주입 (설치된 모델만 표시). 클라우드는 최신 stable 목록.
const CLOUD_MODELS: Partial<Record<Provider, string[]>> = {
  anthropic: ["claude-haiku-4-5-20251001", "claude-sonnet-4-6", "claude-opus-4-8"],
  openai:    ["gpt-4.1-mini", "gpt-4o-mini", "gpt-4.1", "gpt-4o", "o4-mini"],
  google:    ["gemini-2.0-flash", "gemini-2.5-flash", "gemini-2.5-pro"],
};

type AgentMeta = {
  key: AgentKey | "rag";
  label: string;
  role: string;
  icon: string;
  hasLLM: boolean;
};

const PIPELINE: AgentMeta[] = [
  { key: "jd_analyzer",  label: "JD 분석",    role: "공고 분석 · 회사명 추출",         icon: "📋", hasLLM: true },
  { key: "rag",          label: "RAG 검색",   role: "유사 경험 자료 검색",             icon: "🔍", hasLLM: false },
  { key: "essay_writer", label: "초안 작성",   role: "자소서 초안 생성",                icon: "✍️", hasLLM: true },
  { key: "compressor",   label: "글자수 조정", role: "목표 글자수 압축 / 확장",          icon: "✂️", hasLLM: true },
  { key: "evaluator",    label: "자가 평가",   role: "품질 점수 · 개선 피드백 산출",    icon: "⭐", hasLLM: true },
];

// ── 노드 상태 스타일 ─────────────────────────────────────────────

const PHASE_COLORS: Record<NodePhase, { border: string; bg: string; dot: string; text: string }> = {
  idle:    { border: "#e4e4e7", bg: "#fff",    dot: "#a1a1aa", text: "#a1a1aa" },
  running: { border: "#3b82f6", bg: "#eff6ff", dot: "#3b82f6", text: "#1d4ed8" },
  done:    { border: "#22c55e", bg: "#f0fdf4", dot: "#22c55e", text: "#15803d" },
  error:   { border: "#ef4444", bg: "#fef2f2", dot: "#ef4444", text: "#b91c1c" },
};

const PHASE_LABEL: Record<NodePhase, string> = {
  idle: "대기", running: "실행 중...", done: "완료", error: "오류",
};

// ── 아이템 선택 섹션 ─────────────────────────────────────────────

type ItemSectionProps = {
  items: Record<string, SelectedItem>;
  onChange: (name: string, patch: Partial<SelectedItem>) => void;
  customName: string;
  customLimit: number;
  useCustom: boolean;
  onCustomNameChange: (v: string) => void;
  onCustomLimitChange: (v: number) => void;
  onToggleCustom: () => void;
};

export function ItemSection({
  items, onChange,
  customName, customLimit, useCustom,
  onCustomNameChange, onCustomLimitChange, onToggleCustom,
}: ItemSectionProps) {
  return (
    <div>
      <p className="text-sm font-semibold text-zinc-700 mb-3">작성할 항목 선택</p>
      <div className="flex flex-wrap gap-2">
        {PRESET_ITEMS.map((preset) => {
          const item = items[preset.name] ?? { checked: false, charLimit: preset.defaultLimit };
          return (
            <div
              key={preset.name}
              onClick={() => onChange(preset.name, { checked: !item.checked })}
              className="cursor-pointer rounded-xl border-2 px-4 py-3 select-none transition-all"
              style={{
                borderColor: item.checked ? "#3b82f6" : "#e4e4e7",
                background: item.checked ? "#eff6ff" : "#fff",
                minWidth: 110,
              }}
            >
              <div className="flex items-center gap-1.5 mb-1.5">
                <div
                  className="w-4 h-4 rounded-full border-2 flex items-center justify-center text-xs flex-shrink-0"
                  style={{
                    borderColor: item.checked ? "#3b82f6" : "#d4d4d8",
                    background: item.checked ? "#3b82f6" : "transparent",
                    color: "#fff",
                  }}
                >
                  {item.checked && "✓"}
                </div>
                <span className="text-sm font-semibold" style={{ color: item.checked ? "#1d4ed8" : "#3f3f46" }}>
                  {preset.name}
                </span>
              </div>
              {item.checked && (
                <div
                  className="flex items-center gap-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="number"
                    min={50} max={2000} step={50}
                    value={item.charLimit}
                    onChange={(e) => onChange(preset.name, { charLimit: Number(e.target.value) })}
                    className="w-16 text-center text-xs border rounded-md px-1 py-0.5 outline-none"
                    style={{ borderColor: "#bfdbfe", background: "#fff" }}
                  />
                  <span className="text-xs text-zinc-400">자</span>
                </div>
              )}
              {!item.checked && (
                <div className="text-xs text-zinc-400">{preset.defaultLimit}자</div>
              )}
            </div>
          );
        })}

        {/* 직접 입력 */}
        <div
          onClick={onToggleCustom}
          className="cursor-pointer rounded-xl border-2 px-4 py-3 select-none transition-all"
          style={{
            borderColor: useCustom ? "#8b5cf6" : "#e4e4e7",
            background: useCustom ? "#f5f3ff" : "#fff",
            minWidth: 110,
          }}
        >
          <div className="flex items-center gap-1.5 mb-1.5">
            <div
              className="w-4 h-4 rounded-full border-2 flex items-center justify-center text-xs flex-shrink-0"
              style={{
                borderColor: useCustom ? "#8b5cf6" : "#d4d4d8",
                background: useCustom ? "#8b5cf6" : "transparent",
                color: "#fff",
              }}
            >
              {useCustom ? "✓" : "+"}
            </div>
            <span className="text-sm font-semibold" style={{ color: useCustom ? "#6d28d9" : "#3f3f46" }}>
              직접 입력
            </span>
          </div>
          {useCustom && (
            <div
              className="space-y-1"
              onClick={(e) => e.stopPropagation()}
            >
              <input
                type="text"
                placeholder="항목명"
                value={customName}
                onChange={(e) => onCustomNameChange(e.target.value)}
                className="w-full text-xs border rounded-md px-2 py-1 outline-none"
                style={{ borderColor: "#ddd4fe" }}
              />
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={50} max={2000} step={50}
                  value={customLimit}
                  onChange={(e) => onCustomLimitChange(Number(e.target.value))}
                  className="w-16 text-center text-xs border rounded-md px-1 py-0.5 outline-none"
                  style={{ borderColor: "#ddd4fe" }}
                />
                <span className="text-xs text-zinc-400">자</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── 에이전트 파이프라인 ──────────────────────────────────────────

type PipelineProps = {
  configs: Record<AgentKey, ProviderConfig>;
  events: PipelineEvent[];
  editable: boolean;
  ollamaModels?: string[];   // 실제 설치된 Ollama 모델 목록 (동적)
  onConfigChange?: (key: AgentKey, field: keyof ProviderConfig, value: string) => void;
};

export function AgentPipeline({ configs, events, editable, ollamaModels = [], onConfigChange }: PipelineProps) {
  // 노드 상태 집계
  const phases: Record<string, NodePhase> = {};
  const details: Record<string, string> = {};

  for (const ev of events) {
    const id = ev.node === "write" ? "essay_writer"
      : ev.node === "compress" ? "compressor"
      : ev.node === "evaluate" ? "evaluator"
      : ev.node;

    if (ev.phase === "start") {
      phases[id] = "running";
    } else {
      phases[id] = ev.phase === "done" ? "done" : "error";
      const iter = ev.iteration && ev.iteration > 1 ? ` (${ev.iteration}회차)` : "";
      details[id] = (ev.detail ?? "") + iter;
    }
  }

  return (
    <div>
      <p className="text-sm font-semibold text-zinc-700 mb-3">에이전트 파이프라인</p>
      <div className="overflow-x-auto pb-2">
        <div className="flex items-stretch gap-0" style={{ minWidth: "fit-content" }}>
          {PIPELINE.map((meta, i) => {
            const phase: NodePhase = phases[meta.key] ?? "idle";
            const detail = details[meta.key] ?? "";
            const colors = PHASE_COLORS[phase];
            const cfg = meta.hasLLM ? configs[meta.key as AgentKey] : null;

            return (
              <div key={meta.key} className="flex items-center">
                {/* 노드 카드 */}
                <div
                  style={{
                    width: 185,
                    border: `2px solid ${colors.border}`,
                    borderRadius: 12,
                    background: colors.bg,
                    padding: "12px 14px",
                    transition: "all 0.2s ease",
                    boxShadow: phase === "running" ? `0 0 0 4px rgba(59,130,246,0.12)` : "0 1px 3px rgba(0,0,0,0.06)",
                  }}
                >
                  {/* 헤더 */}
                  <div className="flex items-center gap-2 mb-2">
                    <span style={{ fontSize: 20 }}>{meta.icon}</span>
                    <div>
                      <div className="font-bold text-zinc-900" style={{ fontSize: 13 }}>{meta.label}</div>
                      <div className="text-zinc-400" style={{ fontSize: 10, lineHeight: 1.3 }}>{meta.role}</div>
                    </div>
                  </div>

                  {/* 설정 */}
                  {cfg ? (
                    <div className="space-y-1.5 mb-2">
                      <div>
                        <div className="text-zinc-400 mb-0.5" style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.05em" }}>PROVIDER</div>
                        {editable ? (
                          <select
                            value={cfg.provider}
                            onChange={(e) => onConfigChange?.(meta.key as AgentKey, "provider", e.target.value)}
                            className="w-full rounded-md outline-none"
                            style={{ fontSize: 12, padding: "4px 6px", border: "1px solid #e4e4e7", background: "#fafafa", cursor: "pointer" }}
                          >
                            {PROVIDERS.map((p) => (
                              <option key={p} value={p}>{PROVIDER_LABEL[p]}</option>
                            ))}
                          </select>
                        ) : (
                          <div className="text-zinc-600 font-medium" style={{ fontSize: 12 }}>{PROVIDER_LABEL[cfg.provider as Provider] ?? cfg.provider}</div>
                        )}
                      </div>
                      <div>
                        <div className="text-zinc-400 mb-0.5" style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.05em" }}>MODEL</div>
                        {editable ? (
                          <>
                            <input
                              list={`models-${meta.key}`}
                              value={cfg.model}
                              onChange={(e) => onConfigChange?.(meta.key as AgentKey, "model", e.target.value)}
                              placeholder="모델명 입력 또는 선택"
                              style={{
                                width: "100%", padding: "4px 6px", borderRadius: 6,
                                border: "1px solid #e4e4e7", fontSize: 11, background: "#fafafa",
                                fontFamily: "monospace", outline: "none", boxSizing: "border-box",
                              }}
                            />
                            <datalist id={`models-${meta.key}`}>
                              {(cfg.provider === "ollama"
                                ? (ollamaModels.length > 0 ? ollamaModels : [cfg.model])
                                : (CLOUD_MODELS[cfg.provider as Provider] ?? [])
                              ).map((m) => <option key={m} value={m} />)}
                            </datalist>
                          </>
                        ) : (
                          <div className="text-zinc-500" style={{ fontSize: 11, fontFamily: "monospace" }}>{cfg.model}</div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="text-zinc-400 mb-2" style={{ fontSize: 11 }}>KURE-v1 벡터 검색</div>
                  )}

                  {/* 상태 */}
                  <div className="flex items-center gap-1.5 pt-2" style={{ borderTop: "1px solid #f4f4f5" }}>
                    <span
                      style={{
                        width: 7, height: 7, borderRadius: "50%",
                        background: colors.dot, flexShrink: 0, display: "inline-block",
                        animation: phase === "running" ? "pulse-dot 1.2s infinite" : "none",
                      }}
                    />
                    <span style={{ fontSize: 11, fontWeight: 600, color: colors.text }}>{PHASE_LABEL[phase]}</span>
                    {detail && <span className="text-zinc-400 ml-auto text-right" style={{ fontSize: 10 }}>{detail}</span>}
                  </div>
                </div>

                {/* 화살표 */}
                {i < PIPELINE.length - 1 && (
                  <div className="flex items-center px-1" style={{ color: "#d4d4d8" }}>
                    <svg width="28" height="16" viewBox="0 0 28 16">
                      <line x1="0" y1="8" x2="20" y2="8" stroke={phases[PIPELINE[i+1].key] === "running" ? "#3b82f6" : phases[meta.key] === "done" ? "#22c55e" : "#d4d4d8"} strokeWidth="2" />
                      <polygon points="20,4 28,8 20,12" fill={phases[PIPELINE[i+1].key] === "running" ? "#3b82f6" : phases[meta.key] === "done" ? "#22c55e" : "#d4d4d8"} />
                    </svg>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <style>{`@keyframes pulse-dot { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
    </div>
  );
}
