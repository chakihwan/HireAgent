import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import Link from "next/link";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { NavLinks } from "@/components/NavLinks";

// 한국어 본문 폰트 — Pretendard Variable (self-host). globals.css의 --font-sans에 연결
const pretendard = localFont({
  src: "./fonts/PretendardVariable.woff2",
  variable: "--font-sans",
  display: "swap",
  weight: "45 920",
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
      className={`${pretendard.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-zinc-50">
        <header className="border-b border-zinc-200 bg-white">
          <div className="mx-auto max-w-4xl px-6 h-14 flex items-center justify-between">
            <Link href="/" className="text-base font-semibold text-zinc-900 hover:text-zinc-700 transition-colors">
              HireAgent
            </Link>
            <NavLinks />
          </div>
        </header>
        <main className="flex-1">
          <Providers>{children}</Providers>
        </main>
      </body>
    </html>
  );
}
