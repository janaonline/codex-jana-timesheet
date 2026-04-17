"use client";

import { useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";

import { useGlobalLoader } from "@/components/common/global-loader-provider";
import type { GlobalLoaderMode } from "@/lib/global-loader-state";

export function GlobalLoaderFormStatus({
  mode = "blocking",
  message,
}: {
  mode?: GlobalLoaderMode;
  message?: string;
}) {
  const { pending } = useFormStatus();
  const {
    hideLoader,
    showBlockingLoader,
    showNonBlockingLoader,
  } = useGlobalLoader();
  const tokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (pending && !tokenRef.current) {
      tokenRef.current =
        mode === "blocking"
          ? showBlockingLoader(message, "form")
          : showNonBlockingLoader(message, "form");
      return;
    }

    if (!pending && tokenRef.current) {
      hideLoader(tokenRef.current);
      tokenRef.current = null;
    }
  }, [
    hideLoader,
    message,
    mode,
    pending,
    showBlockingLoader,
    showNonBlockingLoader,
  ]);

  useEffect(() => {
    return () => {
      if (tokenRef.current) {
        hideLoader(tokenRef.current);
      }
    };
  }, [hideLoader]);

  return null;
}
