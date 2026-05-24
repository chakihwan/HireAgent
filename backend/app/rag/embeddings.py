"""KURE-v1 한국어 임베딩 모델 — ADR-005, ADR-017.

- 모델: nlpai-lab/KURE-v1 (1024-dim, 한국어 SOTA)
- 첫 호출 시 lazy load (메모리 절약)
- async 호출 시 asyncio.to_thread로 이벤트 루프 블로킹 회피
"""
import asyncio
import logging
from threading import Lock

from sentence_transformers import SentenceTransformer

logger = logging.getLogger(__name__)

_MODEL_NAME = "nlpai-lab/KURE-v1"
EMBED_DIM = 1024

_model: SentenceTransformer | None = None
_load_lock = Lock()


def _get_model() -> SentenceTransformer:
    """싱글톤 lazy load. 첫 호출은 1-2분 (모델 다운로드 + 로드)."""
    global _model
    with _load_lock:
        if _model is None:
            logger.info(f"Loading embedding model: {_MODEL_NAME}")
            _model = SentenceTransformer(_MODEL_NAME)
            logger.info(f"Embedding model loaded (dim={EMBED_DIM})")
        return _model


async def embed_texts(texts: list[str]) -> list[list[float]]:
    """텍스트 배열 → 임베딩 배열. L2-normalized (코사인 유사도용)."""
    if not texts:
        return []
    model = _get_model()
    embeddings = await asyncio.to_thread(
        model.encode,
        texts,
        normalize_embeddings=True,
        show_progress_bar=False,
    )
    return embeddings.tolist()


async def embed_text(text: str) -> list[float]:
    """단일 텍스트 → 임베딩."""
    results = await embed_texts([text])
    return results[0]


async def warmup() -> None:
    """애플리케이션 시작 시 호출하면 첫 요청 응답 시간 단축."""
    _get_model()
