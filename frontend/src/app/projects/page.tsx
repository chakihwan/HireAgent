"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Search, Loader2, FileText } from "lucide-react";
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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

export default function ProjectsPage() {
  const [docs, setDocs] = useState<ProjectDocResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [content, setContent] = useState("");
  const [sourceType, setSourceType] = useState<string>("project_readme");
  const [projectName, setProjectName] = useState("");
  const [category, setCategory] = useState("");
  const [techStack, setTechStack] = useState("");
  const [indexing, setIndexing] = useState(false);
  const [indexError, setIndexError] = useState<string | null>(null);

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

  // 프로젝트별 그룹핑 (같은 project_name의 청크들 묶기)
  const grouped = useMemo(() => {
    const map = new Map<string, ProjectDocResponse[]>();
    for (const d of docs) {
      const key = d.project_name ?? `__${d.source_type}_${d.id}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(d);
    }
    return Array.from(map.entries());
  }, [docs]);

  async function handleIndex() {
    if (content.trim().length < 20) return;
    setIndexing(true);
    setIndexError(null);
    try {
      await indexProject({
        content: content.trim(),
        source_type: sourceType,
        project_name: projectName.trim() || undefined,
        category: category.trim() || undefined,
        tech_stack: techStack.split(",").map((s) => s.trim()).filter(Boolean),
      });
      await fetchDocs();
      setShowForm(false);
      setContent(""); setProjectName(""); setCategory(""); setTechStack("");
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
            이력서 · 프로젝트 README · 기존 자소서를 등록하면 자소서 생성 시 자동 참고됩니다.
          </p>
          <p className="text-xs text-zinc-400 mt-1">
            총 {docs.length}개 청크, {grouped.length}개 항목
          </p>
        </div>
        <Button size="sm" onClick={() => setShowForm((p) => !p)}>
          <Plus className="size-4 mr-1" />
          데이터 추가
        </Button>
      </div>

      {/* Add form */}
      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">새 데이터 인덱싱</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
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
              <div className="space-y-1">
                <Label className="text-xs">프로젝트명</Label>
                <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="예: HireAgent" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">카테고리</Label>
                <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="예: AI/ML, Backend" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">기술 스택 (쉼표 구분)</Label>
                <Input value={techStack} onChange={(e) => setTechStack(e.target.value)} placeholder="Python, FastAPI, LangGraph" />
              </div>
            </div>
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
            {indexError && <p className="text-xs text-red-500">{indexError}</p>}
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleIndex}
                disabled={indexing || content.trim().length < 20}
              >
                {indexing ? (
                  <>
                    <Loader2 className="size-3.5 mr-1 animate-spin" />
                    인덱싱 중... (첫 회 1-2분)
                  </>
                ) : (
                  "인덱싱"
                )}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowForm(false)}>취소</Button>
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

      {/* Document list (grouped) */}
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
