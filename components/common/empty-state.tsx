export function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-[24px] border border-dashed border-(--color-border-strong) bg-(--color-surface-raised) p-8 text-center">
      <h3 className="text-lg font-semibold text-(--color-text)">{title}</h3>
      <p className="mt-2 text-sm text-(--color-text-muted)">{description}</p>
    </div>
  );
}
