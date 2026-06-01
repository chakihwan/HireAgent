import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "HireAgent",
  description: "AI 자소서 생성 멀티에이전트",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-zinc-50">
        <header className="border-b border-zinc-200 bg-white">
          <div className="mx-auto max-w-4xl px-6 h-14 flex items-center justify-between">
            <Link href="/" className="text-base font-semibold text-zinc-900 hover:text-zinc-700 transition-colors">
              HireAgent
            </Link>
            <nav className="flex items-center gap-4">
              <Link href="/" className="text-sm text-zinc-600 hover:text-zinc-900 transition-colors">
                홈
              </Link>
              <Link href="/generate" className="text-sm text-zinc-600 hover:text-zinc-900 transition-colors">
                자소서 생성
              </Link>
              <Link href="/library" className="text-sm text-zinc-600 hover:text-zinc-900 transition-colors">
                라이브러리
              </Link>
              <Link href="/projects" className="text-sm text-zinc-600 hover:text-zinc-900 transition-colors">
                내 데이터
              </Link>
              <Link href="/jobs" className="text-sm text-zinc-600 hover:text-zinc-900 transition-colors">
                지원 관리
              </Link>
              <Link href="/models" className="text-sm text-zinc-600 hover:text-zinc-900 transition-colors flex items-center gap-1">
                🤖 모델 & API
              </Link>
            </nav>
          </div>
        </header>
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
