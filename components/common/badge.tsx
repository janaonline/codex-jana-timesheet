import { cn } from "@/lib/utils";

const STATUS_CLASS_MAP: Record<string, string> = {
  DRAFT:          "bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300",
  SUBMITTED:      "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  AUTO_SUBMITTED: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300",
  FROZEN:         "bg-stone-200 text-stone-800 dark:bg-stone-700 dark:text-stone-200",
  EDIT_REQUESTED: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  EDIT_APPROVED:  "bg-lime-100 text-lime-800 dark:bg-lime-950 dark:text-lime-300",
  REJECTED:       "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300",
  RESUBMITTED:    "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
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
        tone
          ? (STATUS_CLASS_MAP[tone] ?? "bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300")
          : "bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300",
      )}
    >
      {children}
    </span>
  );
}
