"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Trash2, Search, Loader2, FolderGit2, FolderOpen,
  Upload, Type, ChevronDown, ChevronUp, CheckCircle2, X, FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  indexProject, indexGitHub, indexFile,
  listProjects, deleteProject, deleteProjectByName, searchProjects,
  type ProjectDocResponse, type SearchResult,
} from "@/lib/api";

// ─── 상수 ────────────────────────────────────────────────────────────────────

const SOURCE_LABELS: Record<string, string> = {
  resume: "이력서",
  essay: "기존 자소서",
  project_readme: "프로젝트 README",
  project_doc: "프로젝트 문서",
  custom: "기타 경험",
};

type CardType = "resume" | "github" | "custom";

const CARDS = {
  resume: {
    title: "이력서",
    icon: Upload,
    hint: "PDF · DOCX · MD · TXT",
    desc: "이력서 파일을 업로드하면 경력·기술·프로젝트가 자소서에 자동 반영됩니다.",
    defaultSourceType: "resume",
  },
  github: {
    title: "GitHub 레포",
    icon: FolderGit2,
    hint: "공개 레포 URL",
    desc: "README와 docs 폴더를 자동 수집합니다. 비공개 레포는 먼저 공개 전환이 필요합니다.",
    defaultSourceType: "project_readme",
  },
  custom: {
    title: "경험 · 자소서",
    icon: Type,
    hint: "텍스트 직접 입력",
    desc: "기존 자소서, 경력기술서, 수상 경험 등을 자유 형식으로 입력합니다.",
    defaultSourceType: "custom",
  },
} as const;

function getCardType(sourceType: string): CardType {
  if (sourceType === "resume") return "resume";
  if (sourceType === "project_readme" || sourceType === "project_doc") return "github";
  return "custom";
}

