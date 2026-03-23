"use client";

import { useEffect, useRef, useState } from "react";

import { AUTOSAVE_RETRY_DELAYS_MS } from "@/lib/constants";
import { sleep } from "@/lib/utils";
import { useToast } from "@/components/common/toast-provider";

export async function saveWithRetry<T>(
  operation: () => Promise<T>,
  delays: ReadonlyArray<number> = [...AUTOSAVE_RETRY_DELAYS_MS],
) {
  let lastError: unknown;

  for (let index = 0; index < delays.length; index += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (index === delays.length - 1) {
        break;
      }
      await sleep(delays[index]);
    }
  }

  throw lastError;
}

export function useAutosave<T>({
  storageKey,
  value,
  onSave,
  onSaved,
}: {
  storageKey: string;
  value: T;
  onSave: (value: T) => Promise<T>;
  onSaved: (value: T) => void;
}) {
  const { pushToast } = useToast();
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const latestValueRef = useRef(value);
  const lastPersistedSnapshotRef = useRef(JSON.stringify(value));

  useEffect(() => {
    latestValueRef.current = value;
  }, [value]);

  useEffect(() => {
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        payload: value,
        updatedAt: new Date().toISOString(),
      }),
    );
  }, [storageKey, value]);

  useEffect(() => {
    const serialized = JSON.stringify(value);
    if (serialized === lastPersistedSnapshotRef.current) {
      return;
    }

    const timer = window.setTimeout(async () => {
      setStatus("saving");

      try {
        const savedValue = await saveWithRetry(() => onSave(latestValueRef.current));
        const savedSnapshot = JSON.stringify(savedValue);
        lastPersistedSnapshotRef.current = savedSnapshot;
        setStatus("saved");
        setLastSavedAt(new Date().toISOString());
        localStorage.setItem(
          storageKey,
          JSON.stringify({
            payload: savedValue,
            updatedAt: new Date().toISOString(),
          }),
        );
        onSaved(savedValue);
      } catch (error) {
        setStatus("error");
        pushToast({
          title:
            error instanceof Error
              ? error.message
              : "Auto-save failed after 3 retries. Your draft is stored locally.",
          tone: "error",
        });
      }
    }, 2400);

    return () => window.clearTimeout(timer);
  }, [onSave, onSaved, pushToast, storageKey, value]);

  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (JSON.stringify(latestValueRef.current) !== lastPersistedSnapshotRef.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  async function saveNow() {
    setStatus("saving");
    const savedValue = await saveWithRetry(() => onSave(latestValueRef.current));
    lastPersistedSnapshotRef.current = JSON.stringify(savedValue);
    setStatus("saved");
    setLastSavedAt(new Date().toISOString());
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        payload: savedValue,
        updatedAt: new Date().toISOString(),
      }),
    );
    onSaved(savedValue);
    return savedValue;
  }

  return {
    status,
    lastSavedAt,
    saveNow,
  };
}
