import { cn } from "@/lib/utils";

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

export function Select({ className, children, ...props }: SelectProps) {
  return (
    <select
      className={cn(
        "w-full rounded-3xl border border-(--color-border-strong) bg-(--color-surface) px-4 py-3 text-sm text-(--color-text) outline-none transition focus:border-(--color-primary) focus:ring-4 focus:ring-(--color-primary-ring)",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}
