import cron from "node-cron";

import { logger } from "@/lib/logger";
import { captureError } from "@/lib/observability";
import { runDailyAutomation } from "@/services/job-service";

let schedulerStarted = false;

export function startScheduler() {
  if (schedulerStarted) {
    return;
  }

  schedulerStarted = true;

  cron.schedule(
    "0 0 * * *",
    async () => {
      try {
        await runDailyAutomation(new Date());
        logger.info("Daily scheduler run completed");
      } catch (error) {
        await captureError("daily_scheduler_failed", error);
      }
    },
    {
      timezone: "Asia/Kolkata",
    },
  );

  logger.info("Daily IST scheduler started");
}
