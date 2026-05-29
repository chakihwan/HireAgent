"""RAG source_type 가중치 선택 로직 단위 테스트 (v0.7.6).

`search()` 자체는 DB+임베딩이 필요해 통합 테스트 영역이라 여기선 제외하고,
카테고리 → 가중치 맵 선택 규칙만 고정한다.
"""

from app.rag.retriever import (
    _DEFAULT_SOURCE_WEIGHTS,
    _MOTIVATION_SOURCE_WEIGHTS,
    source_weights_for_category,
)


def test_default_prefers_project_docs():
    # 직무경험 등: project_readme가 resume보다 낮은(우대) 가중치
    w = source_weights_for_category("직무경험")
    assert w is _DEFAULT_SOURCE_WEIGHTS
    assert w["project_readme"] < w["resume"]


def test_motivation_prefers_essay_and_resume():
    # 지원동기: essay가 가장 우대, project 문서는 덜 우대
    w = source_weights_for_category("지원동기")
    assert w is _MOTIVATION_SOURCE_WEIGHTS
    assert w["essay"] < w["resume"]
    assert w["essay"] < w["project_readme"]


def test_motivation_keyword_variants():
    for category in ("지원 동기", "입사 후 포부", "회사 비전", "장기 목표"):
        assert source_weights_for_category(category) is _MOTIVATION_SOURCE_WEIGHTS


def test_unknown_category_falls_back_to_default():
    assert source_weights_for_category("자기소개") is _DEFAULT_SOURCE_WEIGHTS
    assert source_weights_for_category("성장과정") is _DEFAULT_SOURCE_WEIGHTS
