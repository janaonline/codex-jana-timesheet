import { cn } from "@/lib/utils";

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export function Textarea({ className, ...props }: TextareaProps) {
  return (
    <textarea
      className={cn(
        "w-full rounded-3xl border border-(--color-border-strong) bg-(--color-surface) px-4 py-3 text-sm text-(--color-text) outline-none transition placeholder:text-(--color-text-placeholder) focus:border-(--color-primary) focus:ring-4 focus:ring-(--color-primary-ring)",
        className,
      )}
      {...props}
    />
  );
}