function groupByProject(docs: ProjectDocResponse[]) {
  const map = new Map<string, ProjectDocResponse[]>();
  for (const d of docs) {
    const key = d.project_name ?? `__${d.source_type}_${d.id}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(d);
  }
  return map;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

// ─── 메인 페이지 ─────────────────────────────────────────────────────────────

export default function ProjectsPage() {
  const [docs, setDocs] = useState<ProjectDocResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCard, setActiveCard] = useState<CardType | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [showSearch, setShowSearch] = useState(false);

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    try { setDocs(await listProjects()); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  const grouped = useMemo(() => {
    const map: Record<CardType, ProjectDocResponse[]> = { resume: [], github: [], custom: [] };
    for (const doc of docs) map[getCardType(doc.source_type)].push(doc);
    return map;
  }, [docs]);

  const totalChunks = docs.length;

  async function handleDeleteChunk(id: number) {
    if (!confirm("이 항목을 삭제할까요?")) return;
    await deleteProject(id);
    setDocs(prev => prev.filter(d => d.id !== id));
  }

  async function handleDeleteProject(name: string) {
    if (!confirm(`"${name}"의 모든 청크를 삭제할까요?`)) return;
    await deleteProjectByName(name);
    await fetchDocs();
  }

  async function handleSearch() {
    if (searchQuery.trim().length < 2) return;
    setSearching(true);
    try { setSearchResults(await searchProjects(searchQuery.trim(), 5)); }
    catch (e) { alert(e instanceof Error ? e.message : String(e)); }
    finally { setSearching(false); }
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-10 space-y-8">

      {/* 헤더 */}
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">내 커리어 데이터</h1>
        <p className="text-sm text-zinc-500 mt-0.5">
          이력서·프로젝트·경험을 등록하면 자소서 생성 시 자동으로 참고합니다.
        </p>
        {totalChunks > 0 && (
          <p className="text-xs text-zinc-400 mt-1">{totalChunks}개 청크 인덱싱됨</p>
        )}
      </div>

      {/* ── 3-카드 선택 영역 ── */}
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-zinc-400 py-6">
          <Loader2 className="size-4 animate-spin" /> 불러오는 중...
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            {(Object.keys(CARDS) as CardType[]).map(type => {
              const { title, icon: Icon, hint } = CARDS[type];
              const count = groupByProject(grouped[type]).size;
              const isActive = activeCard === type;
              return (
                <button
                  key={type}
                  onClick={() => setActiveCard(isActive ? null : type)}
                  className={`
                    relative text-left rounded-xl border-2 p-4 h-28 flex flex-col justify-between
                    transition-all duration-150 cursor-pointer
                    ${isActive
                      ? "border-zinc-800 bg-zinc-50 shadow-sm"
                      : "border-zinc-200 bg-white hover:border-zinc-400 hover:shadow-sm"
                    }
                  `}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon className={`size-4 ${isActive ? "text-zinc-700" : "text-zinc-400"}`} />
                      <span className="text-sm font-medium text-zinc-800">{title}</span>
                    </div>
                    {count > 0 && (
                      <Badge variant="secondary" className="text-xs">{count}</Badge>
                    )}
                  </div>
                  <p className={`text-xs ${isActive ? "text-zinc-500" : "text-zinc-400"}`}>{hint}</p>
                </button>
              );
            })}
          </div>

          {/* ── 인라인 폼 패널 ── */}
          {activeCard && (
            <AddFormPanel
              type={activeCard}
              onClose={() => setActiveCard(null)}
              onRefresh={fetchDocs}
            />
          )}

          {/* ── 인덱싱된 데이터 (디렉토리) ── */}
          {totalChunks > 0 && (
            <DataDirectory
              grouped={grouped}
              onDeleteChunk={handleDeleteChunk}
              onDeleteProject={handleDeleteProject}
            />
          )}
        </>
      )}

      {/* ── RAG 검색 ── */}
      {totalChunks > 0 && (
        <div className="border-t border-zinc-100 pt-4">
          <button
            onClick={() => setShowSearch(p => !p)}
            className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-700 transition-colors"
          >
            {showSearch ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
            RAG 검색 확인
          </button>
          {showSearch && (
            <div className="mt-3 space-y-3">
              <div className="flex gap-2">
                <Input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="예: LangGraph 멀티에이전트, FastAPI 백엔드"
                  onKeyDown={e => e.key === "Enter" && handleSearch()}
                />
                <Button size="sm" onClick={handleSearch} disabled={searching || searchQuery.trim().length < 2}>
                  {searching ? <Loader2 className="size-3.5 animate-spin" /> : <Search className="size-3.5" />}
                </Button>
              </div>
              {searchResults && (
                <div className="space-y-2">
                  {searchResults.length === 0 && (
                    <p className="text-xs text-zinc-400">매칭 결과 없음</p>
                  )}
                  {searchResults.map(r => (
                    <div key={r.id} className="text-xs border-l-2 border-blue-200 pl-3 py-1.5">
                      <div className="flex gap-2 text-zinc-400 mb-1">
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

// ─── 폼 패널 ─────────────────────────────────────────────────────────────────

function AddFormPanel({
  type, onClose, onRefresh,
}: {
  type: CardType;
  onClose: () => void;
  onRefresh: () => Promise<void>;
}) {
  const config = CARDS[type];

  const [indexing, setIndexing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [sourceType, setSourceType] = useState(config.defaultSourceType);
  const [projectName, setProjectName] = useState("");
  const [techStack, setTechStack] = useState("");
  const [content, setContent] = useState("");
  const [repoUrl, setRepoUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setContent(""); setRepoUrl(""); setFile(null);
    setProjectName(""); setTechStack("");
    setError(null); setSuccess(null);
    setSourceType(config.defaultSourceType);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleIndex() {
    setIndexing(true); setError(null); setSuccess(null);
    try {
      if (type === "resume") {
        if (!file) throw new Error("파일을 선택하세요.");
        const r = await indexFile(file, {
          source_type: "resume",
          project_name: projectName.trim() || undefined,
          tech_stack: techStack.trim() || undefined,
        });
        setSuccess(`${file.name} — ${r.chunks_created}개 청크 완료`);
      } else if (type === "github") {
        if (!repoUrl.trim()) throw new Error("GitHub repo URL을 입력하세요.");
        const r = await indexGitHub({
          repo_url: repoUrl.trim(),
          tech_stack: techStack.split(",").map(s => s.trim()).filter(Boolean),
        });
        setSuccess(`${r.owner}/${r.repo} — ${r.files_indexed}개 파일, ${r.total_chunks}개 청크 완료`);
      } else {
        if (content.trim().length < 20) throw new Error("텍스트가 너무 짧습니다 (20자 이상).");
        const r = await indexProject({
          content: content.trim(),
          source_type: sourceType,
          project_name: projectName.trim() || undefined,
          tech_stack: techStack.split(",").map(s => s.trim()).filter(Boolean),
        });
        setSuccess(`${r.chunks_created}개 청크 인덱싱 완료`);
      }
      await onRefresh();
      reset();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIndexing(false);
    }
  }

  return (
    <div className="border border-zinc-200 rounded-xl p-5 space-y-4 bg-zinc-50">
      {/* 패널 헤더 */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-zinc-800">{config.title} 인덱싱</p>
          <p className="text-xs text-zinc-500 mt-0.5">{config.desc}</p>
        </div>
        <button onClick={onClose} className="text-zinc-400 hover:text-zinc-700 transition-colors mt-0.5">
          <X className="size-4" />
        </button>
      </div>

      {/* 폼 필드 */}
      {type === "resume" && (
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-zinc-600">파일 *</Label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.md,.markdown,.txt"
              onChange={e => setFile(e.target.files?.[0] ?? null)}
              className="mt-1.5 block w-full text-sm text-zinc-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-white file:text-zinc-700 hover:file:bg-zinc-100 cursor-pointer file:shadow-sm file:border file:border-zinc-200"
            />
            {file && (
              <p className="text-xs text-zinc-400 mt-1">{file.name} ({(file.size / 1024).toFixed(1)} KB)</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-zinc-600">레이블 <span className="text-zinc-400">(선택)</span></Label>
              <Input className="mt-1.5 h-8 text-sm" value={projectName} onChange={e => setProjectName(e.target.value)} placeholder="예: 사람인 이력서" />
            </div>
            <div>
              <Label className="text-xs text-zinc-600">기술 스택 <span className="text-zinc-400">(쉼표 구분)</span></Label>
              <Input className="mt-1.5 h-8 text-sm" value={techStack} onChange={e => setTechStack(e.target.value)} placeholder="Python, FastAPI" />
            </div>
          </div>
        </div>
      )}

      {type === "github" && (
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-zinc-600">GitHub Repo URL *</Label>
            <Input className="mt-1.5 h-8 text-sm" value={repoUrl} onChange={e => setRepoUrl(e.target.value)} placeholder="https://github.com/owner/repo" />
            <p className="text-xs text-zinc-400 mt-1">공개 레포만 지원 · 무인증 rate limit 60/h · 프로젝트명은 owner/repo로 자동 저장</p>
          </div>
          <div>
            <Label className="text-xs text-zinc-600">기술 스택 <span className="text-zinc-400">(쉼표 구분, 선택)</span></Label>
            <Input className="mt-1.5 h-8 text-sm" value={techStack} onChange={e => setTechStack(e.target.value)} placeholder="Python, FastAPI, LangGraph" />
          </div>
        </div>
      )}

      {type === "custom" && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-zinc-600">유형</Label>
              <Select value={sourceType} onValueChange={v => v && setSourceType(v)}>
                <SelectTrigger className="mt-1.5 h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="essay">기존 자소서</SelectItem>
                  <SelectItem value="custom">기타 경험</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-zinc-600">제목 <span className="text-zinc-400">(선택)</span></Label>
              <Input className="mt-1.5 h-8 text-sm" value={projectName} onChange={e => setProjectName(e.target.value)} placeholder="예: 경력기술서" />
            </div>
          </div>
          <div>
            <Label className="text-xs text-zinc-600">텍스트 *</Label>
            <Textarea
              rows={6}
              className="mt-1.5 text-sm font-mono resize-none"
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="내용을 붙여넣거나 입력하세요..."
            />
            <p className="text-xs text-zinc-400 mt-0.5">{content.length.toLocaleString()}자</p>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}
      {success && (
        <div className="flex items-center gap-2 text-sm text-emerald-600">
          <CheckCircle2 className="size-4 shrink-0" />
          {success}
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <Button onClick={handleIndex} disabled={indexing}>
          {indexing
            ? <><Loader2 className="size-4 mr-1.5 animate-spin" />{type === "github" ? "가져오는 중..." : "인덱싱 중..."}</>
            : "인덱싱 시작"
          }
        </Button>
        <Button variant="outline" onClick={onClose}>취소</Button>
      </div>
    </div>
  );
}

// ─── 디렉토리 뷰 ─────────────────────────────────────────────────────────────

function DataDirectory({
  grouped, onDeleteChunk, onDeleteProject,
}: {
  grouped: Record<CardType, ProjectDocResponse[]>;
  onDeleteChunk: (id: number) => void;
  onDeleteProject: (name: string) => void;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-3">인덱싱된 데이터</p>
      {(Object.keys(CARDS) as CardType[]).map(type => {
        const { title, icon: Icon } = CARDS[type];
        const items = Array.from(groupByProject(grouped[type]).entries());
        return (
          <DirectorySection
            key={type}
            title={title}
            icon={Icon}
            items={items}
            onDeleteChunk={onDeleteChunk}
            onDeleteProject={onDeleteProject}
          />
        );
      })}
    </div>
  );
}

function DirectorySection({
  title, icon: Icon, items, onDeleteChunk, onDeleteProject,
}: {
  title: string;
  icon: React.ElementType;
  items: [string, ProjectDocResponse[]][];
  onDeleteChunk: (id: number) => void;
  onDeleteProject: (name: string) => void;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div className="rounded-lg border border-zinc-100 overflow-hidden">
      {/* 폴더 헤더 */}
      <button
        onClick={() => setOpen(p => !p)}
        className="w-full flex items-center gap-2 px-4 py-2.5 bg-zinc-50 hover:bg-zinc-100 transition-colors text-left"
      >
        {open
          ? <FolderOpen className="size-4 text-zinc-400" />
          : <Icon className="size-4 text-zinc-400" />
        }
        <span className="text-xs font-medium text-zinc-600">{title}</span>
        {items.length > 0 && (
          <Badge variant="outline" className="text-xs ml-auto">{items.length}</Badge>
        )}
        {open
          ? <ChevronUp className="size-3.5 text-zinc-400 ml-1" />
          : <ChevronDown className="size-3.5 text-zinc-400 ml-1" />
        }
      </button>

      {/* 파일 목록 */}
      {open && (
        <div>
          {items.length === 0 ? (
            <p className="text-xs text-zinc-300 px-4 py-3">데이터 없음</p>
          ) : (
            items.map(([key, chunks]) => {
              const first = chunks[0];
              const isProject = first.project_name === key;
              const displayName = first.project_name ?? SOURCE_LABELS[first.source_type] ?? first.source_type;
              const totalChunks = chunks.length;

              return (
                <div
                  key={key}
                  className="flex items-center gap-3 px-4 py-2.5 border-t border-zinc-100 hover:bg-zinc-50 group transition-colors"
                >
                  <FileText className="size-3.5 text-zinc-300 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-zinc-700 truncate block">{displayName}</span>
                    <span className="text-xs text-zinc-400">{totalChunks}청크 · {formatDate(first.indexed_at)}</span>
                  </div>
                  <button
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded text-zinc-400 hover:text-red-500 hover:bg-red-50 shrink-0"
                    onClick={() =>
                      isProject && first.project_name
                        ? onDeleteProject(first.project_name)
                        : onDeleteChunk(first.id)
                    }
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
