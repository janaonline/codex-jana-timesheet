"use client";

import { cn } from "@/lib/utils";

export function Modal({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-stone-950/40 p-3 sm:items-center sm:p-4">
      <div className="w-full max-w-2xl rounded-[28px] border border-stone-200 bg-white p-5 shadow-2xl sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-stone-900">{title}</h2>
          </div>
          <button
            className={cn(
              "rounded-full border border-stone-200 px-3 py-1 text-sm text-stone-600 hover:bg-stone-100 focus:outline-none focus:ring-2 focus:ring-stone-200 focus:ring-offset-2",
            )}
            onClick={onClose}
          >
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
