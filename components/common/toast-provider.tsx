"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";

import {
  DEFAULT_TOAST_DURATION_MS,
  ERROR_TOAST_DURATION_MS,
} from "@/lib/constants";

type Toast = {
  id: string;
  title: string;
  tone: "error" | "success" | "info";
  durationMs: number;
};

type ToastContextValue = {
  pushToast: (toast: Omit<Toast, "id" | "durationMs"> & { durationMs?: number }) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timeoutIdsRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const timeoutIds = timeoutIdsRef.current;

    return () => {
      timeoutIds.forEach((timeoutId) => {
        window.clearTimeout(timeoutId);
      });
      timeoutIds.clear();
    };
  }, []);

  function dismissToast(toastId: string) {
    const timeoutId = timeoutIdsRef.current.get(toastId);
    if (timeoutId) {
      window.clearTimeout(timeoutId);
      timeoutIdsRef.current.delete(toastId);
    }

    setToasts((current) => current.filter((toast) => toast.id !== toastId));
  }

  const value: ToastContextValue = {
    pushToast(toast) {
      const nextToast: Toast = {
        ...toast,
        id: crypto.randomUUID(),
        durationMs:
          toast.durationMs ??
          (toast.tone === "error"
            ? ERROR_TOAST_DURATION_MS
            : DEFAULT_TOAST_DURATION_MS),
      };

      setToasts((current) => {
        if (toast.tone !== "error") {
          return [...current, nextToast];
        }

        current
          .filter((existingToast) => existingToast.tone === "error")
          .forEach((existingToast) => {
            const timeoutId = timeoutIdsRef.current.get(existingToast.id);
            if (timeoutId) {
              window.clearTimeout(timeoutId);
              timeoutIdsRef.current.delete(existingToast.id);
            }
          });

        return [
          ...current.filter((existingToast) => existingToast.tone !== "error"),
          nextToast,
        ];
      });

      const timeoutId = window.setTimeout(() => {
        dismissToast(nextToast.id);
      }, nextToast.durationMs);

      timeoutIdsRef.current.set(nextToast.id, timeoutId);
    },
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed inset-x-4 bottom-4 z-[60] flex max-w-md flex-col gap-3 sm:left-auto sm:right-4 sm:inset-x-auto">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`rounded-[24px] border px-4 py-3 text-sm font-medium shadow-[0_18px_40px_-28px_rgba(17,17,17,0.35)] ${
              toast.tone === "error"
                ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300"
                : toast.tone === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
                  : "border-amber-200 bg-amber-50 text-stone-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
            }`}
          >
            {toast.title}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error("useToast must be used inside ToastProvider.");
  }

  return context;
}
