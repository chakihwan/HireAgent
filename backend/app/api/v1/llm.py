from fastapi import APIRouter, HTTPException

from app.llm.factory import LLMFactory
from app.schemas.llm import LLMTestRequest, LLMTestResponse, ProviderListResponse

router = APIRouter(prefix="/llm", tags=["llm"])


@router.get("/providers", response_model=ProviderListResponse)
def get_providers() -> ProviderListResponse:
    return ProviderListResponse(providers=LLMFactory.supported_providers())


@router.post("/test", response_model=LLMTestResponse)
async def test_llm(req: LLMTestRequest) -> LLMTestResponse:
    try:
        llm = LLMFactory.create(req.provider, req.model, req.api_key)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    try:
        result = await llm.generate(
            prompt=req.prompt,
            system=req.system,
            max_tokens=req.max_tokens,
            temperature=req.temperature,
        )
    except NotImplementedError as e:
        raise HTTPException(status_code=501, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"LLM call failed: {e}")

    return LLMTestResponse(
        response=result.content,
        provider=result.provider,
        model=result.model,
        input_tokens=result.input_tokens,
        output_tokens=result.output_tokens,
    )
