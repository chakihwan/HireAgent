"use client";

/**
 * React Query 훅 — 서버 상태(jobs/library/projects/ollama) 캐싱·무효화.
 * 컴포넌트의 useState+useEffect+fetch 보일러플레이트를 대체한다.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listJobs, createJob, updateJob, deleteJob, type JobCreate, type JobUpdate,
  listLibrary, saveToLibrary, updateLibraryItem, deleteLibraryItem, type LibraryItemCreate,
  listProjects, indexProject, indexGitHub, indexFile, deleteProject, deleteProjectByName,
  type ProjectDocCreate, type GitHubIndexRequest, type FileUploadFields,
  getOllamaModels,
} from "./api";

// ── Query Keys ────────────────────────────────────────────────────
export const qk = {
  jobs: (status?: string) => ["jobs", status ?? "all"] as const,
  library: (params?: object) => ["library", params ?? {}] as const,
  projects: (params?: object) => ["projects", params ?? {}] as const,
  ollamaModels: ["ollama", "models"] as const,
};

// ── Jobs ──────────────────────────────────────────────────────────
export function useJobs(status?: string) {
  return useQuery({ queryKey: qk.jobs(status), queryFn: () => listJobs(status) });
}

export function useCreateJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: JobCreate) => createJob(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["jobs"] }),
  });
}

export function useUpdateJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: JobUpdate }) => updateJob(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["jobs"] }),
  });
}

export function useDeleteJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteJob(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["jobs"] }),
  });
}

// ── Library ───────────────────────────────────────────────────────
export function useLibrary(params?: { application_id?: number; category?: string; is_final?: boolean }) {
  return useQuery({ queryKey: qk.library(params), queryFn: () => listLibrary(params) });
}

export function useSaveLibrary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: LibraryItemCreate) => saveToLibrary(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["library"] }),
  });
}

export function useUpdateLibrary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: { content?: string; is_final?: boolean } }) =>
      updateLibraryItem(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["library"] }),
  });
}

export function useDeleteLibrary() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteLibraryItem(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["library"] }),
  });
}

// ── Projects ──────────────────────────────────────────────────────
export function useProjects(params?: { source_type?: string; project_name?: string }) {
  return useQuery({ queryKey: qk.projects(params), queryFn: () => listProjects(params) });
}

export function useIndexProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ProjectDocCreate) => indexProject(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });
}

export function useIndexGitHub() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: GitHubIndexRequest) => indexGitHub(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });
}

export function useIndexFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ file, fields }: { file: File; fields: FileUploadFields }) => indexFile(file, fields),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteProject(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });
}

export function useDeleteProjectByName() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => deleteProjectByName(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });
}

// ── Ollama models (+ GPU fit) ─────────────────────────────────────
export function useOllamaModels() {
  return useQuery({ queryKey: qk.ollamaModels, queryFn: getOllamaModels });
}
