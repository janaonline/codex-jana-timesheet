import { cn } from "@/lib/utils";

export function Card({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "rounded-[28px] border border-(--color-border) bg-(--color-surface) p-5 shadow-[0_12px_40px_-28px_rgba(17,17,17,0.18)] sm:p-6",
        className,
      )}
    >
      {children}
    </section>
  );
}
