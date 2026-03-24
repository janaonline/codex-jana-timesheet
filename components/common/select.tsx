import { cn } from "@/lib/utils";

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

export function Select({ className, children, ...props }: SelectProps) {
  return (
    <select
      className={cn(
        "w-full rounded-3xl border border-stone-300 bg-white px-4 py-3 text-sm text-stone-950 outline-none transition focus:border-amber-300 focus:ring-4 focus:ring-amber-100",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}
