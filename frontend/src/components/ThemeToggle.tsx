"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";

// 라이트/다크 전환 버튼. next-themes는 SSR 시 테마를 모르므로
// mounted 전에는 아이콘을 숨겨 hydration mismatch를 피한다.
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // mounted 전에는 false 고정 — 서버는 테마를 모르므로(undefined) 클라 첫 렌더와 맞춰
  // aria-label·onClick의 hydration mismatch를 방지 (mount 후 정확한 값으로 전환)
  const isDark = mounted && resolvedTheme === "dark";

  return (
    <button
      type="button"
      aria-label={isDark ? "라이트 모드로 전환" : "다크 모드로 전환"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
    >
      {mounted ? (
        isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />
      ) : (
        // mount 전 자리 유지 (레이아웃 흔들림 방지)
        <Moon className="h-4 w-4 opacity-0" />
      )}
    </button>
  );
}
