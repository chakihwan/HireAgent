"use client";

import { useEffect, useState } from "react";
import { ThemeProvider } from "next-themes";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { useSettingsStore } from "@/lib/settings-store";

export function Providers({ children }: { children: React.ReactNode }) {
  // skipHydration 설정한 settings store를 mount 후 rehydrate (SSR mismatch 방지)
  useEffect(() => {
    useSettingsStore.persist.rehydrate();
  }, []);

  // QueryClient를 컴포넌트 인스턴스당 1회 생성 (SSR 안전)
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,       // 30초간 fresh — 페이지 전환 시 불필요한 재요청 방지
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      }),
  );

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <QueryClientProvider client={queryClient}>
        {children}
        <Toaster position="top-center" richColors closeButton />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
