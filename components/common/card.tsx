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
        "rounded-[28px] border border-stone-200 bg-white/90 p-6 shadow-[0_20px_50px_-40px_rgba(15,23,42,0.35)] backdrop-blur",
        className,
      )}
    >
      {children}
    </section>
  );
}
