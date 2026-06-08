"""LLM 호출 공통 재시도 정책.

429(rate limit)·503(과부하)·일시적 네트워크 오류에 exponential backoff로 재시도한다.
provider별 SDK 예외 타입이 제각각이라, 상태코드/메시지 마커로 재시도 여부를 판단한다.

⚠️ 한계: 무료 티어 '분당 한도' 같은 장기 429(retryDelay 수십 초)는 짧은 backoff로
풀리지 않는다. 이 정책은 일시적 스파이크·503·짧은 429를 흡수하는 용도다.
완전 소진은 결국 reraise되어 호출부(essays._format_llm_error)가 사용자에게 안내한다.
"""

import logging

from tenacity import (
    retry,
    retry_if_exception,
    stop_after_attempt,
    wait_exponential,
)

logger = logging.getLogger(__name__)

# 재시도 대상 마커 (대문자 비교). status_code 우선, 없으면 메시지 문자열로 판단.
_RETRYABLE_MARKERS = (
    "429",
    "503",
    "RESOURCE_EXHAUSTED",
    "UNAVAILABLE",
    "OVERLOADED",
    "RATE LIMIT",
    "TEMPORARILY",
    "TIMEOUT",
)


def _is_retryable_llm_error(exc: BaseException) -> bool:
    # SDK 예외에 상태코드가 있으면 그것으로 정확 판단 (google ClientError.code,
    # anthropic/openai APIStatusError.status_code, httpx HTTPStatusError.response.status_code)
    code = getattr(exc, "code", None) or getattr(exc, "status_code", None)
    if code is None:
        resp = getattr(exc, "response", None)
        code = getattr(resp, "status_code", None)
    if code in (429, 500, 503):
        return True
    return any(m in str(exc).upper() for m in _RETRYABLE_MARKERS)


# generate 호출용 데코레이터. 3회 시도(원호출 1 + 재시도 2), 1→2→4s 대기, 최대 8s.
llm_retry = retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=8),
    retry=retry_if_exception(_is_retryable_llm_error),
    reraise=True,
    before_sleep=lambda rs: logger.warning(
        "LLM 호출 재시도 %d/2 — %s",
        rs.attempt_number,
        str(rs.outcome.exception())[:120] if rs.outcome else "",
    ),
)
