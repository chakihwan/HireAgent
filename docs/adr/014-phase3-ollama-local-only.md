# ADR-014: Phase 3 배포 시 Ollama는 사용자 로컬 전용 (서버 미배포)

- **상태**: 채택 (Accepted)
- **날짜**: 2026-05-22
- **결정자**: 개발자
- **관련**: [ADR-008](008-multi-llm-provider.md), [ADR-010](010-dedicated-ollama-container.md)

---

## 컨텍스트

Phase 3에서 클라우드(Railway/Fly.io + Vercel)에 배포할 때 Ollama 처리 방안 결정이 필요했다.
선택지:
1. 서버에도 Ollama 컨테이너 배포 (GPU 인스턴스 필요)
2. 서버에서 사용자 로컬 Ollama로 outbound 호출 (사용자 IP 노출 + 방화벽)
3. 브라우저 → 사용자 로컬 Ollama 직접 호출 (서버 미경유)
4. 클라우드 Ollama 미지원 (사용자가 외부 LLM API만 사용)

---

## 결정

**Phase 3 배포 시 서버에는 Ollama를 올리지 않는다.**
**Ollama 사용은 "사용자 PC에 설치된 경우에만 작동하는 선택 기능"으로 제공한다.**
**브라우저에서 사용자 로컬 Ollama로 직접 호출한다 (서버 미경유).**

```
[사용자 브라우저] ───→ [Vercel: Next.js] ───→ [Railway: FastAPI] ───→ External LLM
       │
       └──→ http://localhost:11434 (로컬 Ollama, 사용자 본인 PC만 도달 가능)
```

---

## 이유

### 1번(서버 Ollama 배포)을 기각한 이유
| 항목 | 평가 |
|------|------|
| Railway GPU 비용 | 월 $50~150+ (개인 SaaS에 부담) |
| Fly.io GPU | 한정 리전, $1+/시간 |
| CPU 추론 | 7B 모델도 토큰당 수 초 → UX 최악 |
| 멀티유저 큐잉 | 동시 요청 처리 어려움 |

### 2번(서버 → 로컬 outbound)을 기각한 이유
| 항목 | 평가 |
|------|------|
| 사용자 IP 노출 | 보안 우려 |
| 방화벽 | 대부분 inbound 차단되어 도달 불가 |
| NAT/공유기 | 포트 포워딩 강요 |

### 3번(브라우저 → 로컬 직접 호출)을 채택한 이유
- 사용자 PC 내부 호출이므로 네트워크 비용 0
- 보안: 평문 응답이 서버를 거치지 않음
- 단점: CORS 문제 해결 필요 (Ollama 측에 `OLLAMA_ORIGINS` 환경변수 설정)

### 4번(미지원)을 기각한 이유
- 사용자가 무료 압축/평가 에이전트로 Ollama를 쓰는 케이스를 막게 됨
- ADR-008 (멀티 LLM 프로바이더)의 비용 컨트롤 가치 훼손

---

## CORS 해결 방법 (사용자 가이드)

사용자가 클라우드 HireAgent에서 로컬 Ollama를 쓰려면 다음 설정이 필요하다:

```bash
# 사용자 PC에서 Ollama 실행 시
OLLAMA_ORIGINS="https://app.hireagent.io,https://*.vercel.app" ollama serve
```

또는 `~/.ollama/config.json`:
```json
{"origins": ["https://app.hireagent.io"]}
```

설정 페이지에 가이드 링크 제공.

---

## Phase 1/2/3 비교

| Phase | 환경 | Ollama 호출 경로 |
|-------|------|----------------|
| 1 (현재, 로컬 개발) | Docker Compose | 백엔드 → `http://ollama:11434` (내부망, ADR-010) |
| 2 (확장 기능, 여전히 로컬) | Docker Compose | 동일 |
| 3 (클라우드 배포) | Vercel + Railway | **브라우저 → `http://localhost:11434` 직접** |

Phase 3에서 LLM Factory가 직접 호출하지 않고, **프론트엔드가 Ollama 호출을 분기**하는 구조로 변경된다.

```typescript
// frontend (Phase 3)
async function callLLM(provider, model, prompt) {
  if (provider === 'ollama') {
    // 사용자 로컬 Ollama 직접 호출
    return fetch('http://localhost:11434/api/generate', { ... });
  }
  // 그 외는 백엔드 경유
  return fetch('/api/v1/llm/call', { ... });
}
```

---

## 대안 (검토 후 기각)

### 대안 1: HuggingFace Inference API로 대체
- ❌ 기각: 일부 모델만 지원, 한국어 모델(EXAONE 등) 미지원

### 대안 2: Together AI / Replicate 등 외부 GPU 호스팅 연동
- ❌ 기각: 결국 외부 API가 되어 "로컬 LLM" 가치 사라짐, 사용자 비용 발생

---

## 결과

### 긍정적
- ✅ Phase 3 클라우드 비용 최소화 (GPU 비용 0)
- ✅ 사용자가 원하면 무료 로컬 LLM 활용 가능 유지
- ✅ 데이터 프라이버시: Ollama 응답이 서버 거치지 않음

### 부정적
- ⚠️ Ollama 사용자는 CORS 설정 1회 필요 (UX 마찰점)
- ⚠️ 브라우저 측 LLM 호출 분기 로직 추가 필요 (Phase 3)
- ⚠️ 모바일/태블릿에서는 로컬 Ollama 사용 불가 (External LLM만 가능)

---

## 변경 이력

| 날짜 | 변경 | 사유 |
|------|------|------|
| 2026-05-22 | 최초 작성 | 아키텍처 검토 중 Phase 3 Ollama 처리 누락 발견 |
