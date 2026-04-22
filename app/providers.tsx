"use client";

import { GlobalLoaderProvider } from "@/components/common/global-loader-provider";
import { ThemeProvider } from "@/components/common/theme-provider";
import { ToastProvider } from "@/components/common/toast-provider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <ToastProvider>
        <GlobalLoaderProvider>{children}</GlobalLoaderProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
