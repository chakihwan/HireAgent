import type { DraftResult } from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

// ── Legacy test-page types (kept for the /dev page) ──────────────────────────

export interface OllamaModel {
  name: string;
  size: number;
  modified_at: string;
}

export interface OllamaModelsResponse {
  models: OllamaModel[];
}

export interface LLMTestRequest {
  provider: string;
  model: string;
  api_key?: string | null;
  prompt: string;
  system?: string;
  max_tokens?: number;
  temperature?: number;
}

export interface LLMTestResponse {
  response: string;
  provider: string;
  model: string;
  input_tokens?: number;
  output_tokens?: number;
}

export async function getOllamaModels(): Promise<OllamaModelsResponse> {
  const res = await fetch(`${API_BASE}/api/v1/ollama/models`);
  if (!res.ok) throw new Error(`Failed to fetch models: ${res.statusText}`);
  return res.json();
}

export async function testLLM(req: LLMTestRequest): Promise<LLMTestResponse> {
  const res = await fetch(`${API_BASE}/api/v1/llm/test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? res.statusText);
  }
  return res.json();
}

// ── Essay generation ──────────────────────────────────────────────────────────

export interface EssayItemRequest {
  category: string;
  char_limit: number;
  tone: string;
  persona: string;
}

export interface AgentAssignment {
  provider: string;
  model: string;
  api_key?: string;
}

export interface EssayGenerateRequest {
  job_description: string;
  items: EssayItemRequest[];
  user_id: string;
  agent_config: Record<string, AgentAssignment>;
}

export interface EssayGenerateResponse {
  drafts: DraftResult[];
  progress: string[];
}

// ── Jobs (JobApplication) ─────────────────────────────────────────────────────

export interface JobCreate {
  company: string;
  position?: string;
  job_description: string;
  job_url?: string;
  deadline?: string;
}

export interface JobUpdate {
  company?: string;
  position?: string;
  status?: string;
  applied_at?: string;
  result_notes?: string;
}

export interface JobResponse {
  id: number;
  user_id: string;
  company: string;
  position: string | null;
  job_description: string;
  job_url: string | null;
  applied_at: string | null;
  deadline: string | null;
  status: string;
  result_notes: string | null;
  created_at: string;
  updated_at: string;
}

export async function createJob(data: JobCreate): Promise<JobResponse> {
  const res = await fetch(`${API_BASE}/api/v1/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error((err as { detail?: string }).detail ?? res.statusText);
  }
  return res.json();
}

export async function listJobs(status?: string): Promise<JobResponse[]> {
  const url = new URL(`${API_BASE}/api/v1/jobs`);
  if (status) url.searchParams.set("status", status);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(res.statusText);
  return res.json();
}

export async function updateJob(id: number, data: JobUpdate): Promise<JobResponse> {
  const res = await fetch(`${API_BASE}/api/v1/jobs/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error((err as { detail?: string }).detail ?? res.statusText);
  }
  return res.json();
}

export async function deleteJob(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/jobs/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(res.statusText);
}

export interface FetchUrlResponse {
  text: string;
  title: string | null;
}

// ── Projects (RAG documents) ──────────────────────────────────────────────────

export interface ProjectDocCreate {
  content: string;
  source_type: string;
  project_name?: string;
  category?: string;
  company?: string;
  role?: string;
  tech_stack?: string[];
}

export interface ProjectDocResponse {
  id: number;
  user_id: string;
  content: string;
  source_type: string;
  project_name: string | null;
  category: string | null;
  company: string | null;
  role: string | null;
  tech_stack: string[];
  indexed_at: string;
}

export interface IndexResponse {
  chunks_created: number;
  document_ids: number[];
}

export async function indexProject(data: ProjectDocCreate): Promise<IndexResponse> {
  const res = await fetch(`${API_BASE}/api/v1/projects/index`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error((err as { detail?: string }).detail ?? res.statusText);
  }
  return res.json();
}

export async function listProjects(params?: {
  source_type?: string;
  project_name?: string;
}): Promise<ProjectDocResponse[]> {
  const url = new URL(`${API_BASE}/api/v1/projects`);
  if (params?.source_type) url.searchParams.set("source_type", params.source_type);
  if (params?.project_name) url.searchParams.set("project_name", params.project_name);
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(res.statusText);
  return res.json();
}

export async function deleteProject(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/projects/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(res.statusText);
}

export async function deleteProjectByName(name: string): Promise<{ deleted: number }> {
  const res = await fetch(`${API_BASE}/api/v1/projects/by-project/${encodeURIComponent(name)}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error((err as { detail?: string }).detail ?? res.statusText);
  }
  return res.json();
}

