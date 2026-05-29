"""글자수 검증 유틸 단위 테스트 (ADR-001: Python len() 기반)."""

from app.utils.char_counter import count_chars, diff_chars, validate_chars


def test_count_chars_includes_space_by_default():
    assert count_chars("안녕 하세요") == 6


def test_count_chars_excludes_space_when_requested():
    assert count_chars("안녕 하세요\n끝", include_space=False) == 6


def test_count_chars_strips_all_whitespace_kinds():
    assert count_chars("a b\tc\nd\re", include_space=False) == 5


def test_validate_chars_ok_within_tolerance():
    # 목표 100, ±5% → 95~105
    assert validate_chars("가" * 100, 100) == "ok"
    assert validate_chars("가" * 95, 100) == "ok"
    assert validate_chars("가" * 105, 100) == "ok"


def test_validate_chars_compress_when_over():
    assert validate_chars("가" * 106, 100) == "compress"


def test_validate_chars_expand_when_under():
    assert validate_chars("가" * 94, 100) == "expand"


def test_validate_chars_custom_tolerance():
    # tolerance 0.1 → 90~110
    assert validate_chars("가" * 109, 100, tolerance=0.1) == "ok"
    assert validate_chars("가" * 111, 100, tolerance=0.1) == "compress"


def test_diff_chars_sign():
    assert diff_chars("가" * 120, 100) == 20      # 초과 → 양수
    assert diff_chars("가" * 80, 100) == -20      # 부족 → 음수
    assert diff_chars("가" * 100, 100) == 0
