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
