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
          "bg-amber-300 text-stone-950 hover:bg-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-300 focus:ring-offset-2",
        variant === "secondary" &&
          "border border-stone-300 bg-white text-stone-900 hover:border-stone-400 hover:bg-stone-100 focus:outline-none focus:ring-2 focus:ring-stone-200 focus:ring-offset-2",
        variant === "ghost" &&
          "text-stone-700 hover:bg-stone-100 focus:outline-none focus:ring-2 focus:ring-stone-200 focus:ring-offset-2",
        variant === "danger" &&
          "bg-stone-950 text-white hover:bg-black focus:outline-none focus:ring-2 focus:ring-stone-300 focus:ring-offset-2",
        className,
      )}
      {...props}
    />
  );
}
