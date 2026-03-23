"use client";

import { Button } from "@/components/common/button";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-950 px-4 text-white">
      <div className="max-w-xl rounded-[28px] bg-white/10 p-8 backdrop-blur">
        <p className="text-xs uppercase tracking-[0.28em] text-stone-300">Error state</p>
        <h1 className="mt-3 text-3xl font-semibold">Something went wrong.</h1>
        <p className="mt-3 text-sm text-stone-200">{error.message}</p>
        <Button className="mt-6" onClick={reset}>
          Try again
        </Button>
      </div>
    </div>
  );
}
