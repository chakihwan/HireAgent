"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Plus, Trash2, Search, Loader2, FileText, FolderGit2,
  Upload, Type, ChevronDown, ChevronUp, CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  indexProject,
  indexGitHub,
  indexFile,
  listProjects,
  deleteProject,
  deleteProjectByName,
  searchProjects,
  type ProjectDocResponse,
  type SearchResult,
} from "@/lib/api";

const SOURCE_TYPES = [
  { value: "resume", label: "이력서", desc: "경력/학력/기술 등 이력서 전체" },
  { value: "essay", label: "기존 자소서", desc: "과거에 작성한 자소서, 합격 사례 포함" },
  { value: "project_readme", label: "프로젝트 README", desc: "GitHub README, 프로젝트 설명 문서" },
  { value: "project_doc", label: "프로젝트 문서", desc: "설계서, 회고, 기술 블로그 포스트" },
  { value: "custom", label: "기타 경험", desc: "수상, 자격증, 활동 등 기타 경험" },
] as const;

const SOURCE_LABELS: Record<string, string> = Object.fromEntries(
  SOURCE_TYPES.map((s) => [s.value, s.label]),
);

type InputMode = "file" | "github" | "text";

const MODE_CONFIG = {
  file: {
    label: "파일 업로드",
    icon: Upload,
    defaultSourceType: "resume",
    tip: "이력서(PDF/DOCX), README(MD), 자소서(TXT) 등을 업로드합니다. 암호화된 PDF는 텍스트 추출이 안 될 수 있어요.",
  },
  github: {
    label: "GitHub Repo",
    icon: FolderGit2,
    defaultSourceType: "project_readme",
    tip: "공개 레포의 README + docs/*.md를 자동 수집합니다. 비공개 레포는 공개 전환 후 인덱싱하세요.",
  },
  text: {
    label: "텍스트 직접 입력",
    icon: Type,
    defaultSourceType: "custom",
    tip: "복사·붙여넣기로 자유롭게 입력합니다. 형식이 없는 경험 기술서, 자유 양식 이력서 등에 적합해요.",
  },
} as const;

