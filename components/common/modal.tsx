"use client";

import { cn } from "@/lib/utils";

export function Modal({
  open,
  title,
  children,
  onClose,
  hideCloseButton = false,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  hideCloseButton?: boolean;
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-(--color-overlay) p-3 sm:items-center sm:p-4">
      <div className="w-full max-w-2xl rounded-[28px] border border-(--color-border) bg-(--color-surface) p-5 shadow-2xl sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-(--color-text)">{title}</h2>
          </div>
          {hideCloseButton ? null : (
            <button
              className={cn(
                "rounded-full border border-(--color-border) px-3 py-1 text-sm text-(--color-text-muted) hover:bg-(--color-surface-raised) focus:outline-none focus:ring-2 focus:ring-(--color-border) focus:ring-offset-2 focus:ring-offset-(--color-surface)",
              )}
              onClick={onClose}
            >
              Close
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}
