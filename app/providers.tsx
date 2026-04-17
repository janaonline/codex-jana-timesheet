"use client";

import { GlobalLoaderProvider } from "@/components/common/global-loader-provider";
import { ToastProvider } from "@/components/common/toast-provider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <GlobalLoaderProvider>{children}</GlobalLoaderProvider>
    </ToastProvider>
  );
}
