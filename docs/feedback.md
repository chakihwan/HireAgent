# 실사용 피드백 기록

> 본인 직접 사용 중 발견된 문제와 개선 요청을 기록합니다.  
> 형식: [날짜] 현상 → 원인 → 조치 상태

---

## 품질 이슈

### [2026-05-29] 개인 연락처가 자소서 본문에 노출

**현상**: 이력서 업로드 후 자소서 생성 시, 이메일·전화번호·주소가 본문에 포함됨  
```
연락처
이메일: rlghks0720@naver.com  
휴대폰: 010-9470-1752  
주소: (11728) 경기 의정부시 시민로194번길
```
**원인**: 사람인 이력서 첫 청크에 연락처 섹션이 포함 → RAG 검색에서 조회 → essay_writer 프롬프트에 주입 → 모델이 그대로 출력  
**조치**: `text_cleaner.py`에 이메일/전화/주소/서명 제거 패턴 추가 ✅ (v0.7.6)

---

### [2026-05-29] 글자수 초과 (500자 목표 → 689~787자 생성)

**현상**: 500자 목표인데 Compressor 3회 소진 후에도 689자/762자 출력  
**원인**: 
1. essay_writer가 초기 draft를 목표의 150% 이상으로 생성 (max_tokens=1500 → 더 많이 쓸 수 있음)
2. Compressor가 "N자 줄여주세요" 지시를 정확히 따르지 못함 (모델 한계)
3. exaone3.5:7.8b가 한국어 글자수 지시를 토큰 기준으로 이해하는 경향  
**조치**: 
- `max_tokens = char_limit × 2` (기존 × 3)로 물리적 제한 ✅ (v0.7.6)
- 프롬프트에 허용 범위(min~max) 명시 ✅ (v0.7.6)
- 근본 해결 미완: 재생성 버튼이나 글자수 fine-tuning UI 필요 (3순위)

---

### [2026-05-29] 한국어 섹션 헤더가 자소서 본문에 노출

**현상**: "기술 역량", "실행력과 협업", "연락처" 같은 소제목이 자소서 본문에 포함  
**원인**: `clean_llm_output()`이 영문 헤더만 처리, 한국어 헤더 미처리  
**조치**: `_KOREAN_HEADER_RE` 추가 ✅ (v0.7.6)

---

### [2026-05-29] 이력서 내용이 섞여서 나옴

**현상**: 학교 프로젝트(YOLO, Jetson) + 회사 프로젝트(LangGraph, FastAPI) + Apple 수리 경험이 자소서에 무작위로 혼합  
**원인**: RAG가 source_type/category 구분 없이 최근접 벡터 5개 반환 → 모든 경험이 동등하게 취급됨  
**조치**: source_type 가중 검색 추가 ✅ (v0.7.6) — `source_weights_for_category()`로 카테고리별 재랭킹. 직무경험은 project_readme 우대, 지원동기는 resume/essay 우대. 검증: 직무경험 → project_readme 5 / 지원동기 → resume 4, project_readme 1

---

### [2026-05-29] 현 재직 회사명이 지원동기에 노출

**현상**: 지원동기에 "건솔루션㈜의 백엔드 시스템 개발..."으로 시작 — 현 회사에 지원하는 것처럼 서술됨  
**원인**: 이력서 청크에 현 회사명이 여러 번 등장 → essay_writer가 회사명을 그대로 사용  
**조치 대기**: JD에서 회사명 추출 → essay_writer에 "지원 회사명은 XX, 현 재직회사와 혼동하지 말 것" 명시 필요

---

### [2026-05-26] RAG 레이블 본문 노출 (해결됨)

**현상**: `[참고 경험 1]`, `[경험 자료]` 같은 출처 레이블이 자소서 본문에 그대로 출력  
**조치**: `_RAG_LABEL_RE` 정규식 추가 + essay_writer 포맷 개선 ✅ (v0.7.2)

---

### [2026-05-26] Compressor가 볼드를 재도입 (해결됨)

**현상**: essay_writer가 볼드 제거 → 글자수 줄어 compress 트리거 → compressor가 `**볼드**` 재도입  
**조치**: `clean_llm_output()` 공통 유틸 분리 + compressor에도 적용 ✅ (v0.7.2)

