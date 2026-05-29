"""기술 키워드 추출 / 병합 단위 테스트 (할루시네이션 방지 화이트리스트의 기반)."""

from app.rag.tech_extractor import extract_tech_stack, merge_tech_stacks


def test_extract_basic_stack():
    text = "Python과 FastAPI로 백엔드를 만들고 PostgreSQL과 Docker를 사용했습니다."
    found = extract_tech_stack(text)
    assert "Python" in found
    assert "FastAPI" in found
    assert "PostgreSQL" in found
    assert "Docker" in found


def test_extract_normalizes_postgres_alias():
    assert "PostgreSQL" in extract_tech_stack("Postgres 기반으로 구축")


def test_extract_korean_adjacent_boundary():
    # 한국어 조사 인접해도 매칭 (\b 한계 우회 검증)
    assert "PyTorch" in extract_tech_stack("PyTorch로 학습했습니다")
    assert "LangGraph" in extract_tech_stack("LangGraph를 활용한 오케스트레이션")


def test_extract_empty_returns_empty():
    assert extract_tech_stack("") == []


def test_extract_respects_max_items():
    text = "Python JavaScript TypeScript Java Go Rust Ruby PHP"
    assert len(extract_tech_stack(text, max_items=3)) == 3


def test_merge_dedups_case_insensitive():
    merged = merge_tech_stacks(["Python", "FastAPI"], ["python", "Docker"])
    lowered = [t.lower() for t in merged]
    assert lowered.count("python") == 1
    assert "Docker" in merged


def test_merge_skips_empty_values():
    merged = merge_tech_stacks(["Python", ""], [None, "Docker"])  # type: ignore[list-item]
    assert "" not in merged
    assert None not in merged
    assert set(merged) == {"Python", "Docker"}
