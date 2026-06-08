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
- compressor `max_tokens = char_limit × 1.1`로 추가 타이트화 ✅ (v0.7.7)
- **단계별 이력(draft_history)으로 압축 과정 가시화** ✅ (v0.7.7, ADR-026)
  - 검증: 초안 626자 → 압축 493 → 454 (목표 300). 동작하나 **수렴 실패**가 명확히 보임
- **근본 한계 확정**: exaone3.5:7.8b가 한국어 글자수를 토큰 단위로 인식 → LLM 압축만으로 완전 수렴 불가
  - 현실적 대응: 인라인 편집(완료) + 이력으로 투명화. Python 강제 트런케이션은 품질 희생이라 보류
  - 대안: 클라우드 모델(Claude/GPT)은 글자수 지시 더 정확 — 사용자 선택지로 제공됨

---

### [2026-06-02] Gemini 2.5-flash 실측 — 글자수 수렴 한계는 클라우드 모델도 동일

**배경**: ADR-026의 "LLM은 한국어 글자수를 토큰으로 인식 → 압축 수렴 불가" 가설을, Google provider 구현 후 Gemini 2.5-flash로 실측 검증.
**결과** (자기소개 목표 500자):
```
초안(write) 673자 (+173)  →  압축1회 600자 (+100)  →  압축2회 600자 (+100, 완전 정체)  →  종료
```
- **압축은 동작** (673→600, thinking off 후 본문도 정상). 하지만 **2회차 600→600 정체** — 더 못 줄임
- **결론**: Gemini도 한국어 글자수 정밀 제어 실패. 단 exaone(689~787자)보다는 덜 초과(600자). LLM 공통 한계 확정
- `MAX_ITERATIONS=3`이나 write가 iteration=1로 시작 → 실질 압축 2회. 단 정체 상태라 횟수 늘려도 무의미
**조치**: 처방으로 **현행 유지 + 인라인 편집** 선택 (Python 트런케이션은 ADR-026대로 보류 — 사용자 통제권 우선)

---

### [2026-06-02] Gemini 2.5 thinking 토큰이 max_output_tokens 잠식 → 본문 50자로 잘림 (해결됨)

**현상**: Gemini 2.5-flash로 500자 자소서 생성 시 본문이 50자만 출력
**원인**: gemini-2.5 계열은 **thinking(reasoning) 토큰이 max_output_tokens에 포함**됨. 작성 노드 max_tokens(500자→1000토큰)를 thinking이 거의 다 소비 → 실제 본문이 수십 자로 잘림
**조치**: ✅ `google.py`에서 2.5 계열은 `ThinkingConfig(thinking_budget=0)`로 thinking off (자소서 글쓰기엔 reasoning 불필요). 2.0/1.5 등 미지원 모델엔 미적용(400 방지)

**참고 — Gemini 무료 티어 제약** (실측):
- `gemini-2.5-pro`는 무료 티어 quota=0 (429 RESOURCE_EXHAUSTED, limit:0) → 무료로 사용 불가. flash 계열만 가능
- 멀티에이전트(노드 4개 × 항목 수) 동시 호출 시 분당 요청 한도 초과(429)·서버 과부하(503) 빈번
  - 추후 과제: 429/503 자동 재시도(exponential backoff) — 현재는 tenacity가 일부 재시도하나 무료 한도엔 무력

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

### [2026-06-02] 사람인 복사 안내가 끊겨 있던 기능 퇴행 (해결됨)

**현상**: 사람인 URL 입력 시 "자동 추출 불가"만 뜨고, 정작 해결책(북마클릿/Ctrl+P/페이지소스)을 안 보여줌
**원인**: 풀스크린 개편(ADR-024) 때 generate를 사이드바+캔버스로 재구성하면서, 전체 폭 카드인 `SpaSiteGuide`가 좁은 사이드바에 안 들어가 임시로 간략 메시지로 대체 → SpaSiteGuide 호출이 끊긴 채 방치됨
**조치**: ✅ "📋 복사 방법 보기" 버튼 → `SpaSiteGuide`를 모달로 복원 (전체 폭 확보). 실사용 중 발견

### [2026-06-02] 생성 에러 후 버튼 먹통 (해결됨)

**현상**: 유료 모델(gemini-2.5-pro) 경고 무시하고 진행 → 429 에러 → 초기화·생성 버튼이 새로고침 전까지 안 먹힘
**원인**: `gen.run` 에러 시 `setGenError`만 하고 `step`이 "generating"에 고착 → `isGenerating=true` → 버튼 disabled
**조치**: ✅ `run`에 onError 콜백 → 실패 시 step "items" 복귀(생성 상태 해제) + 초기화 버튼을 에러 상태에서도 노출

### [2026-06-02] 항목 체크 시 디폴트 글자수가 튐 (해결됨)

**현상**: 자기소개 디폴트가 300으로 표시되는데, 체크하면 500으로 바뀜
**원인**: `handleItemChange`가 charLimit을 500으로 하드코딩 → 표시값(preset.default)과 적용값 불일치
**조치**: ✅ 체크 시 항목 default가 그대로 적용되게 수정 + 자기소개 300→500 통일 (직무경험 700 등 특수 항목은 유지)

### [2026-06-02] 유료 티어 모델 선택 시 생성 후에야 실패 인지

**현상**: gemini-2.5-pro는 무료 티어 quota=0인데, 생성을 끝까지 시도한 뒤에야 429로 실패
**원인**: 클라우드 모델 목록이 하드코딩(CLOUD_MODELS)이고, 모델 가용성/티어는 호출 전 알 수 없음
**조치**: ✅ 생성 직전 **소프트 경고 모달** (차단 아님 — 유료 사용자는 진행 가능, 무료는 429 사전 고지). `PAID_TIER_ONLY_MODELS`로 관리
**남은 과제**: 클라우드 모델 목록 동적 로딩(ROADMAP) — 단 ListModels는 "존재 여부"만 주고 "내 티어 가용성"은 못 줘서 pro 표시는 여전. 근본은 런타임 확인뿐

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

**추후 과제 — GPU 정보가 "백엔드 머신" 기준 (배포 시 불일치)**:
- `/ollama/gpu`는 nvidia-ml-py로 **백엔드가 실행되는 머신**의 GPU를 조회
- 현재 단일 머신(백엔드=본인 PC)이라 본인 GPU가 정확히 보임
- 배포 시(ADR-014: Ollama 로컬, 백엔드 클라우드) → 모든 사용자가 "클라우드 서버 GPU"를 동일하게 봄
  - 실제 추론은 사용자 로컬 Ollama인데 표시 GPU와 불일치
- 근본: GPU 정보는 "Ollama가 도는 곳"의 것이어야 하나 현재는 "백엔드가 도는 곳"의 것
- 대안: Ollama `/api/ps`의 `size_vram`(로드된 모델 실측) 활용 또는 브라우저→로컬 Ollama 직접 조회
- 우선순위: 낮음 — Phase 3 배포 시점에 Mac 이슈와 함께 처리

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
