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
        "inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60",
        variant === "primary" &&
          "bg-teal-700 text-white hover:bg-teal-800 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2",
        variant === "secondary" &&
          "border border-stone-300 bg-white text-stone-900 hover:bg-stone-50",
        variant === "ghost" &&
          "text-stone-700 hover:bg-stone-100",
        variant === "danger" &&
          "bg-rose-700 text-white hover:bg-rose-800",
        className,
      )}
      {...props}
    />
  );
}