export interface SearchResult {
  id: number;
  content: string;
  source_type: string;
  project_name: string | null;
  category: string | null;
  distance: number;
}

export async function searchProjects(query: string, limit = 5): Promise<SearchResult[]> {
  const res = await fetch(`${API_BASE}/api/v1/projects/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, limit }),
  });
  if (!res.ok) throw new Error(res.statusText);
  return res.json();
}

// ── URL fetch ─────────────────────────────────────────────────────────────────

export async function fetchJobUrl(url: string): Promise<FetchUrlResponse> {
  const res = await fetch(`${API_BASE}/api/v1/jobs/fetch-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error((err as { detail?: string }).detail ?? res.statusText);
  }
  return res.json();
}

// ── Library (EssayLibraryItem) ────────────────────────────────────────────────

export interface LibraryItemCreate {
  application_id?: number;
  category: string;
  content: string;
  char_target: number;
  tone?: string;
  persona?: string;
  is_final?: boolean;
  generation_metadata?: Record<string, unknown>;
}

export interface LibraryItemResponse {
  id: number;
  user_id: string;
  application_id: number | null;
  category: string;
  content: string;
  char_count: number;
  char_target: number;
  tone: string | null;
  persona: string | null;
  version: number;
  is_final: boolean;
  generation_metadata: Record<string, unknown> | null;
  created_at: string;
}

export async function saveToLibrary(data: LibraryItemCreate): Promise<LibraryItemResponse> {
  const res = await fetch(`${API_BASE}/api/v1/library`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error((err as { detail?: string }).detail ?? res.statusText);
  }
  return res.json();
}

export async function listLibrary(params?: {
  application_id?: number;
  category?: string;
  is_final?: boolean;
}): Promise<LibraryItemResponse[]> {
  const url = new URL(`${API_BASE}/api/v1/library`);
  if (params?.application_id != null) url.searchParams.set("application_id", String(params.application_id));
  if (params?.category) url.searchParams.set("category", params.category);
  if (params?.is_final != null) url.searchParams.set("is_final", String(params.is_final));
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(res.statusText);
  return res.json();
}

export async function updateLibraryItem(
  id: number,
  data: { content?: string; is_final?: boolean },
): Promise<LibraryItemResponse> {
  const res = await fetch(`${API_BASE}/api/v1/library/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(res.statusText);
  return res.json();
}

export async function deleteLibraryItem(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/library/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(res.statusText);
}

// ── Essay generation ──────────────────────────────────────────────────────────

/**
 * Stream essay generation via SSE.
 * `onEvent` receives each parsed event; the promise resolves when the stream closes.
 */
export async function generateEssays(
  req: EssayGenerateRequest,
  onEvent: (event: string, data: unknown) => void,
): Promise<void> {
  const response = await fetch(`${API_BASE}/api/v1/essays/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });

  if (!response.ok || !response.body) {
    const err = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error((err as { detail?: string }).detail ?? response.statusText);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE format: "event: <type>\ndata: <json>\n\n"
      const chunks = buffer.split("\n\n");
      buffer = chunks.pop() ?? "";

      for (const chunk of chunks) {
        if (!chunk.trim()) continue;
        let eventType = "message";
        let dataStr = "";

        for (const line of chunk.split("\n")) {
          if (line.startsWith("event: ")) eventType = line.slice(7).trim();
          else if (line.startsWith("data: ")) dataStr = line.slice(6);
        }

        if (dataStr) {
          try {
            onEvent(eventType, JSON.parse(dataStr));
          } catch {
            // skip malformed SSE data lines
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
