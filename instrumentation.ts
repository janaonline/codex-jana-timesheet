import { env } from "@/lib/env";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && env.enableScheduler) {
    const { startScheduler } = await import("@/services/scheduler-service");
    startScheduler();
  }
}
