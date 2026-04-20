"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname } from "next/navigation";

import { useToast } from "@/components/common/toast-provider";
import {
  GLOBAL_LOADER_TIMINGS,
  getHideDelayMs,
  selectDominantLoaderRequest,
  type GlobalLoaderMode,
  type GlobalLoaderRequest,
  type GlobalLoaderSource,
} from "@/lib/global-loader-state";

type GlobalLoaderContextValue = {
  showBlockingLoader: (message?: string, source?: GlobalLoaderSource) => string;
  showNonBlockingLoader: (message?: string, source?: GlobalLoaderSource) => string;
  hideLoader: (token: string) => void;
  runWithLoader: <T>(params: {
    mode: GlobalLoaderMode;
    message?: string;
    source?: GlobalLoaderSource;
    operation: () => Promise<T>;
  }) => Promise<T>;
  beginRouteTransition: (message?: string, mode?: GlobalLoaderMode) => string;
};

const GlobalLoaderContext = createContext<GlobalLoaderContextValue | null>(null);

function LoaderRing() {
  return (
    <span className="inline-flex h-11 w-11 items-center justify-center rounded-full border-2 border-stone-300/80 border-t-amber-300 animate-spin" />
  );
}

export function GlobalLoaderProvider({ children }: { children: React.ReactNode }) {
  const { pushToast } = useToast();
  const pathname = usePathname();
  const [requests, setRequests] = useState<GlobalLoaderRequest[]>([]);
  const [visibleRequest, setVisibleRequest] = useState<GlobalLoaderRequest | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const visibleSinceRef = useRef<number | null>(null);
  const showTimerRef = useRef<number | null>(null);
  const hideTimerRef = useRef<number | null>(null);
  const dominantRequest = useMemo(
    () => selectDominantLoaderRequest(requests),
    [requests],
  );
  const dominantRequestRef = useRef<GlobalLoaderRequest | null>(dominantRequest);

  useEffect(() => {
    dominantRequestRef.current = dominantRequest;
  }, [dominantRequest]);

  const clearShowTimer = useCallback(() => {
    if (showTimerRef.current !== null) {
      window.clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
  }, []);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      clearShowTimer();
      clearHideTimer();
    };
  }, [clearHideTimer, clearShowTimer]);

  useEffect(() => {
    setRequests((current) => current.filter((request) => request.source !== "route"));
  }, [pathname]);

  useEffect(() => {
    if (dominantRequest?.mode === "blocking") {
      setIsMinimized(false);
    }

    if (!dominantRequest) {
      clearShowTimer();

      if (!visibleRequest) {
        return;
      }

      clearHideTimer();
      hideTimerRef.current = window.setTimeout(() => {
        visibleSinceRef.current = null;
        setVisibleRequest(null);
        setIsMinimized(false);
      }, getHideDelayMs(visibleSinceRef.current));
      return;
    }

    clearHideTimer();

    if (visibleRequest) {
      if (
        visibleRequest.token !== dominantRequest.token ||
        visibleRequest.mode !== dominantRequest.mode ||
        visibleRequest.message !== dominantRequest.message
      ) {
        setVisibleRequest(dominantRequest);
      }
      return;
    }

    clearShowTimer();
    showTimerRef.current = window.setTimeout(() => {
      const nextRequest = dominantRequestRef.current;
      if (!nextRequest) {
        return;
      }

      visibleSinceRef.current = Date.now();
      setVisibleRequest(nextRequest);
    }, GLOBAL_LOADER_TIMINGS.showDelayMs);
  }, [clearHideTimer, clearShowTimer, dominantRequest, visibleRequest]);

  const showLoader = useCallback(
    (mode: GlobalLoaderMode, message?: string, source: GlobalLoaderSource = "mutation") => {
      const token = crypto.randomUUID();
      setRequests((current) => [
        ...current,
        {
          token,
          mode,
          message,
          source,
          startedAt: Date.now(),
        },
      ]);
      return token;
    },
    [],
  );

  const hideLoader = useCallback((token: string) => {
    setRequests((current) => current.filter((request) => request.token !== token));
  }, []);

  const showBlockingLoader = useCallback(
    (message?: string, source?: GlobalLoaderSource) =>
      showLoader("blocking", message, source),
    [showLoader],
  );

  const showNonBlockingLoader = useCallback(
    (message?: string, source?: GlobalLoaderSource) =>
      showLoader("non-blocking", message, source),
    [showLoader],
  );

  const runWithLoader = useCallback(
    async <T,>({
      mode,
      message,
      source = "mutation",
      operation,
    }: {
      mode: GlobalLoaderMode;
      message?: string;
      source?: GlobalLoaderSource;
      operation: () => Promise<T>;
    }) => {
      const token =
        mode === "blocking"
          ? showBlockingLoader(message, source)
          : showNonBlockingLoader(message, source);

      try {
        return await operation();
      } finally {
        hideLoader(token);
      }
    },
    [hideLoader, showBlockingLoader, showNonBlockingLoader],
  );

  const beginRouteTransition = useCallback(
    (message?: string, mode: GlobalLoaderMode = "blocking") =>
      mode === "blocking"
        ? showBlockingLoader(message, "route")
        : showNonBlockingLoader(message, "route"),
    [showBlockingLoader, showNonBlockingLoader],
  );

  const value = useMemo<GlobalLoaderContextValue>(
    () => ({
      showBlockingLoader,
      showNonBlockingLoader,
      hideLoader,
      runWithLoader,
      beginRouteTransition,
    }),
    [
      beginRouteTransition,
      hideLoader,
      runWithLoader,
      showBlockingLoader,
      showNonBlockingLoader,
    ],
  );

  const isVisible =
    Boolean(visibleRequest) &&
    !(visibleRequest?.mode === "non-blocking" && isMinimized);
  const actionText = visibleRequest?.message?.trim() ?? "";

  function minimizeNonBlockingLoader() {
    if (!visibleRequest || visibleRequest.mode !== "non-blocking") {
      return;
    }

    setIsMinimized(true);
    pushToast({
      title: "Process minimized. It will keep running in the background.",
      tone: "info",
    });
  }

  return (
    <GlobalLoaderContext.Provider value={value}>
      {children}
      {isVisible && visibleRequest?.mode === "blocking" ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-stone-950/20 px-4 backdrop-blur-[2px]">
          <div className="w-full max-w-sm rounded-[32px] border border-[color:var(--line)] bg-[color:var(--background)]/98 px-6 py-6 text-[color:var(--foreground)] shadow-[0_28px_80px_-40px_rgba(17,17,17,0.55)]">
            <div className="flex items-center gap-4">
              <LoaderRing />
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                  Please wait...
                </p>
                {actionText ? (
                  <p className="mt-2 text-sm font-medium text-stone-700">{actionText}</p>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {isVisible && visibleRequest?.mode === "non-blocking" ? (
        <div className="fixed inset-x-4 top-4 z-[70] sm:left-auto sm:right-4 sm:w-full sm:max-w-sm">
          <div className="rounded-[28px] border border-[color:var(--line)] bg-[color:var(--background)]/96 px-4 py-4 text-[color:var(--foreground)] shadow-[0_18px_40px_-28px_rgba(17,17,17,0.35)] backdrop-blur">
            <div className="flex items-start gap-4">
              <LoaderRing />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-stone-500">
                  Please wait...
                </p>
                {actionText ? (
                  <p className="mt-2 text-sm font-medium text-stone-700">{actionText}</p>
                ) : null}
              </div>
              <button
                type="button"
                className="rounded-full border border-stone-200 px-3 py-1 text-xs font-semibold text-stone-600 transition hover:bg-stone-100 focus:outline-none focus:ring-2 focus:ring-stone-200 focus:ring-offset-2"
                onClick={minimizeNonBlockingLoader}
              >
                Minimize
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </GlobalLoaderContext.Provider>
  );
}

export function useGlobalLoader() {
  const context = useContext(GlobalLoaderContext);

  if (!context) {
    throw new Error("useGlobalLoader must be used inside GlobalLoaderProvider.");
  }

  return context;
}
