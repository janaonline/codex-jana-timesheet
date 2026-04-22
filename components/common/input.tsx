import { cn } from "@/lib/utils";

type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export function Input({ className, ...props }: InputProps) {
  return (
    <input
      className={cn(
        "w-full rounded-3xl border border-(--color-border-strong) bg-(--color-surface) px-4 py-3 text-sm text-(--color-text) outline-none transition placeholder:text-(--color-text-placeholder) focus:border-(--color-primary) focus:ring-4 focus:ring-(--color-primary-ring)",
        className,
      )}
      {...props}
    />
  );
}
