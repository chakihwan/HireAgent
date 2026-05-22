#!/bin/bash
# HireAgent Ollama 모델 관리 스크립트
# 사용법: ./scripts/pull-models.sh [pull|list|delete]

CONTAINER="hireagent-ollama"

# 기본 모델 목록 (필요에 따라 추가/제거)
MODELS=(
  "exaone3.5:7.8b"    # 한국어 특화, 자소서 작성 에이전트 추천
  "gemma4:e2b"         # 경량 모델, 평가/압축 에이전트용
  "deepseek-r1:7b"     # 추론 특화, 평가 에이전트용
)

check_container() {
  if ! docker ps --format "{{.Names}}" | grep -q "^${CONTAINER}$"; then
    echo "❌ ${CONTAINER} 컨테이너가 실행 중이 아닙니다."
    echo "   실행: docker compose up -d"
    exit 1
  fi
}

cmd_list() {
  check_container
  echo "📋 설치된 모델 목록:"
  docker exec "$CONTAINER" ollama list
}

cmd_pull() {
  check_container
  echo "📥 모델 다운로드 시작..."
  for model in "${MODELS[@]}"; do
    echo ""
    echo "▶ $model"
    docker exec "$CONTAINER" ollama pull "$model"
  done
  echo ""
  echo "✅ 모든 모델 다운로드 완료"
  cmd_list
}

cmd_pull_one() {
  check_container
  local model=$1
  echo "▶ $model pull 중..."
  docker exec "$CONTAINER" ollama pull "$model"
}

cmd_delete() {
  check_container
  local model=$1
  if [ -z "$model" ]; then
    echo "사용법: $0 delete <모델명>"
    exit 1
  fi
  docker exec "$CONTAINER" ollama rm "$model"
  echo "🗑️  $model 삭제 완료"
}

case "${1:-pull}" in
  pull)
    if [ -n "$2" ]; then
      cmd_pull_one "$2"
    else
      cmd_pull
    fi
    ;;
  list) cmd_list ;;
  delete) cmd_delete "$2" ;;
  *)
    echo "사용법: $0 [pull [모델명] | list | delete <모델명>]"
    echo ""
    echo "예시:"
    echo "  $0 pull              # 기본 모델 전체 설치"
    echo "  $0 pull llama3.1:8b  # 특정 모델만 설치"
    echo "  $0 list              # 설치된 모델 목록"
    echo "  $0 delete gemma4:e2b # 모델 삭제"
    ;;
esac
