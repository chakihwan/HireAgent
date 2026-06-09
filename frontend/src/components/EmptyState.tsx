import Link from "next/link";
import { Button } from "@/components/ui/button";

type EmptyStateAction = {
  label: string;
  href?: string;
  onClick?: () => void;
};

type EmptyStateProps = {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: EmptyStateAction;
};

/** 빈 목록·결과 없음을 위한 공용 빈 상태. 아이콘 + 안내 + CTA로 다음 행동을 유도한다. */
export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
      {icon && (
        <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-400">
          {icon}
        </div>
      )}
      <h3 className="text-sm font-semibold text-zinc-700">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-zinc-400">{description}</p>
      )}
      {action && (
        <div className="mt-5">
          {action.href ? (
            <Link href={action.href}>
              <Button size="sm">{action.label}</Button>
            </Link>
          ) : (
            <Button size="sm" onClick={action.onClick}>{action.label}</Button>
          )}
        </div>
      )}
    </div>
  );
}
