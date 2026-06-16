"use client";

import { useState } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { Plus, Trash2, ExternalLink, Briefcase } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import { useJobs, useCreateJob, useUpdateJob, useDeleteJob } from "@/lib/queries";

const STATUS_LABELS: Record<string, string> = {
  draft: "작성 중",
  submitted: "제출 완료",
  passed_doc: "서류 합격",
  passed_interview: "면접 합격",
  passed_final: "최종 합격",
  rejected: "탈락",
  withdrawn: "지원 취소",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "secondary",
  submitted: "outline",
  passed_doc: "default",
  passed_interview: "default",
  passed_final: "default",
  rejected: "destructive",
  withdrawn: "secondary",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

export default function JobsPage() {
  const jobsQ = useJobs();
  const jobs = jobsQ.data ?? [];
  const loading = jobsQ.isLoading;

  const createMut = useCreateJob();
  const updateMut = useUpdateJob();
  const deleteMut = useDeleteJob();

  const [showForm, setShowForm] = useState(false);
  const [company, setCompany] = useState("");
  const [position, setPosition] = useState("");
  const [jdText, setJdText] = useState("");
  const [jobUrl, setJobUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    if (!company.trim() || !jdText.trim()) return;
    setError(null);
    try {
      await createMut.mutateAsync({
        company: company.trim(),
        position: position.trim() || undefined,
        job_description: jdText.trim(),
        job_url: jobUrl.trim() || undefined,
      });
      setShowForm(false);
      setCompany(""); setPosition(""); setJdText(""); setJobUrl("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  function handleStatusChange(id: number, status: string) {
    updateMut.mutate(
      { id, data: { status } },
      { onError: (e) => toast.error(e instanceof Error ? e.message : String(e)) },
    );
  }

  function handleDelete(id: number) {
    if (!confirm("이 지원을 삭제할까요?")) return;
    deleteMut.mutate(id, {
      onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
    });
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">지원 관리</h1>
          <p className="text-sm text-muted-foreground mt-0.5">지원 현황 추적 및 합격 태깅</p>
        </div>
        <Button size="sm" onClick={() => setShowForm((p) => !p)}>
          <Plus className="size-4 mr-1" />
          지원 추가
        </Button>
      </div>

      {/* Create form */}
      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">새 지원 등록</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">회사명 *</Label>
                <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="예: 카카오" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">포지션</Label>
                <Input value={position} onChange={(e) => setPosition(e.target.value)} placeholder="예: AI 엔지니어" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">공고 URL</Label>
              <Input value={jobUrl} onChange={(e) => setJobUrl(e.target.value)} placeholder="https://..." />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">공고 내용 *</Label>
              <Textarea
                rows={6}
                value={jdText}
                onChange={(e) => setJdText(e.target.value)}
                placeholder="채용 공고 전문을 붙여넣으세요..."
              />
            </div>
            {error && <p className="text-xs text-red-500">{error}</p>}
            <div className="flex gap-2">
              <Button size="sm" onClick={handleCreate} disabled={createMut.isPending || !company.trim() || !jdText.trim()}>
                {createMut.isPending ? "저장 중..." : "저장"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowForm(false)}>취소</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      )}

      {!loading && jobs.length === 0 && !showForm && (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={<Briefcase className="size-6" />}
              title="아직 등록된 지원이 없어요"
              description="지원할 회사와 공고를 등록하면 자소서를 연결하고 합격 현황을 추적할 수 있어요."
              action={{ label: "+ 첫 지원 등록", onClick: () => setShowForm(true) }}
            />
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {jobs.map((job) => (
          <Card key={job.id}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-foreground">{job.company}</span>
                    {job.position && (
                      <span className="text-sm text-muted-foreground">{job.position}</span>
                    )}
                    {job.job_url && (
                      <a
                        href={job.job_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <ExternalLink className="size-3.5" />
                      </a>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                    <span>등록 {formatDate(job.created_at)}</span>
                    {job.applied_at && <span>제출 {formatDate(job.applied_at)}</span>}
                    {job.deadline && <span>마감 {formatDate(job.deadline)}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Select
                    value={job.status}
                    onValueChange={(v) => v && handleStatusChange(job.id, v)}
                  >
                    <SelectTrigger className="w-32 h-7 text-xs">
                      <SelectValue>{(v) => STATUS_LABELS[v as string] ?? (v as string)}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(STATUS_LABELS).map(([val, label]) => (
                        <SelectItem key={val} value={val} className="text-xs">
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Badge variant={STATUS_COLORS[job.status] as "default" | "secondary" | "outline" | "destructive"}>
                    {STATUS_LABELS[job.status] ?? job.status}
                  </Badge>
                  <Link href={`/library?application_id=${job.id}`}>
                    <Button variant="outline" size="sm" className="h-7 text-xs">자소서</Button>
                  </Link>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-muted-foreground hover:text-red-500"
                    onClick={() => handleDelete(job.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
