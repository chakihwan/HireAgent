"""한국어 글자수 검증 유틸리티.

핵심 원칙(ADR-001): LLM은 토큰 단위라 한국어 글자수를 못 셈 → Python `len()`만 사용.
"""

from typing import Literal

ValidationResult = Literal["ok", "expand", "compress"]


def count_chars(text: str, include_space: bool = True) -> int:
    """문자열의 글자수를 계산한다.

    Args:
        text: 측정할 문자열
        include_space: 공백/줄바꿈 포함 여부 (채용 사이트마다 다름)

    Returns:
        글자수 (Python `len()` 기준)
    """
    if not include_space:
        text = text.replace(" ", "").replace("\n", "").replace("\r", "").replace("\t", "")
    return len(text)


def validate_chars(
    text: str,
    target: int,
    tolerance: float = 0.05,
    include_space: bool = True,
) -> ValidationResult:
    """글자수가 목표 범위 내인지 검증한다.

    Args:
        text: 검증할 문자열
        target: 목표 글자수 (예: 500)
        tolerance: 허용 오차 비율 (기본 0.05 = ±5%)
        include_space: 공백 포함 여부

    Returns:
        "ok"       — 목표 ±tolerance 범위 내
        "expand"   — 목표보다 부족 → 확장 에이전트 호출 필요
        "compress" — 목표보다 초과 → 압축 에이전트 호출 필요
    """
    actual = count_chars(text, include_space=include_space)
    min_chars = int(target * (1 - tolerance))
    max_chars = int(target * (1 + tolerance))

    if actual < min_chars:
        return "expand"
    if actual > max_chars:
        return "compress"
    return "ok"


def diff_chars(text: str, target: int, include_space: bool = True) -> int:
    """목표 대비 차이를 반환한다. 음수면 부족, 양수면 초과.

    압축/확장 에이전트 프롬프트에 "약 N자 줄여야 함" 같은 명시적 지시에 사용.
    """
    actual = count_chars(text, include_space=include_space)
    return actual - target
