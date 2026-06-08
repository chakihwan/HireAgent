# ADR-027: API 키 DB 암호화 연결 (crypto.py → UserLLMConfig)

- **상태**: 채택 (Accepted)
- **날짜**: 2026-06-08
- **결정자**: 개발자
- **관련**: CLAUDE.md Rule #2, [ADR-003](003-multi-user-design-from-start.md), [ADR-008](008-multi-llm-provider.md)

---

## 컨텍스트

CLAUDE.md 절대 규칙 #2는 "사용자 API 키는 AES-256(Fernet) 암호화 후 DB 저장"을 요구한다.
그러나 구현은 절반만 돼 있었다.

- `app/utils/crypto.py`(Fernet encrypt/decrypt/mask)는 **완성됐으나 어디서도 호출되지 않음**.
- `UserLLMConfig` 모델·`user_llm_configs` 테이블은 존재하나 **연결된 API/서비스 없음**.
- 실제 키 흐름은 규칙 위반 상태였다:
  ```
  프론트 localStorage(평문 providerKeys)
    → 생성 요청 body의 agent_config[*].api_key (평문 전송)
    → 백엔드가 그대로 LLMFactory에 전달
  ```
  즉 키가 브라우저에 평문 저장되고, 매 생성마다 평문으로 네트워크를 오갔다.

---

## 결정

**키는 백엔드 DB에 Fernet 암호화 저장하고, 평문은 localStorage·생성 요청 body 어디에도 두지 않는다.**

### 1. settings API (Phase 1)
- `PUT /settings/llm-keys` { provider, api_key } → 평문 1회 수신 → `encrypt_api_key` → `UserLLMConfig.encrypted_keys[provider]`
- `GET /settings/llm-keys` → 복호화 후 `mask_key`로 **마스킹된 값만** 반환 (평문 비노출)
- `DELETE /settings/llm-keys/{provider}`
- JSONB는 새 dict를 할당해야 SQLAlchemy가 변경을 감지 → `dict(...)` 후 재할당

### 2. 생성 플로우가 DB 키 사용 (Phase 2)
- `_resolve_api_key(db, user_id, provider, body_key)`:
  - ollama → 서버 URL
  - 클라우드 → body_key 우선(과도기 하위호환), 없으면 DB 복호화
- `_build_agent_config`·`_build_items`를 async화 + db 전달. `generate_essays_sync`에 db 의존성 추가.

### 3. 프론트 전환 (Phase 3)
- `/models`: 저장을 `PUT`(DB 암호화)으로, 표시를 `GET`(마스킹)으로. 입력 후 평문을 화면에서 즉시 제거.
- 생성 요청 body의 `api_key`를 `""`로 → 백엔드가 DB에서 복호화.

### 최종 키 흐름
```
프론트 → (HTTPS, 키 입력 시 1회) → 백엔드 Fernet 암호화 → DB(encrypted_keys)
생성 시: 백엔드가 DB에서 복호화 → LLMFactory. 평문은 agent_config dict에만 잠시 존재.
```

---

## 이유

- **Rule #2 충족**: 평문이 브라우저·생성 body에 남지 않는다. DB엔 Fernet 토큰만.
- **멀티유저 대비(ADR-003)**: `user_llm_configs`가 user_id PK라 Phase 3 배포 시 그대로 확장.
- **마이그레이션 불필요**: `user_llm_configs` 테이블이 초기 마이그레이션에 이미 포함돼 있어 추가 작업 없음.
- **점진 전환 안전성**: `_resolve_api_key`가 body_key를 우선하므로, 프론트 전환 전에도 기존 동작이 깨지지 않는다.

---

## 트레이드오프

| 항목 | 결정 |
|------|------|
| 저장 시 평문 1회 네트워크 통과 | 불가피 — HTTPS 전제. 받는 즉시 암호화 |
| 복호화 평문이 agent_config dict에 머묾 | 그래프 실행 동안 메모리에 존재. 로그·응답엔 절대 비노출 (완전 즉시 제거는 구조상 어려움) |
| ENCRYPTION_KEY 분실 시 전체 키 복호화 불가 | Fernet 특성. 분실 시 재입력 필요 (mask가 "복호화 실패" 표시) |

---

## 명시적으로 하지 않는 것

- ❌ 키 로테이션/만료 — 단순 저장만
- ❌ provider가 아닌 agent별 키 — 현재 provider 단위 (같은 provider면 모든 agent 공유)
- ❌ 저장 시점 키 유효성 검증(테스트 호출) — ROADMAP "API 키 테스트 호출"로 분리

---

## 결과

### 긍정적
- ✅ Rule #2 충족 — DB에 Fernet 암호문(gAAAAA…), 평문 비노출 검증
- ✅ E2E 동작: Google 키 저장 → DB 암호문 → 복호화 → gemini-2.5-flash 실제 생성 성공
- ✅ 생성 body에 평문 키 없음 (api_key="")

### 부정적/후속
- ⚠️ 복호화 평문의 메모리 즉시 제거는 미완 (dict 수명 동안 존재)
- 📝 무료 티어 429 빈발 → backoff 재시도가 후속 과제 (ROADMAP)

---

## 변경 이력

| 날짜 | 변경 | 사유 |
|------|------|------|
| 2026-06-08 | 최초 작성 | crypto.py 미연결 + 평문 localStorage/body 전송 해소 (Rule #2) |
