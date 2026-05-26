"""LLM 출력 후처리 유틸리티.

자소서 에이전트들이 공통으로 사용하는 마크다운 제거 / 출처 레이블 제거 함수.
"""

import re

_HEADER_RE = re.compile(r"^\s*#{1,6}\s+.*$", re.MULTILINE)
_BOLD_META_RE = re.compile(r"\*\*\s*\d+\s*자[^*]*\*\*", re.MULTILINE)
_CODE_FENCE_RE = re.compile(r"^```.*?^```", re.MULTILINE | re.DOTALL)
_CODE_FENCE_OPEN_RE = re.compile(r"^```.*$", re.MULTILINE)
# [참고 경험 N], **[참고 경험 N]**, [경험 자료] 등 출처 레이블
_RAG_LABEL_RE = re.compile(
    r"\*{0,2}\[?\s*(?:참고\s*경험|경험\s*자료)\s*\d*\]?\*{0,2}",
    re.MULTILINE,
)
# 볼드 (**텍스트**) → 텍스트만 남김
_BOLD_RE = re.compile(r"\*\*(.+?)\*\*")
# 이탤릭 (*텍스트*) → 텍스트만 남김
_ITALIC_RE = re.compile(r"\*(.+?)\*")
# 불릿 리스트 (- 또는 * 시작) → 불릿 마커만 제거
_BULLET_RE = re.compile(r"^[\-\*]\s+", re.MULTILINE)
# compressor/LLM이 붙이는 글자수 메타 텍스트 (줄 단위로 제거)
_CHAR_META_LINE_RE = re.compile(
    r"^\s*(?:수정\s*후\s*글자|총\s*글자|글자\s*수)\s*[:：]?.+$",
    re.MULTILINE,
)


def clean_llm_output(text: str) -> str:
    """LLM이 잘못 출력한 마크다운, 글자수 메타, 출처 레이블을 제거한다."""
    text = _HEADER_RE.sub("", text)
    text = _BOLD_META_RE.sub("", text)
    text = _CODE_FENCE_RE.sub("", text)
    text = _CODE_FENCE_OPEN_RE.sub("", text)
    text = _RAG_LABEL_RE.sub("", text)
    text = _BOLD_RE.sub(r"\1", text)
    text = _ITALIC_RE.sub(r"\1", text)
    text = _BULLET_RE.sub("", text)
    text = _CHAR_META_LINE_RE.sub("", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()
