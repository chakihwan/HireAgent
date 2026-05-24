# ADR-017: 임베딩 모델 KURE-v1 (한국어 SOTA) 채택

- **상태**: 채택 (Accepted)
- **날짜**: 2026-05-24
- **결정자**: 개발자
- **관련**: [ADR-004](004-pgvector-over-chroma.md), [ADR-005](005-korean-embeddings.md), [ADR-010](010-dedicated-ollama-container.md)

---

## 컨텍스트

M4 RAG 파이프라인에서 한국어 자소서/이력서/프로젝트 README를 임베딩한다.
ADR-005에서 후보로 **BGE-M3** 또는 **KURE-v1**을 제시했으나, 실제 구현 시점에 선택이 필요했다.

자소서 도메인은 한국어 비중이 99%이므로 다국어 모델보다 한국어 특화 모델의 검색 품질이 의미 있는 차이를 만든다.

### 후보

1. **Ollama bge-m3** — multilingual, 1024-dim, 이미 인프라 있음(ADR-010)
2. **Sentence-Transformers + nlpai-lab/KURE-v1** — 한국어 SOTA, 1024-dim, BGE-M3 기반 한국어 fine-tuned
3. **OpenAI text-embedding-3-small** — API 호출, 1536-dim (스키마 변경 필요)

---

## 결정

**`nlpai-lab/KURE-v1`을 sentence-transformers로 백엔드 컨테이너 내에서 로드한다.**

### 구현

```python
# backend/app/rag/embeddings.py
_MODEL_NAME = "nlpai-lab/KURE-v1"
EMBED_DIM = 1024

_model: SentenceTransformer | None = None  # singleton lazy load

async def embed_texts(texts: list[str]) -> list[list[float]]:
    model = _get_model()
    embeddings = await asyncio.to_thread(
        model.encode, texts, normalize_embeddings=True
    )
    return embeddings.tolist()
```

- **Lazy load**: 첫 호출 시 모델 다운로드 + 로드 (1-2분), 이후 메모리 캐시
- **`asyncio.to_thread`**: synchronous `model.encode`를 별도 스레드로 → 이벤트 루프 블로킹 회피
- **`normalize_embeddings=True`**: L2 normalize → 코사인 유사도 = 내적
- **1024-dim**: pgvector `Vector(1024)` 스키마와 일치 (ADR-004)

---

## 이유

### KURE-v1을 채택한 이유

1. **한국어 SOTA**: BGE-M3 기반에 한국어 데이터로 추가 fine-tune → 한국어 의미 유사도 검색 품질 측면에서 multilingual 대비 우위
2. **차원 일치**: 1024-dim으로 기존 pgvector 스키마 그대로 사용
3. **검증된 평가**: 한국어 임베딩 벤치마크(Ko-MTEB)에서 상위권
4. **자소서 도메인 적합**: 한국어 비중 99% 사용처에 multilingual 모델은 오버킬

### Ollama bge-m3를 기각한 이유

- multilingual 모델이라 한국어 특화 모델 대비 검색 품질에서 떨어질 가능성
- Ollama 임베딩 API는 별도 호출 오버헤드 (HTTP 왕복)
- 모델 import/관리에 추가 작업 필요

### OpenAI API를 기각한 이유

- pgvector 스키마 1024 → 1536 마이그레이션 필요
- 비용 발생 (사용자 키 사용 시 사용자 부담)
- 외부 의존성 (네트워크 장애 시 인덱싱/검색 모두 중단)
- 본인 도구 + 포트폴리오 정체성에 자체 모델이 더 적합

---

## 트레이드오프

| 항목 | 비용 |
|------|------|
| 백엔드 이미지 크기 | sentence-transformers + transformers + torch CPU ≈ 2-3GB 추가 |
| 첫 호출 응답 시간 | 모델 다운로드(약 2GB) + 로드 1-2분 (이후 캐시) |
| 메모리 점유 | 모델 상주 약 2GB RAM |
| GPU 활용 | backend 컨테이너에 GPU passthrough 추가 시 약 5배 빠름 (현재는 CPU 모드) |

### 완화

- **Lazy load**: 처음 RAG 사용 전까지는 메모리 소비 없음
- **`warmup()` 함수**: 사전 로드 시 첫 요청 응답 시간 단축 가능
- **GPU 활용은 future work**: 현재는 인덱싱이 1회성이라 CPU로도 충분

---

## 대안 (검토 후 기각)

### 대안 1: Ollama에 KURE-v1 GGUF import
- GGUF 변환된 KURE-v1 부재 + 변환 검증 부담
- Ollama 임베딩 API 호출 오버헤드
- 결국 sentence-transformers와 동일한 KURE-v1을 쓰는데 운영 분리 이득 작음

### 대안 2: 별도 임베딩 서버 컨테이너 분리
- backend와 분리해 이미지 크기/메모리 격리
- ⏸️ 보류: 사용량 늘면 분리 검토 (현재는 단일 사용자라 불필요)

### 대안 3: dragonkue/bge-m3-ko 등 BGE-M3 한국어 파인튜닝
- KURE-v1과 비슷한 성능 예상
- KURE-v1이 좀 더 표준적인 한국어 평가 결과 보유

---

## 구현 시 주의사항

1. **모델 다운로드 위치**: HuggingFace Hub에서 `~/.cache/huggingface/hub/`에 다운로드 → 컨테이너 재시작 시 매번 다운로드 방지 위해 volume 마운트 검토 필요 (M4-2 후속)
2. **`asyncio.to_thread` 필수**: `model.encode()`는 CPU/GPU 블로킹 함수, 동기 호출 시 이벤트 루프 멈춤
3. **threading.Lock**: 동시 첫 호출 시 모델 중복 로드 방지
4. **검색 거리 threshold**: 코사인 거리 0.8 이하만 채택 (그 이상은 무관한 결과로 간주, `rag_retriever.py`)

---

## 결과

### 긍정적
- ✅ 한국어 자소서 도메인에 최적 (검색 정확도)
- ✅ pgvector 스키마 변경 없이 적용
- ✅ 외부 의존성 없음 (오프라인 동작)
- ✅ E2E 검증 통과 (자소서가 인덱싱된 경험을 자연스럽게 반영)

### 부정적
- ⚠️ 백엔드 이미지 크기 증가 (~2-3GB)
- ⚠️ 첫 사용 시 응답 지연 (1-2분, lazy load)

---

## 변경 이력

| 날짜 | 변경 | 사유 |
|------|------|------|
| 2026-05-24 | 최초 작성 | M4 RAG 구현 시점 모델 확정 |
