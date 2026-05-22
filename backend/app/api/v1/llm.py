from fastapi import APIRouter, HTTPException

from app.llm.factory import LLMFactory
from app.schemas.llm import LLMTestRequest, LLMTestResponse, ProviderListResponse

router = APIRouter(prefix="/llm", tags=["llm"])


@router.get("/providers", response_model=ProviderListResponse)
def get_providers() -> ProviderListResponse:
    return ProviderListResponse(providers=LLMFactory.supported_providers())


@router.post("/test", response_model=LLMTestResponse)
async def test_llm(req: LLMTestRequest) -> LLMTestResponse:
    """⚠️ 개발/디버깅 전용 임시 엔드포인트.

    request body로 API 키를 평문 전송받는다. 운영 환경에서는 절대 사용 금지.
    M3 설정 페이지 구현 시 제거되며, 정식 플로우는 다음과 같다:
      1) POST /api/v1/settings/llm-keys 로 키 등록 → DB에 Fernet 암호화 저장
      2) LLM 호출 시 백엔드가 DB에서 암호화된 키를 조회·복호화 후 사용
      3) 호출 직후 메모리에서 평문 키 즉시 제거

    관련: CLAUDE.md 절대 규칙 #2, app/utils/crypto.py, docs/architecture.md §4.1
    """
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
