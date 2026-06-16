import { cn } from "@/lib/utils";

// 로딩 자리표시 — bg-muted 토큰이라 라이트/다크 자동 대응
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  );
}

export { Skeleton };
