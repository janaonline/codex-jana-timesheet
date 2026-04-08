"use client";

import { useEffect, useRef, useState } from "react";

import { saveWithRetry } from "@/lib/autosave";
import { useToast } from "@/components/common/toast-provider";
import { AUTOSAVE_INTERVAL_MS } from "@/lib/constants";

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
  const onSaveRef = useRef(onSave);
  const onSavedRef = useRef(onSaved);
  const storageKeyRef = useRef(storageKey);
  const pushToastRef = useRef(pushToast);
  const lastPersistedSnapshotRef = useRef(JSON.stringify(value));
  const savePromiseRef = useRef<Promise<T> | null>(null);
  const persistCurrentValueRef = useRef<
    (options?: { skipIfUnchanged?: boolean }) => Promise<T | null>
  >(async () => null);

  useEffect(() => {
    latestValueRef.current = value;
  }, [value]);

  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  useEffect(() => {
    onSavedRef.current = onSaved;
  }, [onSaved]);

  useEffect(() => {
    storageKeyRef.current = storageKey;
  }, [storageKey]);

  useEffect(() => {
    pushToastRef.current = pushToast;
  }, [pushToast]);

  useEffect(() => {
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        payload: value,
        updatedAt: new Date().toISOString(),
      }),
    );
  }, [storageKey, value]);

  persistCurrentValueRef.current = async (options = {}) => {
    const { skipIfUnchanged = false } = options;
    const currentSnapshot = JSON.stringify(latestValueRef.current);

    if (skipIfUnchanged && currentSnapshot === lastPersistedSnapshotRef.current) {
      return null;
    }

    if (savePromiseRef.current) {
      return savePromiseRef.current;
    }

    setStatus("saving");

    const savePromise = (async () => {
      try {
        const savedValue = await saveWithRetry(() =>
          onSaveRef.current(latestValueRef.current),
        );
        const savedSnapshot = JSON.stringify(savedValue);
        lastPersistedSnapshotRef.current = savedSnapshot;
        setStatus("saved");
        setLastSavedAt(new Date().toISOString());
        localStorage.setItem(
          storageKeyRef.current,
          JSON.stringify({
            payload: savedValue,
            updatedAt: new Date().toISOString(),
          }),
        );
        onSavedRef.current(savedValue);
        return savedValue;
      } catch (error) {
        setStatus("error");
        pushToastRef.current({
          title:
            error instanceof Error
              ? error.message
              : "Auto-save failed after 3 retries. Your draft is stored locally.",
          tone: "error",
        });
        throw error;
      } finally {
        savePromiseRef.current = null;
      }
    })();

    savePromiseRef.current = savePromise;
    return savePromise;
  };

  useEffect(() => {
    const serialized = JSON.stringify(value);
    if (serialized === lastPersistedSnapshotRef.current) {
      return;
    }

    const timer = window.setTimeout(async () => {
      await persistCurrentValueRef.current({ skipIfUnchanged: true }).catch(
        () => undefined,
      );
    }, 2400);

    return () => window.clearTimeout(timer);
  }, [value]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void persistCurrentValueRef.current({ skipIfUnchanged: true }).catch(
        () => undefined,
      );
    }, AUTOSAVE_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, []);

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
    const savedValue = await persistCurrentValueRef.current();
    if (!savedValue) {
      throw new Error("Unable to save the current draft.");
    }
    return savedValue;
  }

  return {
    status,
    lastSavedAt,
    saveNow,
  };
}
