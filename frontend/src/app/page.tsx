"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getOllamaModels, testLLM, type OllamaModel } from "@/lib/api";

export default function Home() {
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [provider, setProvider] = useState<"ollama" | "anthropic">("ollama");
  const [apiKey, setApiKey] = useState("");
  const [anthropicModel, setAnthropicModel] = useState("claude-haiku-4-5-20251001");
  const [prompt, setPrompt] = useState("안녕하세요! 자기소개를 200자 이내로 작성해줘.");
  const [response, setResponse] = useState("");
  const [inputTokens, setInputTokens] = useState<number | null>(null);
  const [outputTokens, setOutputTokens] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [modelsError, setModelsError] = useState("");

  useEffect(() => {
    getOllamaModels()
      .then((data) => {
        setModels(data.models);
        if (data.models.length > 0) setSelectedModel(data.models[0].name);
      })
      .catch((e) => setModelsError(e.message));
  }, []);

  async function handleSubmit() {
    setLoading(true);
    setError("");
    setResponse("");
    setInputTokens(null);
    setOutputTokens(null);
    try {
      const result = await testLLM({
        provider,
        model: provider === "ollama" ? selectedModel : anthropicModel,
        // Ollama: api_key 생략 시 백엔드가 OLLAMA_BASE_URL 사용
        api_key: provider === "ollama" ? undefined : apiKey,
        prompt,
      });
      setResponse(result.response);
      setInputTokens(result.input_tokens ?? null);
      setOutputTokens(result.output_tokens ?? null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 p-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">HireAgent — LLM 테스트</h1>
          <p className="text-sm text-zinc-500 mt-1">M1 Day 5-7 개발용 테스트 페이지</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">프로바이더 선택</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-3">
              <Button
                variant={provider === "ollama" ? "default" : "outline"}
                size="sm"
                onClick={() => setProvider("ollama")}
              >
                Ollama (로컬)
              </Button>
              <Button
                variant={provider === "anthropic" ? "default" : "outline"}
                size="sm"
                onClick={() => setProvider("anthropic")}
              >
                Anthropic (Claude)
              </Button>
            </div>

            {provider === "ollama" && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-700">설치된 모델</label>
                {modelsError ? (
                  <p className="text-sm text-red-500">{modelsError}</p>
                ) : models.length === 0 ? (
                  <p className="text-sm text-zinc-400">모델 로딩 중...</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {models.map((m) => (
                      <Button
                        key={m.name}
                        variant={selectedModel === m.name ? "default" : "outline"}
                        size="sm"
                        onClick={() => setSelectedModel(m.name)}
                      >
                        {m.name}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {provider === "anthropic" && (
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-zinc-700">API 키</label>
                  <Input
                    type="password"
                    placeholder="sk-ant-..."
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-zinc-700">모델</label>
                  <div className="flex flex-wrap gap-2">
                    {[
                      "claude-haiku-4-5-20251001",
                      "claude-sonnet-4-6",
                      "claude-opus-4-7",
                    ].map((m) => (
                      <Button
                        key={m}
                        variant={anthropicModel === m ? "default" : "outline"}
                        size="sm"
                        onClick={() => setAnthropicModel(m)}
                      >
                        {m}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">프롬프트</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              rows={4}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="프롬프트를 입력하세요..."
            />
            <Button onClick={handleSubmit} disabled={loading || !prompt.trim()}>
              {loading ? "생성 중..." : "전송"}
            </Button>
          </CardContent>
        </Card>

        {error && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="pt-4">
              <p className="text-sm text-red-600 font-medium">오류</p>
              <p className="text-sm text-red-500 mt-1">{error}</p>
            </CardContent>
          </Card>
        )}

        {response && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between">
                <span>응답</span>
                {(inputTokens !== null || outputTokens !== null) && (
                  <span className="text-xs font-normal text-zinc-400">
                    in {inputTokens ?? "—"} / out {outputTokens ?? "—"} tokens
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-zinc-800 whitespace-pre-wrap leading-relaxed">{response}</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
