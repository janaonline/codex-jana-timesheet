import { after } from "next/server";

import { captureError } from "@/lib/observability";

export function runAfterResponse(
  taskName: string,
  task: () => Promise<void>,
) {
  after(async () => {
    try {
      await task();
    } catch (error) {
      await captureError(`${taskName}_failed`, error);
    }
  });
}
