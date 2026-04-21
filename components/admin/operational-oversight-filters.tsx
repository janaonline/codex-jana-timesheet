"use client";

import { startTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Select } from "@/components/common/select";
import { useGlobalLoader } from "@/components/common/global-loader-provider";
import {
  EDIT_REQUEST_METRIC_FILTERS,
  type EditRequestMetricFilter,
} from "@/lib/constants";
import { getOperationalOversightNextLocation } from "@/lib/operational-oversight-filters";

function filterLabel(filter: EditRequestMetricFilter) {
  return filter === "ALL"
    ? "All edit requests"
    : `${filter.slice(0, 1)}${filter.slice(1).toLowerCase()} edit requests`;
}

export function OperationalOversightFilters({
  availableMonths,
  selectedMonthKey,
  selectedEditRequestStatus,
}: {
  availableMonths: Array<{ monthKey: string; monthLabel: string }>;
  selectedMonthKey: string | null;
  selectedEditRequestStatus: EditRequestMetricFilter;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { beginRouteTransition } = useGlobalLoader();

  function updateFilters(next: {
    monthKey?: string | null;
    editRequestStatus?: EditRequestMetricFilter;
  }) {
    const nextLocation = getOperationalOversightNextLocation({
      pathname,
      currentSearch: searchParams.toString(),
      selectedMonthKey,
      selectedEditRequestStatus,
      next,
    });

    if (!nextLocation) {
      return;
    }

    beginRouteTransition("Refreshing oversight metrics...");
    startTransition(() => {
      router.replace(nextLocation);
    });
  }

  return (
    <div className="grid gap-4 rounded-[28px] border border-stone-200 bg-stone-50 p-4 lg:grid-cols-2">
      <label className="text-sm text-stone-700">
        Oversight scope
        <Select
          className="mt-2 bg-white"
          value={selectedMonthKey ?? ""}
          onChange={(event) =>
            updateFilters({
              monthKey: event.target.value || null,
            })
          }
        >
          <option value="">Overall</option>
          {availableMonths.map((month) => (
            <option key={month.monthKey} value={month.monthKey}>
              {month.monthLabel}
            </option>
          ))}
        </Select>
      </label>

      <label className="text-sm text-stone-700">
        Edit request metric
        <Select
          className="mt-2 bg-white"
          value={selectedEditRequestStatus}
          onChange={(event) =>
            updateFilters({
              editRequestStatus: event.target.value as EditRequestMetricFilter,
            })
          }
        >
          {EDIT_REQUEST_METRIC_FILTERS.map((filter) => (
            <option key={filter} value={filter}>
              {filterLabel(filter)}
            </option>
          ))}
        </Select>
      </label>
    </div>
  );
}
