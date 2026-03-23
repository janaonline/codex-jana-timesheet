export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-950 text-white">
      <div className="text-center">
        <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-white/20 border-t-white" />
        <p className="mt-4 text-sm uppercase tracking-[0.24em] text-stone-300">
          Loading portal
        </p>
      </div>
    </div>
  );
}
