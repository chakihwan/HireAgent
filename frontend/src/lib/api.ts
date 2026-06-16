import type { DraftResult } from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

// ── Legacy test-page types (kept for the /dev page) ──────────────────────────

export type ModelFit = "ok" | "tight" | "over" | "unknown";

export interface OllamaModel {
  name: string;
  size: number;
  parameter_size: string;
  quantization_level: string;
  fit: ModelFit;
  required_gb: number;
  fit_message: string | null;
}

export interface GpuInfo {
  name: string;
  total_gb: number;
  free_gb: number;
}

export interface OllamaModelsResponse {
  models: OllamaModel[];
  gpu: GpuInfo | null;
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

export async function deleteOllamaModel(name: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/ollama/models/${encodeURIComponent(name)}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? res.statusText);
  }
}

export interface OllamaPullProgress {
  status: string;
  total: number;
  completed: number;
  percent: number;
  detail?: string;
}

/**
 * Ollama 모델 pull (SSE 스트리밍, 진행률 콜백).
 * @returns 다운로드를 취소할 수 있는 abort 함수
 */
export function pullOllamaModel(
  model: string,
  onProgress: (p: OllamaPullProgress) => void,
  onDone: (ok: boolean, error?: string) => void,
): () => void {
  const controller = new AbortController();
  (async () => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/ollama/pull`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        onDone(false, `HTTP ${res.status}`);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6)) as OllamaPullProgress;
            onProgress(event);
            if (event.status === "success") {
              onDone(true);
              return;
            }
            if (event.status === "error") {
              onDone(false, event.detail);
              return;
            }
          } catch { /* ignore parse errors */ }
        }
      }
      onDone(true);
    } catch (e) {
      if ((e as Error).name === "AbortError") onDone(false, "취소됨");
      else onDone(false, (e as Error).message);
    }
  })();
  return () => controller.abort();
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
  flow?: string[];  // 항목 서브그래프 노드 구성 (예: RAG·압축 제외). 미지정 시 기본
  refine_enabled?: boolean;  // 평가 점수 미달 시 재작성 루프 (ADR-029 4a). 기본 off
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

export interface GitHubIndexRequest {
  repo_url: string;
  category?: string;
  tech_stack?: string[];
}

export interface GitHubIndexResponse {
  owner: string;
  repo: string;
  description: string | null;
  files_indexed: number;
  total_chunks: number;
  document_ids: number[];
}

export async function indexGitHub(data: GitHubIndexRequest): Promise<GitHubIndexResponse> {
  const res = await fetch(`${API_BASE}/api/v1/projects/index-github`, {
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

export interface FileUploadFields {
  source_type: string;
  project_name?: string;
  category?: string;
  company?: string;
  role?: string;
  tech_stack?: string;  // 쉼표 구분
}

export async function indexFile(
  file: File,
  fields: FileUploadFields,
): Promise<IndexResponse> {
  const form = new FormData();
  form.append("file", file);
  form.append("source_type", fields.source_type);
  if (fields.project_name) form.append("project_name", fields.project_name);
  if (fields.category) form.append("category", fields.category);
  if (fields.company) form.append("company", fields.company);
  if (fields.role) form.append("role", fields.role);
  if (fields.tech_stack) form.append("tech_stack", fields.tech_stack);

  const res = await fetch(`${API_BASE}/api/v1/projects/index-file`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error((err as { detail?: string }).detail ?? res.statusText);
  }
  return res.json();
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

export type FetchUrlErrorCode =
  | "spa_site"
  | "bot_blocked"
  | "login_required"
  | "timeout"
  | "bad_request";

export class FetchUrlError extends Error {
  code: FetchUrlErrorCode;
  siteName: string | null;

  constructor(message: string, code: FetchUrlErrorCode, siteName: string | null = null) {
    super(message);
    this.code = code;
    this.siteName = siteName;
  }
}

export async function fetchJobUrl(url: string): Promise<FetchUrlResponse> {
  const res = await fetch(`${API_BASE}/api/v1/jobs/fetch-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    const detail = (err as { detail?: unknown }).detail;
    if (detail && typeof detail === "object" && "code" in detail) {
      const d = detail as { code: string; message: string; site_name: string | null };
      throw new FetchUrlError(
        d.message,
        d.code as FetchUrlErrorCode,
        d.site_name,
      );
    }
    throw new FetchUrlError(
      typeof detail === "string" ? detail : res.statusText,
      "bad_request",
    );
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

// ── Settings: LLM API 키 (DB 암호화 저장) ──────────────────────────
// 키는 PUT으로 1회 전송 → 백엔드가 Fernet 암호화해 DB 저장. 조회는 마스킹된 값만.

export interface LLMKeyInfo {
  provider: string;
  masked: string;
}

export async function listLLMKeys(): Promise<LLMKeyInfo[]> {
  const res = await fetch(`${API_BASE}/api/v1/settings/llm-keys`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error((err as { detail?: string }).detail ?? res.statusText);
  }
  const data = (await res.json()) as { keys: LLMKeyInfo[] };
  return data.keys;
}

export async function saveLLMKey(provider: string, apiKey: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/settings/llm-keys`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, api_key: apiKey }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error((err as { detail?: string }).detail ?? res.statusText);
  }
}

export async function deleteLLMKey(provider: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/v1/settings/llm-keys/${encodeURIComponent(provider)}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error((err as { detail?: string }).detail ?? res.statusText);
  }
}

// provider별 동적 모델 목록 (키 있는 provider만). 실패 시 빈 → 프론트 하드코딩 fallback.
export async function getCloudModels(): Promise<Record<string, string[]>> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/settings/cloud-models`);
    if (!res.ok) return {};
    const data = (await res.json()) as { models: Record<string, string[]> };
    return data.models ?? {};
  } catch {
    return {};
  }
}
