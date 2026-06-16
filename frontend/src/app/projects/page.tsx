"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Trash2, Search, Loader2, FolderGit2, FolderOpen,
  Upload, Type, ChevronDown, ChevronUp, CheckCircle2, X, FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  searchProjects,
  type ProjectDocResponse, type SearchResult,
} from "@/lib/api";
import {
  useProjects, useIndexProject, useIndexGitHub, useIndexFile,
  useDeleteProject, useDeleteProjectByName,
} from "@/lib/queries";

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
  const projectsQ = useProjects();
  const docs = useMemo(() => projectsQ.data ?? [], [projectsQ.data]);
  const loading = projectsQ.isLoading;

  const deleteChunkMut = useDeleteProject();
  const deleteProjectMut = useDeleteProjectByName();

  const [activeCard, setActiveCard] = useState<CardType | null>(null);

  const [previewItem, setPreviewItem] = useState<{
    name: string;
    chunks: ProjectDocResponse[];
  } | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [showSearch, setShowSearch] = useState(false);

  const grouped = useMemo(() => {
    const map: Record<CardType, ProjectDocResponse[]> = { resume: [], github: [], custom: [] };
    for (const doc of docs) map[getCardType(doc.source_type)].push(doc);
    return map;
  }, [docs]);

  const totalChunks = docs.length;

  function handleDeleteChunk(id: number) {
    if (!confirm("이 항목을 삭제할까요?")) return;
    deleteChunkMut.mutate(id, {
      onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
    });
  }

  function handleDeleteProject(name: string) {
    if (!confirm(`"${name}"의 모든 청크를 삭제할까요?`)) return;
    deleteProjectMut.mutate(name, {
      onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
    });
  }

  async function handleSearch() {
    if (searchQuery.trim().length < 2) return;
    setSearching(true);
    try { setSearchResults(await searchProjects(searchQuery.trim(), 5)); }
    catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    finally { setSearching(false); }
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-10 space-y-8">

      {/* 헤더 */}
      <div>
        <h1 className="text-xl font-semibold text-foreground">내 커리어 데이터</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          이력서·프로젝트·경험을 등록하면 자소서 생성 시 자동으로 참고합니다.
        </p>
        {totalChunks > 0 && (
          <p className="text-xs text-muted-foreground mt-1">{totalChunks}개 청크 인덱싱됨</p>
        )}
      </div>

      {/* ── 3-카드 선택 영역 ── */}
      {loading ? (
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
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
                      ? "border-foreground bg-muted shadow-sm"
                      : "border-border bg-card hover:border-muted-foreground hover:shadow-sm"
                    }
                  `}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon className={`size-4 ${isActive ? "text-foreground" : "text-muted-foreground"}`} />
                      <span className="text-sm font-medium text-foreground">{title}</span>
                    </div>
                    {count > 0 && (
                      <Badge variant="secondary" className="text-xs">{count}</Badge>
                    )}
                  </div>
                  <p className={`text-xs ${isActive ? "text-muted-foreground" : "text-muted-foreground"}`}>{hint}</p>
                </button>
              );
            })}
          </div>

          {/* ── 인라인 폼 패널 ── */}
          {activeCard && (
            <AddFormPanel
              type={activeCard}
              onClose={() => setActiveCard(null)}
            />
          )}

          {/* ── 인덱싱된 데이터 (디렉토리) ── */}
          {totalChunks > 0 && (
            <DataDirectory
              grouped={grouped}
              onDeleteChunk={handleDeleteChunk}
              onDeleteProject={handleDeleteProject}
              onPreview={(name, chunks) => setPreviewItem({ name, chunks })}
            />
          )}
        </>
      )}

      {/* ── 청크 미리보기 모달 ── */}
      {previewItem && (
        <ChunkPreviewModal
          name={previewItem.name}
          chunks={previewItem.chunks}
          onClose={() => setPreviewItem(null)}
        />
      )}

      {/* ── RAG 검색 ── */}
      {totalChunks > 0 && (
        <div className="border-t border-border pt-4">
          <button
            onClick={() => setShowSearch(p => !p)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
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
                    <p className="text-xs text-muted-foreground">매칭 결과 없음</p>
                  )}
                  {searchResults.map(r => (
                    <div key={r.id} className="text-xs border-l-2 border-blue-200 dark:border-blue-900 pl-3 py-1.5">
                      <div className="flex gap-2 text-muted-foreground mb-1">
                        <span>유사도 {(1 - r.distance).toFixed(3)}</span>
                        <span>·</span>
                        <span>{SOURCE_LABELS[r.source_type] ?? r.source_type}</span>
                        {r.project_name && <><span>·</span><span className="text-muted-foreground">{r.project_name}</span></>}
                      </div>
                      <p className="text-foreground leading-relaxed line-clamp-3">{r.content}</p>
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
  type, onClose,
}: {
  type: CardType;
  onClose: () => void;
}) {
  const config = CARDS[type];

  // mutation 훅 — 성공 시 각 훅이 ["projects"] 쿼리를 자동 무효화 (수동 refetch 불필요)
  const indexProjectMut = useIndexProject();
  const indexGitHubMut = useIndexGitHub();
  const indexFileMut = useIndexFile();
  const indexing = indexProjectMut.isPending || indexGitHubMut.isPending || indexFileMut.isPending;

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
    setError(null); setSuccess(null);
    try {
      if (type === "resume") {
        if (!file) throw new Error("파일을 선택하세요.");
        const r = await indexFileMut.mutateAsync({
          file,
          fields: {
            source_type: "resume",
            project_name: projectName.trim() || undefined,
            tech_stack: techStack.trim() || undefined,
          },
        });
        setSuccess(`${file.name} — ${r.chunks_created}개 청크 완료`);
      } else if (type === "github") {
        if (!repoUrl.trim()) throw new Error("GitHub repo URL을 입력하세요.");
        const r = await indexGitHubMut.mutateAsync({
          repo_url: repoUrl.trim(),
          tech_stack: techStack.split(",").map(s => s.trim()).filter(Boolean),
        });
        setSuccess(`${r.owner}/${r.repo} — ${r.files_indexed}개 파일, ${r.total_chunks}개 청크 완료`);
      } else {
        if (content.trim().length < 20) throw new Error("텍스트가 너무 짧습니다 (20자 이상).");
        const r = await indexProjectMut.mutateAsync({
          content: content.trim(),
          source_type: sourceType,
          project_name: projectName.trim() || undefined,
          tech_stack: techStack.split(",").map(s => s.trim()).filter(Boolean),
        });
        setSuccess(`${r.chunks_created}개 청크 인덱싱 완료`);
      }
      // 성공 시 mutation onSuccess가 ["projects"] 무효화 → 목록 자동 갱신
      reset();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="border border-border rounded-xl p-5 space-y-4 bg-muted">
      {/* 패널 헤더 */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">{config.title} 인덱싱</p>
          <p className="text-xs text-muted-foreground mt-0.5">{config.desc}</p>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors mt-0.5">
          <X className="size-4" />
        </button>
      </div>

      {/* 폼 필드 */}
      {type === "resume" && (
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">파일 *</Label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.md,.markdown,.txt"
              onChange={e => setFile(e.target.files?.[0] ?? null)}
              className="mt-1.5 block w-full text-sm text-muted-foreground file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-card file:text-foreground hover:file:bg-muted cursor-pointer file:shadow-sm file:border file:border-border"
            />
            {file && (
              <p className="text-xs text-muted-foreground mt-1">{file.name} ({(file.size / 1024).toFixed(1)} KB)</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">레이블 <span className="text-muted-foreground">(선택)</span></Label>
              <Input className="mt-1.5 h-8 text-sm" value={projectName} onChange={e => setProjectName(e.target.value)} placeholder="예: 사람인 이력서" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">
                기술 스택 <span className="text-muted-foreground">(자동 추출됨 · 추가만 입력)</span>
              </Label>
              <Input className="mt-1.5 h-8 text-sm" value={techStack} onChange={e => setTechStack(e.target.value)} placeholder="자동 인식 안 되는 기술만" />
              <p className="text-xs text-muted-foreground mt-1">본문에서 Python·FastAPI 등 주요 기술은 자동으로 추출됩니다.</p>
            </div>
          </div>
        </div>
      )}

      {type === "github" && (
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">GitHub Repo URL *</Label>
            <Input className="mt-1.5 h-8 text-sm" value={repoUrl} onChange={e => setRepoUrl(e.target.value)} placeholder="https://github.com/owner/repo" />
            <p className="text-xs text-muted-foreground mt-1">공개 레포만 지원 · 무인증 rate limit 60/h · 프로젝트명은 owner/repo로 자동 저장</p>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">
              기술 스택 <span className="text-muted-foreground">(자동 추출됨 · 추가만 입력)</span>
            </Label>
            <Input className="mt-1.5 h-8 text-sm" value={techStack} onChange={e => setTechStack(e.target.value)} placeholder="자동 인식 안 되는 기술만" />
            <p className="text-xs text-muted-foreground mt-1">README에서 Python·FastAPI 등 주요 기술은 자동으로 추출됩니다.</p>
          </div>
        </div>
      )}

      {type === "custom" && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">유형</Label>
              <Select value={sourceType} onValueChange={v => v && setSourceType(v)}>
                <SelectTrigger className="mt-1.5 h-8 text-sm">
                  <SelectValue>{(v) => SOURCE_LABELS[v as string] ?? (v as string)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="essay">기존 자소서</SelectItem>
                  <SelectItem value="custom">기타 경험</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">제목 <span className="text-muted-foreground">(선택)</span></Label>
              <Input className="mt-1.5 h-8 text-sm" value={projectName} onChange={e => setProjectName(e.target.value)} placeholder="예: 경력기술서" />
            </div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">텍스트 *</Label>
            <Textarea
              rows={6}
              className="mt-1.5 text-sm font-mono resize-none"
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="내용을 붙여넣거나 입력하세요..."
            />
            <p className="text-xs text-muted-foreground mt-0.5">{content.length.toLocaleString()}자</p>
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
  grouped, onDeleteChunk, onDeleteProject, onPreview,
}: {
  grouped: Record<CardType, ProjectDocResponse[]>;
  onDeleteChunk: (id: number) => void;
  onDeleteProject: (name: string) => void;
  onPreview: (name: string, chunks: ProjectDocResponse[]) => void;
}) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">인덱싱된 데이터</p>
      <p className="text-xs text-muted-foreground -mt-2 mb-3">항목을 클릭하면 청크 내용을 확인할 수 있습니다.</p>
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
            onPreview={onPreview}
          />
        );
      })}
    </div>
  );
}

function DirectorySection({
  title, icon: Icon, items, onDeleteChunk, onDeleteProject, onPreview,
}: {
  title: string;
  icon: React.ElementType;
  items: [string, ProjectDocResponse[]][];
  onDeleteChunk: (id: number) => void;
  onDeleteProject: (name: string) => void;
  onPreview: (name: string, chunks: ProjectDocResponse[]) => void;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      {/* 폴더 헤더 */}
      <button
        onClick={() => setOpen(p => !p)}
        className="w-full flex items-center gap-2 px-4 py-2.5 bg-muted hover:bg-muted transition-colors text-left"
      >
        {open
          ? <FolderOpen className="size-4 text-muted-foreground" />
          : <Icon className="size-4 text-muted-foreground" />
        }
        <span className="text-xs font-medium text-muted-foreground">{title}</span>
        {items.length > 0 && (
          <Badge variant="outline" className="text-xs ml-auto">{items.length}</Badge>
        )}
        {open
          ? <ChevronUp className="size-3.5 text-muted-foreground ml-1" />
          : <ChevronDown className="size-3.5 text-muted-foreground ml-1" />
        }
      </button>

      {/* 파일 목록 */}
      {open && (
        <div>
          {items.length === 0 ? (
            <p className="text-xs text-muted-foreground px-4 py-3">데이터 없음</p>
          ) : (
            items.map(([key, chunks]) => {
              const first = chunks[0];
              const isProject = first.project_name === key;
              const displayName = first.project_name ?? SOURCE_LABELS[first.source_type] ?? first.source_type;
              const totalChunks = chunks.length;
              const totalChars = chunks.reduce((sum, c) => sum + c.content.length, 0);

              return (
                <div
                  key={key}
                  className="flex items-center gap-3 px-4 py-2.5 border-t border-border hover:bg-muted group transition-colors cursor-pointer"
                  onClick={() => onPreview(displayName, chunks)}
                >
                  <FileText className="size-3.5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-foreground truncate block">{displayName}</span>
                    <span className="text-xs text-muted-foreground">
                      {totalChunks}청크 · {totalChars.toLocaleString()}자 · {formatDate(first.indexed_at)}
                    </span>
                  </div>
                  <button
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded text-muted-foreground hover:text-red-500 hover:bg-red-50 shrink-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isProject && first.project_name) onDeleteProject(first.project_name);
                      else onDeleteChunk(first.id);
                    }}
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

// ─── 청크 미리보기 모달 ──────────────────────────────────────────────────────

function ChunkPreviewModal({
  name, chunks, onClose,
}: {
  name: string;
  chunks: ProjectDocResponse[];
  onClose: () => void;
}) {
  // ESC 키로 닫기
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const first = chunks[0];
  const totalChars = chunks.reduce((sum, c) => sum + c.content.length, 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-card rounded-xl shadow-2xl max-w-3xl w-full max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-start justify-between p-5 border-b border-border">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-semibold text-foreground truncate">{name}</h2>
              <Badge variant="secondary" className="text-xs">
                {SOURCE_LABELS[first.source_type] ?? first.source_type}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {chunks.length}개 청크 · 총 {totalChars.toLocaleString()}자 · 등록 {formatDate(first.indexed_at)}
            </p>
            {first.tech_stack.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {first.tech_stack.map(t => (
                  <Badge key={t} variant="outline" className="text-xs">{t}</Badge>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0 ml-3"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* 안내 */}
        <div className="px-5 pt-4 pb-2">
          <p className="text-xs text-muted-foreground leading-relaxed bg-amber-50 border border-amber-100 dark:bg-amber-950/30 dark:border-amber-900 rounded-lg px-3 py-2">
            💡 각 청크는 RAG 검색의 단위입니다. 자소서 생성 시 공고와 가장 유사한 청크가 LLM에 전달됩니다.
            청크가 의미 단위로 잘 쪼개졌는지 확인하세요.
          </p>
        </div>

        {/* 청크 목록 */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3">
          {chunks
            .sort((a, b) => a.id - b.id)
            .map((chunk, idx) => (
              <div key={chunk.id} className="border border-border rounded-lg overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 bg-muted border-b border-border">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs font-mono">#{idx + 1}</Badge>
                    <span className="text-xs text-muted-foreground">청크 ID {chunk.id}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{chunk.content.length.toLocaleString()}자</span>
                </div>
                <pre className="p-3 text-xs text-foreground leading-relaxed whitespace-pre-wrap break-words font-sans">
                  {chunk.content}
                </pre>
              </div>
            ))}
        </div>

        {/* 푸터 */}
        <div className="px-5 py-3 border-t border-border flex justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>닫기</Button>
        </div>
      </div>
    </div>
  );
}
