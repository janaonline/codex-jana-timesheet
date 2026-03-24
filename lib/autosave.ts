import { AUTOSAVE_RETRY_DELAYS_MS } from "@/lib/constants";
import { sleep } from "@/lib/utils";

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
