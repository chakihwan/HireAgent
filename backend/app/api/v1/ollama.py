import json
from collections.abc import AsyncIterator

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from app.config import settings
from app.schemas.ollama import (
    GpuInfoSchema,
    OllamaModel,
    OllamaModelsResponse,
    OlamaPullRequest,
)
from app.utils.gpu import assess_model_fit, get_gpu_info

router = APIRouter(prefix="/ollama", tags=["ollama"])

REQUEST_TIMEOUT = 10.0


def _ollama_url(path: str) -> str:
    return f"{settings.ollama_base_url}{path}"


@router.get("/models", response_model=OllamaModelsResponse)
async def list_models() -> OllamaModelsResponse:
    """설치된 Ollama 모델 목록 + GPU 적합성 판정 반환."""
    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
        try:
            resp = await client.get(_ollama_url("/api/tags"))
            resp.raise_for_status()
        except httpx.ConnectError:
            raise HTTPException(status_code=503, detail="Ollama 서비스에 연결할 수 없습니다")

    gpu = get_gpu_info()  # 런타임 VRAM 조회 (없으면 None → fit=unknown)

    models = []
    for m in resp.json().get("models", []):
        fit = assess_model_fit(m["size"], gpu)
        models.append(
            OllamaModel(
                name=m["name"],
                size=m["size"],
                parameter_size=m["details"].get("parameter_size", ""),
                quantization_level=m["details"].get("quantization_level", ""),
                fit=fit["fit"],
                required_gb=fit["required_gb"],
                fit_message=fit["message"],
            )
        )

    gpu_schema = (
        GpuInfoSchema(name=gpu.name, total_gb=gpu.total_gb, free_gb=gpu.free_gb)
        if gpu
        else None
    )
    return OllamaModelsResponse(models=models, gpu=gpu_schema)


@router.get("/gpu", response_model=GpuInfoSchema | None)
async def gpu_info() -> GpuInfoSchema | None:
    """현재 GPU VRAM 정보 (NVIDIA 전용, 없으면 null)."""
    gpu = get_gpu_info()
    if not gpu:
        return None
    return GpuInfoSchema(name=gpu.name, total_gb=gpu.total_gb, free_gb=gpu.free_gb)


@router.post("/pull")
async def pull_model(req: OlamaPullRequest) -> StreamingResponse:
    """Ollama 모델 pull — SSE로 진행률 스트리밍.

    클라이언트는 text/event-stream을 수신하며, 각 라인은 JSON 형식.
    완료 시 {"status": "success"} 전송.
    """
    return StreamingResponse(
        _stream_pull(req.model),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


async def _stream_pull(model: str) -> AsyncIterator[str]:
    payload = {"model": model, "stream": True}
    async with httpx.AsyncClient(timeout=None) as client:
        try:
            async with client.stream("POST", _ollama_url("/api/pull"), json=payload) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if not line:
                        continue
                    chunk = json.loads(line)
                    total = chunk.get("total", 0)
                    completed = chunk.get("completed", 0)
                    percent = round(completed / total * 100, 1) if total > 0 else 0.0
                    event = {
                        "status": chunk.get("status", ""),
                        "total": total,
                        "completed": completed,
                        "percent": percent,
                    }
                    yield f"data: {json.dumps(event, ensure_ascii=False)}\n\n"
        except httpx.ConnectError:
            yield f"data: {json.dumps({'status': 'error', 'detail': 'Ollama 연결 실패'})}\n\n"
        except httpx.HTTPStatusError as e:
            yield f"data: {json.dumps({'status': 'error', 'detail': str(e)})}\n\n"


@router.delete("/models/{model_name:path}")
async def delete_model(model_name: str) -> dict:
    """설치된 Ollama 모델 삭제."""
    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT) as client:
        try:
            resp = await client.request(
                "DELETE", _ollama_url("/api/delete"), json={"model": model_name}
            )
            resp.raise_for_status()
        except httpx.ConnectError:
            raise HTTPException(status_code=503, detail="Ollama 서비스에 연결할 수 없습니다")
        except httpx.HTTPStatusError as e:
            raise HTTPException(status_code=e.response.status_code, detail=str(e))
    return {"message": f"{model_name} 삭제 완료"}
