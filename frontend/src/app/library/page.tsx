"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Trash2, Star, StarOff, Copy, Check, ChevronDown, ChevronUp, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { type LibraryItemResponse } from "@/lib/api";
import { useLibrary, useUpdateLibrary, useDeleteLibrary } from "@/lib/queries";

const CATEGORY_ALL = "__all__";

// 필터 select의 내부 value → 표시 라벨 (Base UI Select.Value는 라벨 자동 매핑 안 함)
const FINAL_FILTER_LABELS: Record<string, string> = {
  all: "전체",
  final: "최종만",
  draft: "초안만",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function charRatioColor(count: number, target: number): string {
  const ratio = count / target;
  if (ratio >= 0.95 && ratio <= 1.05) return "text-success";
  if (ratio >= 0.9 && ratio <= 1.1) return "text-warning";
  return "text-destructive";
}

function EssayCard({ item, onToggleFinal, onDelete }: {
  item: LibraryItemResponse;
  onToggleFinal: (id: number, current: boolean) => void;
  onDelete: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(item.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const score = item.generation_metadata?.evaluation_score as number | undefined;

  return (
    <Card className={item.is_final ? "border-emerald-200 dark:border-emerald-800" : ""}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <CardTitle className="text-sm font-semibold">{item.category}</CardTitle>
            {item.is_final && <Badge variant="default">최종</Badge>}
            <Badge variant="outline" className={charRatioColor(item.char_count, item.char_target)}>
              {item.char_count.toLocaleString()}/{item.char_target.toLocaleString()}자
            </Badge>
            {item.version > 1 && <Badge variant="secondary">v{item.version}</Badge>}
            {score !== undefined && (
              <span className="text-xs font-semibold text-amber-600">★ {Number(score).toFixed(1)}</span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">{formatDate(item.created_at)}</span>
            <Button variant="ghost" size="sm" onClick={handleCopy} className="h-7 px-2">
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onToggleFinal(item.id, item.is_final)}
              className="h-7 px-2"
              title={item.is_final ? "최종 해제" : "최종으로 표시"}
            >
              {item.is_final
                ? <StarOff className="size-3.5 text-amber-500" />
                : <Star className="size-3.5 text-muted-foreground" />}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDelete(item.id)}
              className="h-7 px-2 text-muted-foreground hover:text-red-500"
            >
              <Trash2 className="size-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded((p) => !p)}
              className="h-7 px-2"
            >
              {expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
            </Button>
          </div>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent>
          <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed bg-muted rounded-md p-3">
            {item.content}
          </p>
          {!!item.generation_metadata?.evaluation_feedback && (
            <p className="mt-2 text-xs text-muted-foreground border-l-2 border-border pl-2 leading-relaxed">
              {String(item.generation_metadata.evaluation_feedback)}
            </p>
          )}
        </CardContent>
      )}
    </Card>
  );
}

export default function LibraryPage() {
  const libraryQ = useLibrary();
  const items = libraryQ.data ?? [];
  const loading = libraryQ.isLoading;
  const error = libraryQ.error
    ? (libraryQ.error instanceof Error ? libraryQ.error.message : String(libraryQ.error))
    : null;

  const updateMut = useUpdateLibrary();
  const deleteMut = useDeleteLibrary();

  const [filterCategory, setFilterCategory] = useState(CATEGORY_ALL);
  const [filterFinal, setFilterFinal] = useState<"all" | "final" | "draft">("all");

  function handleToggleFinal(id: number, current: boolean) {
    updateMut.mutate(
      { id, data: { is_final: !current } },
      { onError: (e) => toast.error(e instanceof Error ? e.message : String(e)) },
    );
  }

  function handleDelete(id: number) {
    if (!confirm("이 자소서를 삭제할까요?")) return;
    deleteMut.mutate(id, {
      onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
    });
  }

  const categories = Array.from(new Set(items.map((i) => i.category))).sort();

  const filtered = items.filter((i) => {
    if (filterCategory !== CATEGORY_ALL && i.category !== filterCategory) return false;
    if (filterFinal === "final" && !i.is_final) return false;
    if (filterFinal === "draft" && i.is_final) return false;
    return true;
  });

  return (
    <div className="mx-auto max-w-3xl px-6 py-10 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">자소서 라이브러리</h1>
          <p className="text-sm text-muted-foreground mt-0.5">저장된 자소서 {items.length}개</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => libraryQ.refetch()} disabled={libraryQ.isFetching}>
          {libraryQ.isFetching ? "..." : "새로고침"}
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <Select value={filterCategory} onValueChange={(v) => v && setFilterCategory(v)}>
          <SelectTrigger className="w-36">
            <SelectValue>{(v) => (v === CATEGORY_ALL ? "전체 항목" : (v as string))}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={CATEGORY_ALL}>전체 항목</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filterFinal}
          onValueChange={(v) => v && setFilterFinal(v as "all" | "final" | "draft")}
        >
          <SelectTrigger className="w-32">
            <SelectValue>
              {(v) => FINAL_FILTER_LABELS[v as string] ?? (v as string)}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            <SelectItem value="final">최종만</SelectItem>
            <SelectItem value="draft">초안만</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      )}
      {error && <p className="text-sm text-red-500">{error}</p>}

      {!loading && filtered.length === 0 && (
        <Card>
          <CardContent className="p-0">
            {items.length === 0 ? (
              <EmptyState
                icon={<FileText className="size-6" />}
                title="아직 저장된 자소서가 없어요"
                description="자소서를 생성하고 결과 화면에서 저장하면 여기에 모여요."
                action={{ label: "+ 자소서 생성", href: "/generate" }}
              />
            ) : (
              <EmptyState
                icon={<FileText className="size-6" />}
                title="조건에 맞는 자소서가 없어요"
                description="필터를 바꿔보세요."
              />
            )}
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {filtered.map((item) => (
          <EssayCard
            key={item.id}
            item={item}
            onToggleFinal={handleToggleFinal}
            onDelete={handleDelete}
          />
        ))}
      </div>
    </div>
  );
}
