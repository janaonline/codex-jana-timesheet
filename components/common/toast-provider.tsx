"use client";

import { createContext, useContext, useEffect, useState } from "react";

type Toast = {
  id: string;
  title: string;
  tone: "error" | "success" | "info";
};

type ToastContextValue = {
  pushToast: (toast: Omit<Toast, "id">) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    if (!toasts.length) {
      return;
    }

    const timer = window.setTimeout(() => {
      setToasts((current) => current.slice(1));
    }, 4000);

    return () => window.clearTimeout(timer);
  }, [toasts]);

  const value: ToastContextValue = {
    pushToast(toast) {
      setToasts((current) => [
        ...current,
        {
          ...toast,
          id: crypto.randomUUID(),
        },
      ]);
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
                ? "border-rose-200 bg-rose-50 text-rose-700"
                : toast.tone === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-amber-200 bg-amber-50 text-stone-800"
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
