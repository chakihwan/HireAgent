# ADR-010: HireAgent 전용 Ollama 컨테이너 분리

- **상태**: 채택 (Accepted)
- **날짜**: 2026-05-22
- **결정자**: 개발자

---

## 컨텍스트

Ollama 로컬 LLM 연결 방식을 결정해야 했다. WSL2 환경에서 다음 선택지가 있었다:
1. WSL2 네이티브 Ollama 프로세스 (`ollama serve`) 사용
2. 다른 프로젝트의 Ollama Docker 컨테이너 공유
3. HireAgent 전용 Ollama Docker 컨테이너 추가

---

## 결정

**`docker-compose.yml`에 `hireagent-ollama` 전용 컨테이너를 추가하고, 포트 11435를 사용한다.**

```yaml
ollama:
  image: ollama/ollama
  container_name: hireagent-ollama
  ports:
    - "11435:11434"          # 11434는 다른 프로젝트가 선점
  volumes:
    - ${HOME}/.ollama:/root/.ollama   # 기존 모델 재사용
```

백엔드는 Docker 내부 네트워크로 직접 연결:
```
OLLAMA_BASE_URL: http://ollama:11434  # 내부망, host-gateway 우회 없음
```

---

## 이유

### 문제 상황

개발 환경에서 다른 프로젝트 컨테이너들이 다음 포트를 선점하고 있었다:
- `8000`: master-agent
- `8001`: scheduling-agent
- `8002`: process-agent
- `11434`: 다른 프로젝트의 ollama 컨테이너 (메모리 부족, 다른 모델)

`host.docker.internal:11434`로 연결하면 **다른 프로젝트의 Ollama**가 응답했다.
그 컨테이너는 메모리 부족으로 원하는 모델(exaone3.5:7.8b)을 실행할 수 없었다.

### 전용 컨테이너의 장점

| 항목 | 공유 Ollama | 전용 컨테이너 |
|------|-----------|-------------|
| 모델 관리 | 다른 프로젝트와 간섭 | HireAgent 독립 관리 |
| 시작/종료 | 수동 (`ollama serve`) | `docker compose up/down` |
| 포트 충돌 | 위험 | 11435로 고정, 충돌 없음 |
| 내부 통신 | host-gateway 경유 | Docker 내부망 직통 |
| 모델 영속성 | `~/.ollama` 직접 | 볼륨 마운트로 동일 보장 |

---

## 볼륨 전략

`${HOME}/.ollama:/root/.ollama` 마운트로 WSL2 기존 모델을 재활용한다:
- 재다운로드 없이 기존 설치 모델 즉시 사용
- pull한 모델이 호스트 파일시스템에 영구 저장
- `docker compose down`해도 모델 유지 (`-v` 옵션은 사용하지 말 것)

---

## 결과

### 긍정적
- ✅ 다른 프로젝트와 완전히 독립된 Ollama 환경
- ✅ `docker compose up` 한 번으로 전체 스택(DB + Ollama + Backend) 기동
- ✅ Docker 내부망 직접 연결로 네트워크 오버헤드 없음

### 부정적
- ⚠️ 포트 11435가 추가로 사용됨 (외부 접근 시 포트 번호 기억 필요)
- ⚠️ 모델 pull 시 hireagent-ollama 컨테이너 기준으로 해야 함

### 운영 명령

```bash
# 새 모델 추가
./scripts/pull-models.sh pull llama3.3:70b
# 또는
docker exec hireagent-ollama ollama pull <모델명>

# 모델 목록
./scripts/pull-models.sh list

# API로 조회
curl http://localhost:8080/api/v1/ollama/models
```

---

## 변경 이력

| 날짜 | 변경 | 사유 |
|------|------|------|
| 2026-05-22 | 최초 작성 | M1 Day 3-4 구현 중 포트 충돌 문제 해결 |
