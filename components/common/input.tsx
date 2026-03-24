import { cn } from "@/lib/utils";

type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export function Input({ className, ...props }: InputProps) {
  return (
    <input
      className={cn(
        "w-full rounded-3xl border border-stone-300 bg-white px-4 py-3 text-sm text-stone-950 outline-none transition placeholder:text-stone-400 focus:border-amber-300 focus:ring-4 focus:ring-amber-100",
        className,
      )}
      {...props}
    />
  );
}
