export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[color:var(--background)] px-4 text-[color:var(--foreground)]">
      <div className="w-full max-w-sm rounded-[32px] border border-[color:var(--line)] bg-[color:var(--background)] px-6 py-6 shadow-[0_28px_80px_-40px_rgba(17,17,17,0.55)]">
        <div className="flex items-center gap-4">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-full border-2 border-stone-300/80 border-t-amber-300 animate-spin" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
              Please wait...
            </p>
            <p className="mt-2 text-sm font-medium text-stone-700">Loading portal...</p>
          </div>
        </div>
      </div>
    </div>
  );
}