const QUICK_ACTIONS = [
  {
    mode: "file" as InputMode,
    icon: Upload,
    title: "이력서 업로드",
    desc: "PDF·DOCX·MD·TXT 파일로 인덱싱",
    sourceType: "resume",
  },
  {
    mode: "github" as InputMode,
    icon: FolderGit2,
    title: "GitHub 레포 인덱싱",
    desc: "공개 레포 README + docs 자동 수집",
    sourceType: "project_readme",
  },
  {
    mode: "text" as InputMode,
    icon: Type,
    title: "텍스트로 입력",
    desc: "복사·붙여넣기로 자유 형식 입력",
    sourceType: "custom",
  },
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

export default function ProjectsPage() {
  const [docs, setDocs] = useState<ProjectDocResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [mode, setMode] = useState<InputMode>("file");

  const [sourceType, setSourceType] = useState<string>("resume");
  const [projectName, setProjectName] = useState("");
  const [category, setCategory] = useState("");
  const [techStack, setTechStack] = useState("");
  const [content, setContent] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [indexing, setIndexing] = useState(false);
  const [indexError, setIndexError] = useState<string | null>(null);
  const [indexSuccess, setIndexSuccess] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [showSearch, setShowSearch] = useState(false);

  async function fetchDocs() {
    setLoading(true);
    try {
      setDocs(await listProjects());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchDocs(); }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, ProjectDocResponse[]>();
    for (const d of docs) {
      const key = d.project_name ?? `__${d.source_type}_${d.id}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(d);
    }
    return Array.from(map.entries());
  }, [docs]);

  function openFormWithMode(m: InputMode, st?: string) {
    resetForm();
    setMode(m);
    setSourceType(st ?? MODE_CONFIG[m].defaultSourceType);
    setShowForm(true);
    setTimeout(() => {
      document.getElementById("add-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

  function switchMode(m: InputMode) {
    setMode(m);
    setSourceType(MODE_CONFIG[m].defaultSourceType);
    setIndexError(null);
    setIndexSuccess(null);
  }

  function resetForm() {
    setContent(""); setRepoUrl(""); setFile(null);
    setProjectName(""); setCategory(""); setTechStack("");
    setIndexError(null); setIndexSuccess(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleIndex() {
    setIndexing(true);
    setIndexError(null);
    setIndexSuccess(null);
    try {
      if (mode === "text") {
        if (content.trim().length < 20) throw new Error("텍스트가 너무 짧습니다 (20자 이상).");
        const result = await indexProject({
          content: content.trim(),
          source_type: sourceType,
          project_name: projectName.trim() || undefined,
          category: category.trim() || undefined,
          tech_stack: techStack.split(",").map((s) => s.trim()).filter(Boolean),
        });
        setIndexSuccess(`${result.chunks_created}개 청크 인덱싱 완료`);
      } else if (mode === "github") {
        if (!repoUrl.trim()) throw new Error("GitHub repo URL을 입력하세요.");
        const result = await indexGitHub({
          repo_url: repoUrl.trim(),
          category: category.trim() || undefined,
          tech_stack: techStack.split(",").map((s) => s.trim()).filter(Boolean),
        });
        setIndexSuccess(
          `${result.owner}/${result.repo} — ${result.files_indexed}개 파일, ${result.total_chunks}개 청크 인덱싱 완료`,
        );
      } else if (mode === "file") {
        if (!file) throw new Error("파일을 선택하세요.");
        const result = await indexFile(file, {
          source_type: sourceType,
          project_name: projectName.trim() || undefined,
          category: category.trim() || undefined,
          tech_stack: techStack.trim() || undefined,
        });
        setIndexSuccess(`${file.name} — ${result.chunks_created}개 청크 인덱싱 완료`);
      }
      await fetchDocs();
      resetForm();
    } catch (e) {
      setIndexError(e instanceof Error ? e.message : String(e));
    } finally {
      setIndexing(false);
    }
  }

  async function handleDeleteChunk(id: number) {
    if (!confirm("이 청크를 삭제할까요?")) return;
    try {
      await deleteProject(id);
      setDocs((prev) => prev.filter((d) => d.id !== id));
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleDeleteProject(name: string) {
    if (!confirm(`"${name}"의 모든 청크를 삭제할까요?`)) return;
    try {
      await deleteProjectByName(name);
      await fetchDocs();
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleSearch() {
    if (searchQuery.trim().length < 2) return;
    setSearching(true);
    try {
      setSearchResults(await searchProjects(searchQuery.trim(), 5));
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setSearching(false);
    }
  }

  const modeInfo = MODE_CONFIG[mode];
  const hasData = docs.length > 0;

  return (
    <div className="mx-auto max-w-3xl px-6 py-10 space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">내 커리어 데이터</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            이력서·프로젝트·경험을 등록하면 자소서 생성 시 자동으로 참고합니다.
          </p>
          {hasData && (
            <p className="text-xs text-zinc-400 mt-1">
              {grouped.length}개 항목 · {docs.length}개 청크 인덱싱됨
            </p>
          )}
        </div>
        {hasData && (
          <Button size="sm" onClick={() => { if (!showForm) openFormWithMode(mode); else setShowForm(false); }}>
            <Plus className="size-4 mr-1" />
            데이터 추가
          </Button>
        )}
      </div>

      {/* How it works — shown when data exists */}
      {hasData && (
        <div className="flex items-start gap-2 text-xs text-zinc-500 bg-zinc-50 border border-zinc-200 rounded-lg px-4 py-3">
          <span className="shrink-0 font-semibold text-zinc-600">흐름</span>
          <span>데이터 등록 → 아래 검색으로 RAG 매칭 확인 → /generate 에서 자소서 생성 시 자동 참고</span>
        </div>
      )}

      {/* Add form */}
      {showForm && (
        <Card id="add-form">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">새 데이터 인덱싱</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Mode tabs */}
            <div className="flex gap-1 bg-zinc-100 rounded-lg p-1">
              {(Object.keys(MODE_CONFIG) as InputMode[]).map((key) => {
                const { label, icon: Icon } = MODE_CONFIG[key];
                return (
                  <button
                    key={key}
                    onClick={() => switchMode(key)}
                    className={`flex-1 flex items-center justify-center gap-1.5 text-xs py-2 rounded-md font-medium transition-colors ${
                      mode === key
                        ? "bg-white text-zinc-900 shadow-sm"
                        : "text-zinc-500 hover:text-zinc-700"
                    }`}
                  >
                    <Icon className="size-3.5" />
                    {label}
                  </button>
                );
              })}
            </div>

            {/* Mode tip */}
            <p className="text-xs text-zinc-400 leading-relaxed -mt-1">{modeInfo.tip}</p>

            {/* Metadata */}
            <div className="grid grid-cols-2 gap-3">
              {mode !== "github" && (
                <div className="space-y-1.5">
                  <Label className="text-xs">유형 *</Label>
                  <Select value={sourceType} onValueChange={(v) => v && setSourceType(v)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SOURCE_TYPES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          <div>
                            <span>{s.label}</span>
                            <span className="text-zinc-400 text-xs ml-1.5 hidden sm:inline">— {s.desc}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {mode !== "github" && (
                <div className="space-y-1.5">
                  <Label className="text-xs">프로젝트명</Label>
                  <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="예: HireAgent" />
                </div>
              )}
              <div className="space-y-1.5">
                <Label className="text-xs">카테고리</Label>
                <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="예: AI/ML, Backend" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">기술 스택 <span className="text-zinc-400">(쉼표 구분)</span></Label>
                <Input value={techStack} onChange={(e) => setTechStack(e.target.value)} placeholder="Python, FastAPI" />
              </div>
            </div>

            {/* Mode-specific input */}
            {mode === "file" && (
              <div className="space-y-2">
                <Label className="text-xs">파일 *</Label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx,.md,.markdown,.txt"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-sm text-zinc-700 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-medium file:bg-zinc-100 file:text-zinc-700 hover:file:bg-zinc-200 cursor-pointer"
                />
                {file && (
                  <p className="text-xs text-zinc-500">
                    선택됨: <span className="font-mono">{file.name}</span> ({(file.size / 1024).toFixed(1)} KB)
                  </p>
                )}
              </div>
            )}

            {mode === "github" && (
              <div className="space-y-1.5">
                <Label className="text-xs">GitHub Repo URL *</Label>
                <Input
                  value={repoUrl}
                  onChange={(e) => setRepoUrl(e.target.value)}
                  placeholder="https://github.com/owner/repo"
                />
                <p className="text-xs text-zinc-400">
                  프로젝트명은 자동으로 <code className="bg-zinc-100 px-1 rounded">owner/repo</code> 형식으로 저장됩니다.
                  무인증 API rate limit 60/h.
                </p>
              </div>
            )}

            {mode === "text" && (
              <div className="space-y-1.5">
                <Label className="text-xs">텍스트 *</Label>
                <Textarea
                  rows={10}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="이력서·README·자소서 내용을 붙여넣으세요 (최소 20자)..."
                  className="font-mono text-sm"
                />
                <p className="text-xs text-zinc-400">{content.length.toLocaleString()}자</p>
              </div>
            )}

            {indexError && <p className="text-xs text-red-500 leading-relaxed">{indexError}</p>}
            {indexSuccess && (
              <div className="flex items-center gap-2 text-xs text-emerald-600">
                <CheckCircle2 className="size-3.5 shrink-0" />
                {indexSuccess}
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <Button size="sm" onClick={handleIndex} disabled={indexing}>
                {indexing ? (
                  <><Loader2 className="size-3.5 mr-1 animate-spin" />{mode === "github" ? "가져오는 중..." : "인덱싱 중..."}</>
                ) : (
                  "인덱싱 시작"
                )}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowForm(false)}>닫기</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Document list */}
      {loading && <p className="text-sm text-zinc-400 py-4">불러오는 중...</p>}

      {!loading && !hasData && !showForm && (
        <EmptyState onAction={openFormWithMode} />
      )}

      {!loading && hasData && (
        <div className="space-y-3">
          {grouped.map(([key, chunks]) => {
            const first = chunks[0];
            const isProjectGroup = first.project_name === key;
            return (
              <Card key={key}>
                <CardContent className="pt-4 pb-4 space-y-2">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="secondary" className="text-xs">
                        {SOURCE_LABELS[first.source_type] ?? first.source_type}
                      </Badge>
                      {first.project_name && (
                        <span className="font-medium text-zinc-900 text-sm">{first.project_name}</span>
                      )}
                      {first.category && (
                        <span className="text-sm text-zinc-500">· {first.category}</span>
                      )}
                      <Badge variant="outline" className="text-xs">{chunks.length}개 청크</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-zinc-400">{formatDate(first.indexed_at)}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-zinc-400 hover:text-red-500"
                        onClick={() =>
                          isProjectGroup && first.project_name
                            ? handleDeleteProject(first.project_name)
                            : handleDeleteChunk(first.id)
                        }
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                  {first.tech_stack.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {first.tech_stack.map((t) => (
                        <Badge key={t} variant="outline" className="text-xs">{t}</Badge>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-zinc-500 line-clamp-2 leading-relaxed">{first.content}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Search — secondary, shown when data exists */}
      {hasData && (
        <div className="border-t border-zinc-100 pt-4">
          <button
            onClick={() => setShowSearch((p) => !p)}
            className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-800 transition-colors mb-3"
          >
            {showSearch ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
            RAG 검색 확인 (등록된 데이터가 자소서에 잘 매칭되는지 테스트)
          </button>
          {showSearch && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="예: LangGraph 멀티에이전트, FastAPI 백엔드 개발"
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                />
                <Button size="sm" onClick={handleSearch} disabled={searching || searchQuery.trim().length < 2}>
                  {searching ? <Loader2 className="size-3.5 animate-spin" /> : <Search className="size-3.5" />}
                </Button>
              </div>
              {searchResults && (
                <div className="space-y-2">
                  {searchResults.length === 0 && (
                    <p className="text-xs text-zinc-400">매칭 결과 없음 — 다른 키워드를 시도해보세요.</p>
                  )}
                  {searchResults.map((r) => (
                    <div key={r.id} className="text-xs border-l-2 border-blue-200 pl-3 py-1.5">
                      <div className="flex items-center gap-2 text-zinc-400 mb-1">
                        <span>유사도 {(1 - r.distance).toFixed(3)}</span>
                        <span>·</span>
                        <span>{SOURCE_LABELS[r.source_type] ?? r.source_type}</span>
                        {r.project_name && <><span>·</span><span className="text-zinc-600">{r.project_name}</span></>}
                      </div>
                      <p className="text-zinc-700 leading-relaxed line-clamp-3">{r.content}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EmptyState({ onAction }: { onAction: (mode: InputMode, sourceType?: string) => void }) {
  return (
    <div className="space-y-6 py-2">
      {/* Step guide */}
      <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-5 space-y-4">
        <p className="text-sm font-medium text-zinc-800">시작하는 방법</p>
        <div className="space-y-3">
          {[
            { step: "1", text: "이력서·프로젝트 경험을 아래에서 등록합니다." },
            { step: "2", text: "등록 후 RAG 검색으로 잘 인덱싱됐는지 확인합니다." },
            { step: "3", text: "/generate 에서 자소서 생성 시 자동으로 경험이 반영됩니다." },
          ].map(({ step, text }) => (
            <div key={step} className="flex items-start gap-3">
              <span className="shrink-0 size-5 rounded-full bg-zinc-200 text-zinc-600 text-xs font-semibold flex items-center justify-center mt-0.5">
                {step}
              </span>
              <p className="text-sm text-zinc-600">{text}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Quick action cards */}
      <div>
        <p className="text-xs text-zinc-400 mb-3 font-medium uppercase tracking-wide">데이터 추가 방법 선택</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {QUICK_ACTIONS.map(({ mode, icon: Icon, title, desc, sourceType }) => (
            <button
              key={mode}
              onClick={() => onAction(mode, sourceType)}
              className="text-left border border-zinc-200 rounded-xl p-4 hover:border-zinc-400 hover:bg-zinc-50 transition-all group"
            >
              <Icon className="size-5 text-zinc-400 group-hover:text-zinc-700 mb-2 transition-colors" />
              <p className="text-sm font-medium text-zinc-800">{title}</p>
              <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">{desc}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="text-center">
        <p className="text-xs text-zinc-400">
          이력서부터 시작하는 걸 추천합니다. PDF·DOCX·MD·TXT 모두 지원해요.
        </p>
      </div>
    </div>
  );
}
