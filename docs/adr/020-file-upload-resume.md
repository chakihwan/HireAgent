# ADR-020: 이력서/문서 파일 업로드 (PDF/DOCX/MD/TXT)

- **상태**: 채택 (Accepted)
- **날짜**: 2026-05-25
- **결정자**: 개발자
- **관련**: [ADR-017](017-kure-v1-embedding.md), [ADR-019](019-github-repo-indexing.md)

---

## 컨텍스트

요구사항 F-1.1 (이력서 PDF/DOCX/MD), F-1.2 (자소서 텍스트). 이력서가 가장 핵심적인 사용자 데이터인데 텍스트로 직접 붙여넣는 건 불편함. 파일 업로드 지원이 필요.

### 후보 라이브러리

- **PDF**: `pypdf` (순수 Python, 일반 텍스트 PDF OK) vs `pdfplumber`(테이블 우수, 무거움) vs `pdfminer.six`(낮은 레벨)
- **DOCX**: `python-docx` (단일 옵션, 안정적)
- **이미지 PDF**: OCR(`pytesseract`) — 라이브러리 무거움 + 한국어 정확도 이슈

---

## 결정

**`pypdf` (PDF) + `python-docx` (DOCX) + 직접 디코딩 (MD/TXT). OCR은 미지원.**

### 구현 (`app/rag/loaders/file.py`)

```python
def parse_file(filename: str, data: bytes) -> str:
    if name.endswith(".pdf"):
        return _parse_pdf(data)        # pypdf.PdfReader → page.extract_text()
    if name.endswith(".docx"):
        return _parse_docx(data)       # docx.Document → paragraphs + tables
    if name.endswith((".md", ".markdown", ".txt")):
        return _parse_text(data)       # utf-8 / utf-8-sig / cp949 / euc-kr
```

API 엔드포인트: `POST /api/v1/projects/index-file` (multipart/form-data)
- 파라미터: `file` + 메타데이터 (`source_type`, `project_name`, `category`, ...)

---

## 이유

### pypdf 채택

- 순수 Python (시스템 의존성 없음, Docker 이미지 부담 작음)
- 일반 텍스트 PDF(이력서, README 변환 PDF) 추출 충분
- BSD-3 라이선스, 활발한 메인테넌스

### OCR 미지원

- Tesseract 시스템 의존성 + 한국어 모델 다운로드 + 이미지 전처리 복잡
- 한국어 OCR 정확도가 들쭉날쭉 (특히 폰트/배경 영향)
- 이력서는 보통 텍스트 기반이라 OCR 필요 케이스 적음
- 실패 시 사용자에게 "이미지 기반 PDF일 수 있습니다" 명확한 안내

### 한국어 인코딩 fallback

- `utf-8` 우선 (대부분 OK)
- 한국 Windows에서 만든 `.txt`는 CP949/EUC-KR 가능 → fallback chain
- 모두 실패하면 명확한 에러

### 파일 크기 제한 20MB

- 일반 이력서/README PDF는 1-5MB
- 메모리 부담 + 청킹 폭발 방지
- 더 크면 사용자에게 분할 권유

---

## 트레이드오프

| 항목 | 비용 |
|------|------|
| 의존성 추가 | `pypdf` (~2MB) + `python-docx` (~1MB) + `lxml` (이미 있음) |
| 이미지 PDF | 추출 불가 (사용자에게 텍스트 변환 안내) |
| 암호화 PDF | 명시적 에러 ("암호화된 PDF는 지원하지 않습니다") |
| 표 안 텍스트 (DOCX) | 추출 O — 단순 cell text만 (서식/순서 보존 X) |

---

## 명시적으로 하지 않는 것

- ❌ OCR (한국어 정확도 + 시스템 의존성)
- ❌ HWP/HWPX (한컴) 직접 파싱 — 사용자가 PDF 변환 후 업로드
- ❌ 이미지/사진 업로드
- ❌ ZIP/Archive 일괄 업로드 — 한 번에 한 파일

---

## 결과

### 긍정적
- ✅ 이력서 PDF/DOCX 즉시 업로드 → RAG 인덱싱
- ✅ MD/TXT는 인코딩 4종 자동 감지
- ✅ E2E 검증 (이력서 MD → 1개 청크 인덱싱)

### 부정적
- ⚠️ 스캔 PDF / 이미지 기반 이력서는 OCR 없이는 실패
- ⚠️ DOCX 복잡한 레이아웃(머리글/바닥글/이미지)은 미반영

### 사용자 안내
- 이미지 PDF면 명확한 에러 → 사용자가 텍스트 변환 후 재업로드
- HWP는 PDF로 변환 후 업로드 권장

---

## 변경 이력

| 날짜 | 변경 | 사유 |
|------|------|------|
| 2026-05-25 | 최초 작성 | M4 후속 파일 업로드 기능 도입 |
