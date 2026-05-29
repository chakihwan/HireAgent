"""LLM 출력 후처리 단위 테스트.

v0.7.2~v0.7.6 실사용 피드백에서 발견된 오염 케이스를 회귀로 고정한다.
"""

from app.utils.text_cleaner import (
    clean_llm_output,
    detect_output_issue,
    english_ratio,
    strip_repetition,
)


# ── 마크다운 / 출처 레이블 (v0.7.2) ──────────────────────────────


def test_removes_bold_keeps_text():
    assert clean_llm_output("저는 **백엔드 개발**을 했습니다") == "저는 백엔드 개발을 했습니다"


def test_removes_markdown_headers():
    out = clean_llm_output("## 지원동기\n저는 지원합니다")
    assert "##" not in out
    assert "저는 지원합니다" in out


def test_removes_rag_labels():
    assert "참고 경험" not in clean_llm_output("[참고 경험 1] 저는 개발했습니다")
    assert "경험 자료" not in clean_llm_output("[경험 자료] 프로젝트를 수행했습니다")


def test_removes_bullets():
    out = clean_llm_output("- 첫째 경험\n- 둘째 경험")
    assert not out.startswith("-")
    assert "첫째 경험" in out


# ── 한국어 섹션 헤더 (v0.7.6) ────────────────────────────────────


def test_removes_korean_section_headers():
    text = "기술 역량\n저는 Python을 다룹니다\n실행력과 협업\n팀에서 일했습니다"
    out = clean_llm_output(text)
    assert "기술 역량" not in out
    assert "실행력과 협업" not in out
    assert "저는 Python을 다룹니다" in out


# ── 개인정보 제거 (v0.7.6, Critical) ─────────────────────────────


def test_removes_email():
    assert "@" not in clean_llm_output("연락 주세요 rlghks0720@naver.com 감사합니다")


def test_removes_phone_number():
    out = clean_llm_output("휴대폰 010-9470-1752 로 연락주세요")
    assert "010-9470-1752" not in out


def test_removes_contact_label_lines():
    text = "이메일:\n휴대폰:\n저는 지원합니다"
    out = clean_llm_output(text)
    assert "이메일:" not in out
    assert "휴대폰:" not in out
    assert "저는 지원합니다" in out


def test_removes_address_line():
    text = "주소: 경기 의정부시 시민로194번길\n저는 지원합니다"
    out = clean_llm_output(text)
    assert "의정부시" not in out
    assert "저는 지원합니다" in out


def test_removes_zipcode_address_line():
    text = "(11728) 경기 의정부시 시민로194번길 10\n저는 지원합니다"
    out = clean_llm_output(text)
    assert "11728" not in out
    assert "저는 지원합니다" in out


def test_removes_closing_signature():
    text = "최선을 다하겠습니다.\n감사합니다. 차기환 드림"
    out = clean_llm_output(text)
    assert "차기환 드림" not in out
    assert "최선을 다하겠습니다" in out


# ── 반복 폭주 / reasoning 태그 ───────────────────────────────────


def test_strip_repetition_collapses_runaway():
    # 폭주 런이 접혀 입력보다 훨씬 짧아지고, 긴 반복이 사라진다 (정확 잔여 토큰은 비핵심)
    out = strip_repetition("8-8-8-8-8-8-8-8")
    assert len(out) < 5
    assert "8-8-8-8" not in out


def test_removes_think_block():
    out = clean_llm_output("<think>고민중...</think>저는 지원합니다")
    assert "고민중" not in out
    assert "저는 지원합니다" in out


# ── detect_output_issue ──────────────────────────────────────────


def test_detect_empty():
    assert detect_output_issue("") == "empty"


def test_detect_too_short():
    assert detect_output_issue("짧음") == "too_short"


def test_detect_repetition():
    assert detect_output_issue("정상 시작 " + "가나가나" * 10) == "repetition"


def test_detect_non_korean_flags_english_essay():
    text = "I am a backend engineer with strong experience in Python and FastAPI development work " * 2
    issue = detect_output_issue(text)
    assert issue is not None and issue.startswith("non_korean")


def test_detect_passes_clean_korean():
    text = "저는 백엔드 엔지니어로서 Python과 FastAPI를 활용해 다양한 시스템을 구축한 경험이 있습니다. " * 2
    assert detect_output_issue(text) is None


def test_english_ratio():
    assert english_ratio("저는 개발자입니다") == 0.0
    assert english_ratio("") == 0.0
    assert english_ratio("Python개발") > 0.0
