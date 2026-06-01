"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import Link from "next/link";
import { Plus, Trash2, ExternalLink } from "lucide-react";
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
import { createJob, listJobs, updateJob, deleteJob, type JobResponse } from "@/lib/api";

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
  const [jobs, setJobs] = useState<JobResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [company, setCompany] = useState("");
  const [position, setPosition] = useState("");
  const [jdText, setJdText] = useState("");
  const [jobUrl, setJobUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchJobs() {
    setLoading(true);
    try {
      setJobs(await listJobs());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchJobs(); }, []);

  async function handleCreate() {
    if (!company.trim() || !jdText.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const created = await createJob({
        company: company.trim(),
        position: position.trim() || undefined,
        job_description: jdText.trim(),
        job_url: jobUrl.trim() || undefined,
      });
      setJobs((prev) => [created, ...prev]);
      setShowForm(false);
      setCompany(""); setPosition(""); setJdText(""); setJobUrl("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange(id: number, status: string) {
    try {
      const updated = await updateJob(id, { status });
      setJobs((prev) => prev.map((j) => (j.id === id ? updated : j)));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("이 지원을 삭제할까요?")) return;
    try {
      await deleteJob(id);
      setJobs((prev) => prev.filter((j) => j.id !== id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">지원 관리</h1>
          <p className="text-sm text-zinc-500 mt-0.5">지원 현황 추적 및 합격 태깅</p>
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
              <Button size="sm" onClick={handleCreate} disabled={saving || !company.trim() || !jdText.trim()}>
                {saving ? "저장 중..." : "저장"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowForm(false)}>취소</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {loading && <p className="text-sm text-zinc-400">불러오는 중...</p>}

      {!loading && jobs.length === 0 && (
        <Card>
          <CardContent className="pt-8 pb-8 text-center">
            <p className="text-sm text-zinc-400">등록된 지원이 없습니다.</p>
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
                    <span className="font-semibold text-zinc-900">{job.company}</span>
                    {job.position && (
                      <span className="text-sm text-zinc-500">{job.position}</span>
                    )}
                    {job.job_url && (
                      <a
                        href={job.job_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-zinc-400 hover:text-zinc-600"
                      >
                        <ExternalLink className="size-3.5" />
                      </a>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap text-xs text-zinc-400">
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
                      <SelectValue />
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
                    className="h-7 px-2 text-zinc-400 hover:text-red-500"
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