---

## UX 이슈

### [2026-05-29] 생성 결과 직접 편집 불가

**현상**: 결과 카드가 readonly textarea라서 글자수 초과 시 직접 줄일 방법 없음  
**영향**: 글자수 초과 → 재생성밖에 방법 없음 → 시간 낭비  
**우선순위**: 높음 — `/generate` 인라인 편집 기능 필요 (ROADMAP M6 항목, ✅ v0.7.6 완료)

---

### [2026-05-29] 새로고침 시 이전 페이지로 이동

**현상**: `/generate`에서 새로고침하면 초기 상태로 리셋 (공고 입력, 항목 선택 등 초기화)  
**원인**: URL 상태 저장 없음, 로컬 스토리지에도 미저장  
**우선순위**: 중간 — UX 개선 필요하지만 치명적 아님

---

### [2026-05-27] 사람인 북마클릿 iframe 한계

**현상**: 북마클릿이 사람인 공고 iframe 본문에 도달 못 하는 경우 빈번  
**우회**: Ctrl+P → PDF 저장 → 복사 (ADR-023)  
**우선순위**: 낮음 — Ctrl+P 우회가 있어서 막히진 않음

---

### [2026-06-01] VRAM 초과 모델 선택 시 runner 종료 (network error)

**현상**: 초안 작성 노드에 `gemma4:e4b`(9.6GB) 지정 → "network error", 백엔드 500  
**원인**: RTX 5060 VRAM 7.1GB < 모델 9.8GB → Ollama llama runner 강제 종료
```
gpu memory available="7.1 GiB" / total needed="9.8 GiB"
error="llama runner process has terminated"
```
**조치**: ✅ **해결 (v0.7.7)** — 런타임 GPU 조회 기반 사전 경고
- `app/utils/gpu.py`: nvidia-ml-py(NVML)로 실제 VRAM 조회 (하드코딩 X → 어떤 NVIDIA 하드웨어도 대응)
- `/ollama/models`가 모델별 fit(ok/tight/over) 판정 반환, `/generate` 생성 전 over 모델 차단
- graceful: GPU 없으면 경고 비활성화 (CPU/AMD/Mac/배포 환경)
- 검증: RTX 5060 8GB → gemma4:e4b(9.8GB 필요) over 정확 판정, exaone/qwen 등 ok

**추후 과제 — Mac(Apple Silicon) 통합 메모리 대응**:
- M칩은 Metal GPU + 통합 메모리(RAM=VRAM)로 LLM 가속이 강력함 ("Mac=GPU 없음"은 오해)
- 단 ① Docker Desktop이 Metal passthrough 미지원 → 컨테이너 Ollama는 CPU. ② NVML이 Apple 미지원
- 정확 대응하려면: 네이티브 Ollama(Metal) 전제 + 메모리 조회 경로 필요
  - 백엔드가 Docker Linux 컨테이너면 호스트 Mac 메모리 못 봄 → `sysctl hw.memsize`/`psutil` 무의미
  - 대안: Ollama `/api/ps`의 `size_vram`로 **사후** 판정, 또는 백엔드 네이티브 실행 시 psutil
- 우선순위: 낮음 — 실제 Mac 사용자 생기는 Phase 3 배포 시점에 처리

---

### [2026-06-01] SSR hydration mismatch (해결됨)

**현상**: `/generate` 콘솔에 hydration 에러 — select 옵션 값 불일치  
**원인**: `agentConfigs`를 `useState(loadSettings())`로 초기화 → 서버=DEFAULT, 클라=localStorage 불일치  
**조치**: `useEffect`로 마운트 후 localStorage 지연 로드 ✅ (v0.7.7)

---

## 요청/아이디어

- [ ] 결과 인라인 편집 + 글자수 실시간 카운터 (가장 급함)
- [ ] 지원 회사명을 JD에서 추출해서 essay_writer에 전달 (할루시네이션 방지)
- [ ] 이력서/GitHub/자소서 청크를 source_type별로 구분 검색 (RAG 품질)
- [ ] 생성 완료 후 바로 라이브러리 저장 버튼 (현재 저장 경로가 불분명)
- [ ] 항목 글자수를 실제 공고에서 자동 감지 ("최대 500자" 파싱)
