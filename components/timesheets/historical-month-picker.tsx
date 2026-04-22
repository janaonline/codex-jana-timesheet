"use client";

import { startTransition, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/common/button";
import { Input } from "@/components/common/input";
import { useGlobalLoader } from "@/components/common/global-loader-provider";

export function HistoricalMonthPicker({
  defaultMonthKey,
  maxMonthKey,
}: {
  defaultMonthKey: string;
  maxMonthKey: string;
}) {
  const router = useRouter();
  const { beginRouteTransition } = useGlobalLoader();
  const [monthKey, setMonthKey] = useState(defaultMonthKey);

  function openMonth() {
    if (!monthKey) {
      return;
    }

    beginRouteTransition("Loading selected month...");
    startTransition(() => {
      router.push(`/timesheets/month/${monthKey}`);
    });
  }

  return (
    <div className="rounded-[28px] border border-(--color-border) bg-(--color-surface-raised) p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-(--color-text-muted)">
        Open Any Past Month
      </p>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row">
        <Input
          type="month"
          value={monthKey}
          max={maxMonthKey}
          onChange={(event) => setMonthKey(event.target.value)}
        />
        <Button className="w-full sm:w-auto" variant="secondary" onClick={openMonth}>
          Open month
        </Button>
      </div>
    </div>
  );
}
