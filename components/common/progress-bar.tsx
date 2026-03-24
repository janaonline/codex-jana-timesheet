import { cn } from "@/lib/utils";

export function ProgressBar({
  value,
  label,
}: {
  value: number;
  label?: string;
}) {
  const clamped = Math.max(0, Math.min(value, 100));
  const tone =
    clamped >= 100 ? "bg-emerald-500" : clamped >= 80 ? "bg-amber-400" : "bg-stone-900";

  return (
    <div className="space-y-2">
      {label ? <p className="text-sm font-medium text-stone-600">{label}</p> : null}
      <div className="h-3 w-full overflow-hidden rounded-full bg-stone-200">
        <div
          className={cn("h-full rounded-full transition-all", tone)}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}
