"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2, Search, Loader2, FileText, FolderGit2, Upload, Type } from "lucide-react";
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
  { value: "resume", label: "이력서" },
  { value: "essay", label: "기존 자소서" },
  { value: "project_readme", label: "프로젝트 README" },
  { value: "project_doc", label: "프로젝트 문서" },
  { value: "custom", label: "기타 경험" },
] as const;

const SOURCE_LABELS: Record<string, string> = Object.fromEntries(
  SOURCE_TYPES.map((s) => [s.value, s.label]),
);

type InputMode = "text" | "github" | "file";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

export default function ProjectsPage() {
  const [docs, setDocs] = useState<ProjectDocResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [mode, setMode] = useState<InputMode>("text");

  // Common metadata
  const [sourceType, setSourceType] = useState<string>("project_readme");
  const [projectName, setProjectName] = useState("");
  const [category, setCategory] = useState("");
  const [techStack, setTechStack] = useState("");

  // Text mode
  const [content, setContent] = useState("");

  // GitHub mode
  const [repoUrl, setRepoUrl] = useState("");

  // File mode
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Indexing state
  const [indexing, setIndexing] = useState(false);
  const [indexError, setIndexError] = useState<string | null>(null);
  const [indexSuccess, setIndexSuccess] = useState<string | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);

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
        if (content.trim().length < 20) {
          throw new Error("텍스트가 너무 짧습니다 (20자 이상).");
        }
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
    if (!confirm(`프로젝트 "${name}"의 모든 청크를 삭제할까요?`)) return;
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
      const results = await searchProjects(searchQuery.trim(), 5);
      setSearchResults(results);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">내 커리어 데이터 (RAG)</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            이력서 · 프로젝트 README · GitHub repo · 기존 자소서를 등록하면 자소서 생성 시 자동 참고됩니다.
          </p>
          <p className="text-xs text-zinc-400 mt-1">
            총 {docs.length}개 청크, {grouped.length}개 항목
          </p>
        </div>
        <Button size="sm" onClick={() => { setShowForm((p) => !p); if (!showForm) resetForm(); }}>
          <Plus className="size-4 mr-1" />
          데이터 추가
        </Button>
      </div>

      {/* Add form with mode tabs */}
      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">새 데이터 인덱싱</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Mode tabs */}
            <div className="flex gap-1 bg-zinc-100 rounded-lg p-1">
              {([
                { key: "text", label: "텍스트", icon: Type },
                { key: "github", label: "GitHub Repo", icon: FolderGit2 },
                { key: "file", label: "파일 업로드", icon: Upload },
              ] as const).map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => { setMode(key); setIndexError(null); setIndexSuccess(null); }}
                  className={`flex-1 flex items-center justify-center gap-1.5 text-xs py-2 rounded-md font-medium transition-colors ${
                    mode === key
                      ? "bg-white text-zinc-900 shadow-sm"
                      : "text-zinc-500 hover:text-zinc-700"
                  }`}
                >
                  <Icon className="size-3.5" />
                  {label}
                </button>
              ))}
            </div>

            {/* Common metadata (some hidden in github mode) */}
            <div className="grid grid-cols-2 gap-3">
              {mode !== "github" && (
                <div className="space-y-1">
                  <Label className="text-xs">유형 *</Label>
                  <Select value={sourceType} onValueChange={(v) => v && setSourceType(v)}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SOURCE_TYPES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {mode !== "github" && (
                <div className="space-y-1">
                  <Label className="text-xs">프로젝트명</Label>
                  <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="예: HireAgent" />
                </div>
              )}
              <div className="space-y-1">
                <Label className="text-xs">카테고리</Label>
                <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="예: AI/ML, Backend" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">기술 스택 (쉼표 구분)</Label>
                <Input value={techStack} onChange={(e) => setTechStack(e.target.value)} placeholder="Python, FastAPI, LangGraph" />
              </div>
            </div>

            {/* Mode-specific input */}
            {mode === "text" && (
              <div className="space-y-1">
                <Label className="text-xs">텍스트 *</Label>
                <Textarea
                  rows={10}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="이력서/README/자소서 내용을 붙여넣으세요 (최소 20자)..."
                  className="font-mono text-sm"
                />
                <p className="text-xs text-zinc-400">{content.length.toLocaleString()}자</p>
              </div>
            )}

            {mode === "github" && (
              <div className="space-y-2">
                <div className="space-y-1">
                  <Label className="text-xs">GitHub Repo URL *</Label>
                  <Input
                    value={repoUrl}
                    onChange={(e) => setRepoUrl(e.target.value)}
                    placeholder="https://github.com/owner/repo"
                  />
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  공개 레포의 README + docs/*.md를 자동 수집해 인덱싱합니다.
                  프로젝트명은 자동으로 <code className="bg-zinc-100 px-1 rounded">owner/repo</code> 형식으로 저장됩니다.
                  무인증 GitHub API rate limit 60/h.
                </p>
              </div>
            )}

            {mode === "file" && (
              <div className="space-y-2">
                <div className="space-y-1">
                  <Label className="text-xs">파일 *</Label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.docx,.md,.markdown,.txt"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    className="block w-full text-sm text-zinc-700 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-medium file:bg-zinc-100 file:text-zinc-700 hover:file:bg-zinc-200 cursor-pointer"
                  />
                </div>
                {file && (
                  <p className="text-xs text-zinc-500">
                    선택됨: <span className="font-mono">{file.name}</span> ({(file.size / 1024).toFixed(1)} KB)
                  </p>
                )}
                <p className="text-xs text-zinc-400">
                  지원: PDF / DOCX / MD / TXT (최대 20MB). 암호화/이미지 PDF는 추출 실패할 수 있습니다.
                </p>
              </div>
            )}

            {indexError && (
              <p className="text-xs text-red-500 leading-relaxed">{indexError}</p>
            )}
            {indexSuccess && (
              <p className="text-xs text-emerald-600 leading-relaxed">✓ {indexSuccess}</p>
            )}

            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleIndex}
                disabled={indexing}
              >
                {indexing ? (
                  <>
                    <Loader2 className="size-3.5 mr-1 animate-spin" />
                    {mode === "github" ? "가져오는 중..." : "인덱싱 중..."}
                  </>
                ) : (
                  "인덱싱"
                )}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowForm(false)}>닫기</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">검색 테스트</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="예: LangGraph 멀티에이전트 경험"
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            />
            <Button size="sm" onClick={handleSearch} disabled={searching || searchQuery.trim().length < 2}>
              {searching ? <Loader2 className="size-3.5 animate-spin" /> : <Search className="size-3.5" />}
            </Button>
          </div>
          {searchResults && (
            <div className="space-y-2">
              {searchResults.length === 0 && (
                <p className="text-xs text-zinc-400">결과 없음</p>
              )}
              {searchResults.map((r) => (
                <div key={r.id} className="text-xs border-l-2 border-blue-200 pl-3 py-1">
                  <div className="flex items-center gap-2 text-zinc-400 mb-0.5">
                    <span>유사도 {(1 - r.distance).toFixed(3)}</span>
                    <span>·</span>
                    <span>{SOURCE_LABELS[r.source_type] ?? r.source_type}</span>
                    {r.project_name && <><span>·</span><span>{r.project_name}</span></>}
                  </div>
                  <p className="text-zinc-700 leading-relaxed line-clamp-3">{r.content}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Document list */}
      {loading && <p className="text-sm text-zinc-400">불러오는 중...</p>}

      {!loading && docs.length === 0 && (
        <Card>
          <CardContent className="pt-8 pb-8 text-center">
            <FileText className="size-8 text-zinc-300 mx-auto mb-2" />
            <p className="text-sm text-zinc-400">등록된 데이터가 없습니다.</p>
          </CardContent>
        </Card>
      )}

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
                      <span className="font-medium text-zinc-900">{first.project_name}</span>
                    )}
                    {first.category && (
                      <span className="text-sm text-zinc-500">· {first.category}</span>
                    )}
                    <Badge variant="outline" className="text-xs">{chunks.length}개 청크</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-400">{formatDate(first.indexed_at)}</span>
                    {isProjectGroup && first.project_name ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-zinc-400 hover:text-red-500"
                        onClick={() => handleDeleteProject(first.project_name!)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-zinc-400 hover:text-red-500"
                        onClick={() => handleDeleteChunk(first.id)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    )}
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
    </div>
  );
}
