"use client";

import { useCallback, useRef, useState } from "react";
import { CheckCircle, XCircle, Loader2, Copy, Check, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { generateEssays } from "@/lib/api";
import { loadSettings, buildAgentConfig } from "@/lib/settings-store";
import type { DraftResult, EssayTone, EssayPersona, ItemConfig, SseDoneEvent } from "@/lib/types";

// ── Constants ────────────────────────────────────────────────────────────────

type Step = "jd" | "items" | "generating" | "done";

const PRESET_CATEGORIES: Array<{ name: string; defaultLimit: number }> = [
  { name: "자기소개", defaultLimit: 300 },
  { name: "지원동기", defaultLimit: 500 },
  { name: "성장과정", defaultLimit: 500 },
  { name: "직무경험", defaultLimit: 700 },
  { name: "팀워크", defaultLimit: 400 },
  { name: "가치관", defaultLimit: 300 },
];

const TONES: EssayTone[] = ["공식적", "친근함", "도전적"];
const PERSONAS: EssayPersona[] = ["신입", "경력직", "전환"];

type LogEntry = {
  id: string;
  type: "start" | "progress" | "error";
  message: string;
};

// ── Helper ───────────────────────────────────────────────────────────────────

function charRatio(count: number, target: number): string {
  return `${count.toLocaleString()}/${target.toLocaleString()}자`;
}

function scoreColor(score: number | null): string {
  if (score === null) return "text-zinc-400";
  if (score >= 8) return "text-emerald-600";
  if (score >= 6) return "text-amber-600";
  return "text-red-500";
}

// ── Sub-components ────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Button variant="outline" size="sm" onClick={handleCopy} className="shrink-0">
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      <span className="ml-1">{copied ? "복사됨" : "복사"}</span>
    </Button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function GeneratePage() {
  const [step, setStep] = useState<Step>("jd");
  const [jd, setJd] = useState("");

  // Item selection state
  const [checkedPresets, setCheckedPresets] = useState<Record<string, boolean>>({});
  const [itemLimits, setItemLimits] = useState<Record<string, number>>(() =>
    Object.fromEntries(PRESET_CATEGORIES.map((c) => [c.name, c.defaultLimit])),
  );
  const [globalTone, setGlobalTone] = useState<EssayTone>("공식적");
  const [globalPersona, setGlobalPersona] = useState<EssayPersona>("경력직");
  const [customCategory, setCustomCategory] = useState("");
  const [customLimit, setCustomLimit] = useState(500);
  const [useCustom, setUseCustom] = useState(false);

  // Generation state
  const [log, setLog] = useState<LogEntry[]>([]);
  const [results, setResults] = useState<DraftResult[]>([]);
  const [genError, setGenError] = useState<string | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  // ── Derived ──────────────────────────────────────────────────────────────

  const selectedItems: ItemConfig[] = [
    ...PRESET_CATEGORIES.filter((c) => checkedPresets[c.name]).map((c) => ({
      category: c.name,
      charLimit: itemLimits[c.name] ?? c.defaultLimit,
      tone: globalTone,
      persona: globalPersona,
    })),
    ...(useCustom && customCategory.trim()
      ? [
          {
            category: customCategory.trim(),
            charLimit: customLimit,
            tone: globalTone,
            persona: globalPersona,
          },
        ]
      : []),
  ];

  const canGenerate = selectedItems.length > 0 && jd.trim().length >= 50;

  // ── Handlers ─────────────────────────────────────────────────────────────

  function appendLog(type: LogEntry["type"], message: string) {
    setLog((prev) => [...prev, { id: crypto.randomUUID(), type, message }]);
    setTimeout(() => logEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }

  const handleGenerate = useCallback(async () => {
    setStep("generating");
    setLog([]);
    setResults([]);
    setGenError(null);

    const settings = loadSettings();
    const agentConfig = buildAgentConfig(settings);

    const request = {
      job_description: jd,
      items: selectedItems.map((item) => ({
        category: item.category,
        char_limit: item.charLimit,
        tone: item.tone,
        persona: item.persona,
      })),
      user_id: "local",
      agent_config: agentConfig,
    };

    try {
      await generateEssays(request, (event, data) => {
        if (event === "start") {
          const d = data as { message: string; total_items: number };
          appendLog("start", `${d.message} (${d.total_items}개 항목)`);
        } else if (event === "progress") {
          const d = data as { node: string; message: string };
          appendLog("progress", d.message);
        } else if (event === "error") {
          const d = data as { message: string };
          appendLog("error", d.message);
        } else if (event === "done") {
          const d = data as SseDoneEvent;
          setResults(d.drafts);
          setStep("done");
        }
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setGenError(msg);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jd, selectedItems]);

  // ── Render: Step 1 — JD input ─────────────────────────────────────────────

  if (step === "jd") {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10 space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">채용 공고 입력</h1>
          <p className="text-sm text-zinc-500 mt-1">지원하려는 공고 내용을 붙여넣으세요.</p>
        </div>

        <Card>
          <CardContent className="pt-5 space-y-3">
            <Textarea
              rows={14}
              value={jd}
              onChange={(e) => setJd(e.target.value)}
              placeholder="채용 공고 전문을 붙여넣으세요 (최소 50자)..."
              className="resize-none font-mono text-sm"
            />
            <div className="flex items-center justify-between">
              <span className={`text-xs ${jd.length < 50 ? "text-red-400" : "text-zinc-400"}`}>
                {jd.length.toLocaleString()}자 {jd.length < 50 && `(최소 50자 필요)`}
              </span>
              <Button
                onClick={() => setStep("items")}
                disabled={jd.trim().length < 50}
              >
                다음
                <ChevronRight className="ml-1 size-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Render: Step 2 — Item selection ───────────────────────────────────────

  if (step === "items") {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10 space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">작성할 항목 선택</h1>
          <p className="text-sm text-zinc-500 mt-1">각 항목의 목표 글자수를 설정하세요.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-zinc-700">항목 선택</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {PRESET_CATEGORIES.map((cat) => (
              <div key={cat.name} className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id={`cat-${cat.name}`}
                  checked={checkedPresets[cat.name] ?? false}
                  onChange={(e) =>
                    setCheckedPresets((prev) => ({ ...prev, [cat.name]: e.target.checked }))
                  }
                  className="size-4 cursor-pointer accent-zinc-900"
                />
                <label htmlFor={`cat-${cat.name}`} className="text-sm font-medium text-zinc-800 w-24 cursor-pointer">
                  {cat.name}
                </label>
                <Input
                  type="number"
                  min={100}
                  max={5000}
                  step={50}
                  value={itemLimits[cat.name] ?? cat.defaultLimit}
                  onChange={(e) =>
                    setItemLimits((prev) => ({ ...prev, [cat.name]: Number(e.target.value) }))
                  }
                  disabled={!checkedPresets[cat.name]}
                  className="w-28 text-sm"
                />
                <span className="text-xs text-zinc-400">자</span>
              </div>
            ))}

            {/* Custom category */}
            <div className="flex items-center gap-3 pt-1 border-t border-zinc-100">
              <input
                type="checkbox"
                id="cat-custom"
                checked={useCustom}
                onChange={(e) => setUseCustom(e.target.checked)}
                className="size-4 cursor-pointer accent-zinc-900"
              />
              <label htmlFor="cat-custom" className="text-sm font-medium text-zinc-800 w-24 cursor-pointer">
                직접 입력
              </label>
              <Input
                placeholder="항목명"
                value={customCategory}
                onChange={(e) => setCustomCategory(e.target.value)}
                disabled={!useCustom}
                className="flex-1 text-sm"
              />
              <Input
                type="number"
                min={100}
                max={5000}
                step={50}
                value={customLimit}
                onChange={(e) => setCustomLimit(Number(e.target.value))}
                disabled={!useCustom}
                className="w-28 text-sm"
              />
              <span className="text-xs text-zinc-400">자</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-zinc-700">공통 설정</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-6">
            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-500">톤</Label>
              <Select
                value={globalTone}
                onValueChange={(v) => setGlobalTone(v as EssayTone)}
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TONES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-zinc-500">페르소나</Label>
              <Select
                value={globalPersona}
                onValueChange={(v) => setGlobalPersona(v as EssayPersona)}
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PERSONAS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {selectedItems.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {selectedItems.map((item) => (
              <Badge key={item.category} variant="secondary">
                {item.category} {item.charLimit}자
              </Badge>
            ))}
          </div>
        )}

        <div className="flex gap-3">
          <Button variant="outline" onClick={() => setStep("jd")}>
            공고 수정
          </Button>
          <Button onClick={handleGenerate} disabled={!canGenerate}>
            자소서 생성
          </Button>
        </div>
      </div>
    );
  }

  // ── Render: Step 3 — Generating (SSE progress) ────────────────────────────

  if (step === "generating") {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10 space-y-6">
        <div className="flex items-center gap-3">
          <Loader2 className="size-5 animate-spin text-zinc-500" />
          <h1 className="text-xl font-semibold text-zinc-900">자소서 생성 중...</h1>
        </div>

        {genError && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="pt-4 space-y-1">
              <p className="text-sm font-medium text-red-700">오류 발생</p>
              <p className="text-sm text-red-600">{genError}</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => setStep("items")}
              >
                돌아가기
              </Button>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-zinc-700">진행 상황</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
              {log.map((entry) => (
                <div key={entry.id} className="flex items-start gap-2 text-sm">
                  {entry.type === "error" ? (
                    <XCircle className="size-4 text-red-500 mt-0.5 shrink-0" />
                  ) : (
                    <CheckCircle className="size-4 text-emerald-500 mt-0.5 shrink-0" />
                  )}
                  <span
                    className={
                      entry.type === "error"
                        ? "text-red-600"
                        : entry.type === "start"
                          ? "font-medium text-zinc-800"
                          : "text-zinc-600"
                    }
                  >
                    {entry.message}
                  </span>
                </div>
              ))}
              {log.length === 0 && (
                <p className="text-sm text-zinc-400">준비 중...</p>
              )}
              <div ref={logEndRef} />
            </div>
          </CardContent>
        </Card>

        <p className="text-xs text-zinc-400">
          생성에는 1-2분이 소요될 수 있습니다. 페이지를 닫지 마세요.
        </p>
      </div>
    );
  }

  // ── Render: Step 4 — Done (results) ───────────────────────────────────────

  return (
    <div className="mx-auto max-w-3xl px-6 py-10 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-900">생성 완료</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setStep("items")}>
            항목 재선택
          </Button>
          <Button variant="outline" size="sm" onClick={() => { setStep("jd"); setResults([]); setLog([]); }}>
            처음부터
          </Button>
        </div>
      </div>

      {results.length === 0 && (
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-zinc-500">결과가 없습니다. 다시 시도해주세요.</p>
          </CardContent>
        </Card>
      )}

      {results.map((draft) => (
        <Card key={draft.category}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base">{draft.category}</CardTitle>
                <Badge
                  variant={
                    Math.abs(draft.char_count - draft.char_target) / draft.char_target < 0.05
                      ? "default"
                      : "outline"
                  }
                >
                  {charRatio(draft.char_count, draft.char_target)}
                </Badge>
                {draft.iteration > 1 && (
                  <Badge variant="secondary">{draft.iteration}회 조정</Badge>
                )}
              </div>
              <div className="flex items-center gap-3">
                {draft.evaluation_score !== null && (
                  <span className={`text-sm font-semibold ${scoreColor(draft.evaluation_score)}`}>
                    ★ {draft.evaluation_score.toFixed(1)}
                  </span>
                )}
                <CopyButton text={draft.content} />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              value={draft.content}
              readOnly
              rows={8}
              className="resize-none text-sm leading-relaxed bg-zinc-50"
            />
            {draft.evaluation_feedback && (
              <p className="text-xs text-zinc-500 leading-relaxed border-l-2 border-zinc-200 pl-3">
                {draft.evaluation_feedback}
              </p>
            )}
          </CardContent>
        </Card>
      ))}

      {/* Progress log summary */}
      {log.length > 0 && (
        <details className="text-xs text-zinc-400 cursor-pointer">
          <summary className="hover:text-zinc-600 transition-colors">생성 로그 보기</summary>
          <div className="mt-2 space-y-1 pl-2 border-l border-zinc-200">
            {log.map((entry) => (
              <p key={entry.id} className={entry.type === "error" ? "text-red-400" : ""}>
                {entry.message}
              </p>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
