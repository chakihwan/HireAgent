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
# DeepSeek-R1 등 reasoning 모델의 사고 과정 태그
_THINK_BLOCK_RE = re.compile(r"<think>.*?</think>", re.DOTALL | re.IGNORECASE)
_THINK_OPEN_RE = re.compile(r"</?think>", re.IGNORECASE)
# Prompt 라벨이 본문에 echo된 경우 ([현재 자소서], [공고 분석], [작성 조건] 등)
_PROMPT_LABEL_RE = re.compile(
    r"^\s*\[(?:현재\s*자소서|공고\s*분석|작성\s*조건|입력|출력|원본)\][^\n]*$",
    re.MULTILINE,
)
# 영문 마크다운 헤더형 라벨 ("Key Contributions:", "Server Architecture Design:" 등)
# 한 줄에 영어 단어 + 콜론으로 끝나는 짧은 라인 (불완전한 휴리스틱)
_ENGLISH_HEADER_RE = re.compile(
    r"^\s*[A-Z][A-Za-z][A-Za-z &/\-]{3,60}:\s*$",
    re.MULTILINE,
)
# 한국어 섹션 헤더 ("기술 역량", "실행력과 협업", "연락처", "입사 후 계획" 등)
# 줄 전체가 짧은 명사구이고 뒤에 본문 없는 경우 제거
_KOREAN_HEADER_RE = re.compile(
    r"^\s*(?:기술\s*역량|실행력과\s*협업|실행력\s*및\s*협업|연락처|입사\s*후\s*계획|지원\s*동기|자기\s*소개|경력\s*사항|학력\s*사항|주요\s*성과|핵심\s*역량|지원\s*이유)\s*$",
    re.MULTILINE,
)
# 개인 연락처 정보 (이메일, 전화번호, 주소) — 이력서 RAG 청크에서 유입 방지
_EMAIL_RE = re.compile(r"\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b")
_PHONE_RE = re.compile(r"\d{2,3}[-\s]?\d{3,4}[-\s]?\d{4}")
# 이메일/전화 라벨만 남은 줄 ("이메일:   ", "휴대폰: " 등) 제거
_CONTACT_LABEL_LINE_RE = re.compile(
    r"^\s*(?:이메일|휴대폰|전화|Tel|Phone|E[-\s]?mail)\s*[:：]?\s*$",
    re.MULTILINE | re.IGNORECASE,
)
# 자소서 맺음말 서명 제거 ("감사합니다. 차기환 드림", "이상입니다.", "지원합니다." 마지막 줄)
_CLOSING_SIGNATURE_RE = re.compile(
    r"\n\s*(?:감사합니다\s*[.\s]*)?[가-힣]{2,4}\s*(?:드림|올림|배상|씀)\s*$",
    re.MULTILINE,
)
_ADDRESS_LINE_RE = re.compile(
    r"^[^\n]*(?:주소|거주지)[^\n]*$"
    r"|^[^\n]*\(?\d{5}\)?\s*[가-힣].*(?:시|도|군|구|읍|면|동|로|길)[^\n]*$",
    re.MULTILINE,
)


def clean_llm_output(text: str) -> str:
    """LLM이 잘못 출력한 마크다운, 글자수 메타, 출처 레이블, prompt echo, 반복 패턴, 개인정보를 제거한다."""
    text = _THINK_BLOCK_RE.sub("", text)
    text = _THINK_OPEN_RE.sub("", text)
    text = _HEADER_RE.sub("", text)
    text = _BOLD_META_RE.sub("", text)
    text = _CODE_FENCE_RE.sub("", text)
    text = _CODE_FENCE_OPEN_RE.sub("", text)
    text = _RAG_LABEL_RE.sub("", text)
    text = _PROMPT_LABEL_RE.sub("", text)
    text = _ENGLISH_HEADER_RE.sub("", text)
    text = _KOREAN_HEADER_RE.sub("", text)
    text = _BOLD_RE.sub(r"\1", text)
    text = _ITALIC_RE.sub(r"\1", text)
    text = _BULLET_RE.sub("", text)
    text = _CHAR_META_LINE_RE.sub("", text)
    text = _REPETITION_RE.sub(r"\1", text)  # "8-8-8-..." → "8-"
    # 개인 연락처 제거 — 이력서 RAG 청크에서 자소서 본문으로 유입되는 케이스
    text = _EMAIL_RE.sub("", text)
    text = _PHONE_RE.sub("", text)
    text = _CONTACT_LABEL_LINE_RE.sub("", text)
    text = _ADDRESS_LINE_RE.sub("", text)
    text = _CLOSING_SIGNATURE_RE.sub("", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def english_ratio(text: str) -> float:
    """텍스트에서 영문자가 차지하는 비율 (한국어 자소서 검증용).

    > 0.3 면 영어 위주 출력으로 간주.
    """
    if not text:
        return 0.0
    eng = sum(1 for c in text if c.isascii() and c.isalpha())
    total = sum(1 for c in text if not c.isspace())
    return eng / total if total > 0 else 0.0


# 같은 2~10글자 패턴이 6번 이상 반복되는 모델 폭주 (예: "8-8-8-8-...")
_REPETITION_RE = re.compile(r"(.{2,10}?)\1{5,}", re.DOTALL)


def detect_output_issue(text: str) -> str | None:
    """LLM 출력 품질 검사. 문제 발견 시 사유 문자열, 정상이면 None.

    한국어 자소서 기준으로 판정:
    - empty / too_short
    - repetition: 같은 패턴 반복 (모델 폭주)
    - non_korean: 한글 비율이 너무 낮음
    - foreign_script: 한자·키릴·베트남어 비율이 높음
    """
    if not text:
        return "empty"
    if len(text) < 20:
        return "too_short"

    if _REPETITION_RE.search(text):
        return "repetition"

    # 한글 비율 (긴 텍스트일 때만 검사)
    total = sum(1 for c in text if not c.isspace() and not c.isdigit() and c.isprintable())
    if total < 50:
        return None
    korean = sum(1 for c in text if "가" <= c <= "힣")
    korean_ratio = korean / total
    if korean_ratio < 0.3:
        return f"non_korean ({korean_ratio:.0%} 한글)"

    # 한자·키릴·베트남어 확장 비율
    foreign = sum(
        1 for c in text
        if ("一" <= c <= "鿿")     # 한자
        or ("Ѐ" <= c <= "ӿ")     # 키릴
        or ("Ḁ" <= c <= "ỿ")     # 베트남어 확장
    )
    foreign_ratio = foreign / total
    if foreign_ratio > 0.05:
        return f"foreign_script ({foreign_ratio:.0%} 한자·키릴 등)"

    return None


def strip_repetition(text: str) -> str:
    """반복 패턴을 한 번으로 압축 ("8-8-8-8-8-8" → "8-")."""
    return _REPETITION_RE.sub(r"\1", text)
