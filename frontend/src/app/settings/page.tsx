import { redirect } from "next/navigation";

// /settings는 /models("모델 & API")로 통합됨 (ADR 메뉴 정리, v0.7.7).
// - 에이전트별 모델 선택 → /generate 워크플로우 노드
// - 클라우드 API 키 / Ollama 다운로드 → /models
export default function SettingsPage() {
  redirect("/models");
}
