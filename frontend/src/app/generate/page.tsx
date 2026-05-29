"use client";

import { useCallback, useRef, useState } from "react";
import { CheckCircle, XCircle, Loader2, Copy, Check, ChevronRight, AlertTriangle, Download } from "lucide-react";
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
import { generateEssays, saveToLibrary, fetchJobUrl, FetchUrlError } from "@/lib/api";
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
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [spaError, setSpaError] = useState<{ siteName: string | null; message: string } | null>(null);

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
  const [savedIds, setSavedIds] = useState<Record<string, number>>({});  // category → library id
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [editedContents, setEditedContents] = useState<Record<string, string>>({});

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
    setEditedContents({});

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
            {/^https?:\/\/\S+$/i.test(jd.trim()) && (
              <div className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-2.5 space-y-2">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="text-xs text-blue-700 leading-relaxed flex-1 min-w-0">
                    <strong>URL이 감지됐습니다.</strong> 가져오기를 누르면 페이지 텍스트를 추출해 자동으로 채웁니다.
                    사람인 등 일부 사이트는 차단되어 있어 실패할 수 있습니다.
                  </div>
                  <Button
                    size="sm"
                    onClick={async () => {
                      setFetching(true);
                      setFetchError(null);
                      setSpaError(null);
                      try {
                        const result = await fetchJobUrl(jd.trim());
                        setJd(result.text);
                      } catch (e) {
                        if (e instanceof FetchUrlError && e.code === "spa_site") {
                          setSpaError({ siteName: e.siteName, message: e.message });
                        } else {
                          setFetchError(e instanceof Error ? e.message : String(e));
                        }
                      } finally {
                        setFetching(false);
                      }
                    }}
                    disabled={fetching}
                    className="shrink-0"
                  >
                    {fetching ? (
                      <>
                        <Loader2 className="size-3.5 mr-1 animate-spin" />
                        가져오는 중...
                      </>
                    ) : (
                      <>
                        <Download className="size-3.5 mr-1" />
                        URL에서 가져오기
                      </>
                    )}
                  </Button>
                </div>
                {fetchError && (
                  <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                    <AlertTriangle className="size-3.5 mt-0.5 shrink-0" />
                    <span>{fetchError}</span>
                  </div>
                )}
              </div>
            )}

            {spaError && <SpaSiteGuide error={spaError} onClose={() => setSpaError(null)} />}
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

      {results.map((draft) => {
        const currentContent = editedContents[draft.category] ?? draft.content;
        const currentCharCount = currentContent.length;
        const isEdited = draft.category in editedContents;
        const charOk = Math.abs(currentCharCount - draft.char_target) / draft.char_target < 0.05;
        return (
        <Card key={draft.category}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base">{draft.category}</CardTitle>
                <Badge variant={charOk ? "default" : "outline"}>
                  {currentCharCount}자 / {draft.char_target}자
                </Badge>
                {isEdited && (
                  <Badge variant="secondary" className="text-xs">편집됨</Badge>
                )}
                {draft.iteration > 1 && (
                  <Badge variant="secondary">{draft.iteration}회 조정</Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                {draft.evaluation_score !== null && (
                  <span className={`text-sm font-semibold ${scoreColor(draft.evaluation_score)}`}>
                    ★ {draft.evaluation_score.toFixed(1)}
                  </span>
                )}
                <CopyButton text={currentContent} />
                {savedIds[draft.category] ? (
                  <Badge variant="secondary" className="text-xs">저장됨</Badge>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={saving[draft.category]}
                    onClick={async () => {
                      setSaving((p) => ({ ...p, [draft.category]: true }));
                      try {
                        const item = await saveToLibrary({
                          category: draft.category,
                          content: currentContent,
                          char_target: draft.char_target,
                          generation_metadata: {
                            evaluation_score: draft.evaluation_score,
                            evaluation_feedback: draft.evaluation_feedback,
                            iterations: draft.iteration,
                          },
                        });
                        setSavedIds((p) => ({ ...p, [draft.category]: item.id }));
                      } catch (e) {
                        alert(e instanceof Error ? e.message : String(e));
                      } finally {
                        setSaving((p) => ({ ...p, [draft.category]: false }));
                      }
                    }}
                  >
                    {saving[draft.category] ? "저장 중..." : "저장"}
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              value={currentContent}
              onChange={(e) =>
                setEditedContents((prev) => ({ ...prev, [draft.category]: e.target.value }))
              }
              rows={8}
              className="resize-y text-sm leading-relaxed"
            />
            {draft.evaluation_feedback && (
              <p className="text-xs text-zinc-500 leading-relaxed border-l-2 border-zinc-200 pl-3">
                {draft.evaluation_feedback}
              </p>
            )}
          </CardContent>
        </Card>
        );
      })}

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

// ─── SPA 사이트 안내 카드 ────────────────────────────────────────────────────

// 본문 추출 북마클릿. 사람인 같은 iframe 사이트는 iframe 안까지 파고들고,
// 접근 실패하면 iframe URL을 새 탭으로 열어 거기서 다시 실행할 수 있게 함.
// minify된 한 줄: javascript: URL은 줄바꿈/주석 들어가면 깨짐.
const BOOKMARKLET_CODE = `javascript:(function(){const isSaramin=/saramin\\.co\\.kr/.test(location.host);const isJobkorea=/jobkorea\\.co\\.kr/.test(location.host);if(isSaramin||isJobkorea){const iframes=Array.from(document.querySelectorAll('iframe[src]')).filter(f=>f.src&&!f.src.startsWith('about:'));let okIframe=null;for(const f of iframes){try{const d=f.contentDocument||f.contentWindow.document;if(d&&d.body&&d.body.innerText.length>500){okIframe=d;break;}}catch(e){}}if(okIframe){const t=okIframe.body.innerText;navigator.clipboard.writeText(t).then(()=>alert('✅ iframe 본문 '+t.length+'자 복사 완료!\\nHireAgent로 가서 Ctrl+V')).catch(()=>prompt('수동복사:',t.slice(0,5000)));return;}if(iframes.length>0){const choice=confirm('사람인/잡코리아 공고 본문은 iframe에 있는데 직접 접근이 막혀 있습니다.\\n\\nOK = iframe 본문 URL을 새 탭으로 열기 (거기서 다시 북마클릿 클릭)\\n취소 = Ctrl+P (PDF 저장) 방법을 안내');if(choice){window.open(iframes[0].src,'_blank');return;}else{alert('Ctrl+P → \"PDF로 저장\" → 저장한 PDF 열고 본문 드래그·복사 하세요.\\n이 방법이 사람인에 가장 잘 됩니다.');return;}}alert('iframe을 못 찾았습니다. Ctrl+P (PDF 저장) 방법을 사용하세요.');return;}const c=[];const sels=['.user_content','.job_summary','.wrap_jv_cont','.recruit-text','.detailDescription','#tab-1','.cont','article','main'];for(const s of sels){const el=document.querySelector(s);if(el&&el.innerText.length>200)c.push({s:s,t:el.innerText});}document.querySelectorAll('iframe').forEach(f=>{try{const d=f.contentDocument||f.contentWindow.document;if(d&&d.body&&d.body.innerText.length>200)c.push({s:'iframe',t:d.body.innerText});}catch(e){}});c.sort((a,b)=>b.t.length-a.t.length);const t=c.length>0?c[0].t:document.body.innerText;navigator.clipboard.writeText(t).then(()=>alert('✅ '+t.length+'자 복사됨 (출처: '+(c[0]?c[0].s:'body')+')\\nHireAgent로 가서 Ctrl+V')).catch(()=>prompt('수동복사:',t.slice(0,5000)));})();`;

function SpaSiteGuide({
  error, onClose,
}: {
  error: { siteName: string | null; message: string };
  onClose: () => void;
}) {
  const siteName = error.siteName ?? "이 사이트";
  const linkRef = useRef<HTMLAnchorElement>(null);
  const [codeCopied, setCodeCopied] = useState(false);

  // React가 javascript: href를 sanitize하는 것을 우회하기 위해
  // ref로 직접 DOM에 attribute 설정
  if (typeof window !== "undefined" && linkRef.current) {
    linkRef.current.setAttribute("href", BOOKMARKLET_CODE);
  }

  async function copyBookmarkletCode() {
    try {
      await navigator.clipboard.writeText(BOOKMARKLET_CODE);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    } catch {
      // ignore
    }
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-4 space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <AlertTriangle className="size-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-900">{siteName} 자동 추출 불가</p>
            <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">{error.message}</p>
            <p className="text-xs text-amber-700 mt-1">아래 중 가장 편한 방법으로 본문을 가져와서 위 텍스트 영역에 붙여넣어 주세요.</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-amber-700 hover:text-amber-900 text-xs underline shrink-0"
        >
          닫기
        </button>
      </div>

      {/* 사람인 한정 경고 */}
      {siteName === "사람인" && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-900 leading-relaxed">
          <strong>💡 사람인 팁:</strong> 사람인은 공고 본문이 iframe에 보호되어 있어 북마클릿도 한 번에 안 될 수 있어요.
          가장 빠른 방법은 <strong><kbd className="px-1 py-0.5 bg-white rounded text-[10px]">Ctrl+P</kbd> 인쇄 미리보기</strong>입니다 (아래 ②).
          북마클릿을 시도하면 본문 iframe URL을 새 탭으로 여는 옵션이 뜹니다.
        </div>
      )}

      {/* 옵션 1: 북마클릿 (가장 강력, 한 번 설치) */}
      <div className="bg-white border-2 border-emerald-300 rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded">⭐ 다른 사이트엔 가장 빠름</span>
          <span className="text-sm font-semibold text-zinc-800">① 북마클릿 (한 번 설치, 평생 사용)</span>
        </div>

        <div>
          <p className="text-xs text-zinc-700 leading-relaxed mb-2">
            <strong>방법 A — 드래그 (가장 쉬움):</strong>
          </p>
          <div className="flex items-center gap-3 flex-wrap pl-4">
            <a
              ref={linkRef}
              onClick={(e) => {
                e.preventDefault();
                alert("이 버튼은 클릭이 아니라 북마크 바에 끌어다 놓으세요!\n\n북마크 바가 안 보이면 Ctrl+Shift+B로 표시하세요.");
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded-md cursor-grab active:cursor-grabbing select-none"
              draggable
            >
              📋 공고 본문 추출
            </a>
            <span className="text-xs text-zinc-500">← 이 버튼을 마우스로 끌어서 북마크 바에 놓기</span>
          </div>
          <p className="text-xs text-zinc-400 mt-1.5 pl-4">
            북마크 바가 안 보이면 <kbd className="px-1 py-0.5 bg-zinc-100 rounded text-[10px]">Ctrl+Shift+B</kbd>로 표시
          </p>
        </div>

        <div className="border-t border-zinc-100 pt-3">
          <p className="text-xs text-zinc-700 leading-relaxed mb-2">
            <strong>방법 B — 수동 등록 (드래그가 안 되는 경우):</strong>
          </p>
          <ol className="text-xs text-zinc-600 leading-relaxed pl-4 space-y-1 list-decimal list-inside">
            <li>북마크 바에서 우클릭 → <strong>"페이지 추가"</strong> 또는 <kbd className="px-1 py-0.5 bg-zinc-100 rounded text-[10px]">Ctrl+D</kbd> 후 "더보기"</li>
            <li>이름: <code className="bg-zinc-100 px-1 rounded">공고 본문 추출</code></li>
            <li>URL 칸에 아래 코드 전체를 붙여넣기 → 저장</li>
          </ol>
          <div className="mt-2 pl-4">
            <button
              onClick={copyBookmarkletCode}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-zinc-100 hover:bg-zinc-200 text-xs font-medium text-zinc-700 rounded transition-colors"
            >
              {codeCopied ? <><Check className="size-3" /> 복사됨!</> : <><Copy className="size-3" /> 북마클릿 코드 복사</>}
            </button>
            <p className="text-xs text-zinc-400 mt-1">
              ※ Chrome 주소창에 직접 붙여넣어도 동작 안 함 (보안 차단). 반드시 북마크 URL 칸에 붙여넣어야 함.
            </p>
          </div>
        </div>

        <div className="border-t border-zinc-100 pt-3">
          <p className="text-xs text-zinc-700 leading-relaxed">
            <strong>사용:</strong> 사람인 등 채용 페이지를 연 상태에서 북마크 클릭 → "✅ 본문 N자 복사 완료!" 알림 뜨면 성공 → 이 페이지로 돌아와 Ctrl+V
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* 옵션 2: Ctrl+P 인쇄 → PDF 저장 → 텍스트 복사 */}
        <div className="bg-white border-2 border-blue-200 rounded-lg p-3">
          <div className="text-xs font-semibold text-zinc-800 mb-1.5">
            ② <kbd className="px-1 py-0.5 bg-zinc-100 rounded text-[10px]">Ctrl+P</kbd> → PDF 저장 → 복사 <span className="text-blue-600">(사람인 추천)</span>
          </div>
          <ol className="text-xs text-zinc-600 leading-relaxed space-y-0.5 list-decimal list-inside">
            <li>채용 페이지에서 <kbd className="px-1 py-0.5 bg-zinc-100 rounded text-[10px]">Ctrl+P</kbd></li>
            <li>대상을 <strong>"PDF로 저장"</strong>으로 변경 → 저장</li>
            <li>저장한 PDF 열기 → 본문 드래그 → <kbd className="px-1 py-0.5 bg-zinc-100 rounded text-[10px]">Ctrl+C</kbd></li>
          </ol>
          <p className="text-xs text-zinc-400 mt-1">iframe 본문도 함께 렌더링됨</p>
        </div>

        {/* 옵션 3: 페이지 소스 */}
        <div className="bg-white border border-amber-200 rounded-lg p-3">
          <div className="text-xs font-semibold text-zinc-800 mb-1.5">③ <kbd className="px-1 py-0.5 bg-zinc-100 rounded text-[10px]">Ctrl+U</kbd> 페이지 소스</div>
          <p className="text-xs text-zinc-600 leading-relaxed">
            HTML 원본이 새 탭에 열림. <kbd className="px-1 py-0.5 bg-zinc-100 rounded text-[10px]">Ctrl+F</kbd>로 직무 키워드 찾기 → 주변 텍스트 복사. 사이트 차단 무시. 조금 번거롭지만 확실.
          </p>
        </div>
      </div>

      <p className="text-xs text-amber-700 leading-relaxed">
        💡 사이트가 마우스 드래그를 막아도 위 방법은 모두 통합니다. 북마클릿이 가장 빠르고, 인쇄 미리보기는 즉시 가능.
      </p>
    </div>
  );
}
