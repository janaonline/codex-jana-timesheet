import { env } from "@/lib/env";
import { startScheduler } from "@/services/scheduler-service";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && env.enableScheduler) {
    startScheduler();
  }
}
