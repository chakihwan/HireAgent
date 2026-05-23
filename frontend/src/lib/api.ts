const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

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
