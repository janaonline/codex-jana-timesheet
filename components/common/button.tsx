import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
};

export function Button({
  className,
  variant = "primary",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex min-h-11 items-center justify-center rounded-full px-5 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60",
        variant === "primary" &&
          "bg-(--color-primary) text-stone-950 hover:bg-(--color-primary-hover) focus:outline-none focus:ring-2 focus:ring-(--color-primary) focus:ring-offset-2 focus:ring-offset-(--color-surface)",
        variant === "secondary" &&
          "border border-(--color-border-strong) bg-(--color-surface) text-(--color-text-subtle) hover:border-(--color-border-strong) hover:bg-(--color-surface-raised) focus:outline-none focus:ring-2 focus:ring-(--color-border) focus:ring-offset-2 focus:ring-offset-(--color-surface)",
        variant === "ghost" &&
          "text-(--color-text-subtle) hover:bg-(--color-surface-raised) focus:outline-none focus:ring-2 focus:ring-(--color-border) focus:ring-offset-2 focus:ring-offset-(--color-surface)",
        variant === "danger" &&
          "bg-(--color-text) text-(--color-surface) hover:opacity-85 focus:outline-none focus:ring-2 focus:ring-(--color-border-strong) focus:ring-offset-2 focus:ring-offset-(--color-surface)",
        className,
      )}
      {...props}
    />
  );
}
