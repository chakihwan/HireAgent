"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "홈" },
  { href: "/generate", label: "자소서 생성" },
  { href: "/library", label: "라이브러리" },
  { href: "/projects", label: "내 데이터" },
  { href: "/jobs", label: "지원 관리" },
  { href: "/models", label: "🤖 모델 & API" },
];

export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-5 h-14">
      {NAV.map((n) => {
        // "/"는 정확히 일치할 때만 active (모든 경로가 "/"로 시작하므로)
        const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            className={`relative flex items-center h-full text-sm transition-colors ${
              active ? "text-primary font-semibold" : "text-zinc-500 hover:text-zinc-900"
            }`}
          >
            {n.label}
            {active && (
              <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary rounded-full" />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
