"use client";

import Link from "next/link";
import {
  FileText,
  Briefcase,
  Database,
  TrendingUp,
  Plus,
  ArrowRight,
  Sparkles,
  Loader2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useJobs, useLibrary, useProjects } from "@/lib/queries";

// jobs 페이지와 동일한 상태 라벨 (중복이지만 import 의존 줄이려 로컬 정의)
const STATUS_LABELS: Record<string, string> = {
  draft: "작성 중",
  submitted: "제출 완료",
  passed_doc: "서류 합격",
  passed_interview: "면접 합격",
  passed_final: "최종 합격",
  rejected: "탈락",
  withdrawn: "지원 취소",
};

type ActivityItem = {
  id: string;
  kind: "essay" | "job";
  label: string;
  sub: string;
  date: string;
};

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const diffMs = Date.now() - then;
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "방금 전";
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}일 전`;
  return new Date(iso).toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

function StatCard({
  icon,
  label,
  value,
  hint,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  href: string;
}) {
  return (
    <Link href={href} className="block group">
      <Card className="py-0 transition-colors group-hover:border-zinc-300 group-hover:bg-white">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-2">
            <span className="text-xs font-medium text-zinc-500">{label}</span>
            <span className="text-zinc-300">{icon}</span>
          </div>
          <div className="mt-2 text-2xl font-semibold text-zinc-900 tabular-nums">{value}</div>
          {hint && <div className="mt-0.5 text-xs text-zinc-400">{hint}</div>}
        </CardContent>
      </Card>
    </Link>
  );
}

export default function DashboardPage() {
  // React Query로 3개 서버 상태 병렬 페칭 (캐싱·중복제거 자동)
  const jobsQ = useJobs();
  const libraryQ = useLibrary();
  const projectsQ = useProjects();

  const loading = jobsQ.isLoading || libraryQ.isLoading || projectsQ.isLoading;
  const error = jobsQ.error || libraryQ.error || projectsQ.error;
  const jobs = jobsQ.data ?? [];
  const library = libraryQ.data ?? [];
  const projects = projectsQ.data ?? [];

  // ── 통계 집계 ──
  const decided = jobs.filter((j) => j.status !== "draft" && j.status !== "withdrawn");
  const passed = jobs.filter((j) => j.status.startsWith("passed"));
  const passRate =
    decided.length > 0 ? `${Math.round((passed.length / decided.length) * 100)}%` : "—";
  const finalCount = library.filter((x) => x.is_final).length;
  const indexedProjects = new Set(projects.map((p) => p.project_name).filter(Boolean)).size;

  // ── 최근 활동 (자소서 + 지원 병합, 최신순 6개) ──
  const activity: ActivityItem[] = [
    ...library.map((x) => ({
      id: `essay-${x.id}`,
      kind: "essay" as const,
      label: `자소서 "${x.category}" 생성`,
      sub: `${x.char_count.toLocaleString()}자${x.version > 1 ? ` · v${x.version}` : ""}`,
      date: x.created_at,
    })),
    ...jobs.map((j) => ({
      id: `job-${j.id}`,
      kind: "job" as const,
      label: `지원 "${j.company}" ${STATUS_LABELS[j.status] ?? j.status}`,
      sub: j.position ?? "포지션 미지정",
      date: j.updated_at ?? j.created_at,
    })),
  ]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 6);

  const isEmpty = !loading && jobs.length === 0 && library.length === 0 && projects.length === 0;

  return (
    <div className="mx-auto max-w-5xl px-6 py-10 space-y-8">
      {/* Hero */}
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 flex items-center gap-2">
          <Sparkles className="size-5 text-zinc-400" />
          HireAgent
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          한 번 정리한 커리어 데이터로, 멀티에이전트가 항목별 자소서를 다듬어줍니다.
        </p>
      </div>

      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="p-4 text-sm text-red-600">
            데이터를 불러오지 못했습니다: {error instanceof Error ? error.message : String(error)}
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-zinc-400 py-12 justify-center">
          <Loader2 className="size-4 animate-spin" />
          불러오는 중...
        </div>
      ) : (
        <>
          {/* 통계 카드 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard
              icon={<Briefcase className="size-3.5" />}
              label="지원"
              value={`${jobs.length}건`}
              hint={decided.length > 0 ? `결과 ${decided.length}건` : "진행 중"}
              href="/jobs"
            />
            <StatCard
              icon={<FileText className="size-3.5" />}
              label="자소서"
              value={`${library.length}개`}
              hint={finalCount > 0 ? `최종 ${finalCount}개` : "저장된 항목"}
              href="/library"
            />
            <StatCard
              icon={<Database className="size-3.5" />}
              label="인덱싱"
              value={`${projects.length}청크`}
              hint={indexedProjects > 0 ? `자료 ${indexedProjects}개` : "RAG 데이터"}
              href="/projects"
            />
            <StatCard
              icon={<TrendingUp className="size-3.5" />}
              label="합격률"
              value={passRate}
              hint={passed.length > 0 ? `합격 ${passed.length}건` : "결과 대기"}
              href="/jobs"
            />
          </div>

          {/* 빠른 시작 */}
          <div className="flex flex-wrap gap-2">
            <Link href="/generate">
              <Button className="gap-1.5">
                <Plus className="size-4" />새 자소서 생성
              </Button>
            </Link>
            <Link href="/jobs">
              <Button variant="outline" className="gap-1.5">
                <Plus className="size-4" />새 지원 등록
              </Button>
            </Link>
            <Link href="/projects">
              <Button variant="outline" className="gap-1.5">
                <Plus className="size-4" />커리어 데이터 추가
              </Button>
            </Link>
          </div>

          {/* 빈 상태 */}
          {isEmpty ? (
            <Card className="border-dashed">
              <CardContent className="p-8 text-center space-y-3">
                <p className="text-sm text-zinc-600">아직 데이터가 없습니다.</p>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  먼저 <Link href="/projects" className="underline">커리어 데이터</Link>(이력서·GitHub 레포)를 등록하면,
                  <br />
                  멀티에이전트가 그 경험을 근거로 자소서를 작성합니다.
                </p>
                <Link href="/projects" className="inline-block">
                  <Button variant="outline" size="sm" className="gap-1.5">
                    데이터 추가하러 가기 <ArrowRight className="size-3.5" />
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ) : (
            /* 최근 활동 */
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-zinc-700">최근 활동</h2>
              </div>
              {activity.length === 0 ? (
                <p className="text-xs text-zinc-400">최근 활동이 없습니다.</p>
              ) : (
                <Card>
                  <CardContent className="p-0 divide-y divide-zinc-100">
                    {activity.map((a) => (
                      <div key={a.id} className="flex items-center gap-3 px-4 py-3">
                        <div className="shrink-0">
                          {a.kind === "essay" ? (
                            <FileText className="size-4 text-zinc-400" />
                          ) : (
                            <Briefcase className="size-4 text-zinc-400" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-zinc-800 truncate">{a.label}</p>
                          <p className="text-xs text-zinc-400 truncate">{a.sub}</p>
                        </div>
                        <Badge variant="secondary" className="shrink-0 text-xs font-normal">
                          {timeAgo(a.date)}
                        </Badge>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* 시작 가이드 (3스텝) — 온보딩 + 화면 채움 */}
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-zinc-700">이렇게 시작하세요</h2>
            <div className="grid sm:grid-cols-3 gap-3">
              {[
                { n: 1, icon: Database, title: "커리어 데이터 등록", desc: "이력서·GitHub·경험을 인덱싱", href: "/projects" },
                { n: 2, icon: FileText, title: "공고 입력 & 항목 선택", desc: "지원 공고와 자소서 항목 고르기", href: "/generate" },
                { n: 3, icon: Sparkles, title: "자소서 생성 & 다듬기", desc: "멀티에이전트가 항목별 작성", href: "/generate" },
              ].map((s) => (
                <Link key={s.n} href={s.href}>
                  <Card className="h-full hover:border-zinc-300 transition-colors">
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="flex size-6 items-center justify-center rounded-full bg-zinc-900 text-xs font-semibold text-white">{s.n}</span>
                        <s.icon className="size-4 text-zinc-400" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-zinc-800">{s.title}</p>
                        <p className="mt-0.5 text-xs leading-relaxed text-zinc-400">{s.desc}</p>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
