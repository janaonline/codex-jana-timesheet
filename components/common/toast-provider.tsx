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
      <div className="fixed bottom-4 right-4 z-[60] flex max-w-sm flex-col gap-3">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`rounded-2xl px-4 py-3 text-sm font-medium shadow-lg ${
              toast.tone === "error"
                ? "bg-rose-600 text-white"
                : toast.tone === "success"
                  ? "bg-emerald-600 text-white"
                  : "bg-stone-900 text-white"
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
