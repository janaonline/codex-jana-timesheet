export function PieChart({
  data,
}: {
  data: Array<{
    projectName: string;
    hours: number;
    percentage: number;
  }>;
}) {
  if (!data.length) {
    return (
      <div className="rounded-[24px] bg-(--color-surface-raised) p-6 text-sm text-(--color-text-muted)">
        No project allocations recorded yet.
      </div>
    );
  }

  const colors = ["#0f766e", "#f59e0b", "#2563eb", "#f97316", "#dc2626"];
  const segments = data.reduce<string[]>((accumulator, item, index) => {
    const start = data
      .slice(0, index)
      .reduce((sum, currentItem) => sum + currentItem.percentage, 0);
    const end = start + item.percentage;
    accumulator.push(`${colors[index % colors.length]} ${start}% ${end}%`);
    return accumulator;
  }, []);

  return (
    <div className="grid gap-6 lg:grid-cols-[220px_1fr] lg:items-center">
      <div
        className="mx-auto h-52 w-52 rounded-full border border-white/70 shadow-inner dark:border-stone-900/70"
        style={{
          background: `conic-gradient(${segments.join(", ")})`,
        }}
      />
      <div className="space-y-3">
        {data.map((item) => (
          <div
            key={item.projectName}
            className="flex items-center justify-between rounded-2xl bg-(--color-surface-raised) px-4 py-3 text-sm"
          >
            <span className="font-medium text-(--color-text)">{item.projectName}</span>
            <span className="text-(--color-text-muted)">
              {item.hours}h ({item.percentage}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
