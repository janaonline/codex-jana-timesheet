import { cn } from "@/lib/utils";

const STATUS_CLASS_MAP: Record<string, string> = {
  DRAFT: "bg-stone-100 text-stone-700",
  SUBMITTED: "bg-emerald-100 text-emerald-700",
  AUTO_SUBMITTED: "bg-sky-100 text-sky-700",
  FROZEN: "bg-stone-200 text-stone-800",
  EDIT_REQUESTED: "bg-amber-100 text-amber-700",
  EDIT_APPROVED: "bg-teal-100 text-teal-700",
  REJECTED: "bg-rose-100 text-rose-700",
  RESUBMITTED: "bg-indigo-100 text-indigo-700",
};

export function Badge({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em]",
        tone ? STATUS_CLASS_MAP[tone] ?? "bg-stone-100 text-stone-700" : "bg-stone-100 text-stone-700",
      )}
    >
      {children}
    </span>
  );
}
