import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

type MetricPayload = {
  name: string;
  value: number;
  unit?: string;
  tags?: Record<string, string>;
};

async function publishToWebhook(event: Record<string, unknown>) {
  if (!env.observabilityWebhookUrl) {
    return;
  }

  try {
    await fetch(env.observabilityWebhookUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(event),
    });
  } catch (error) {
    logger.warn("Observability webhook delivery failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function captureError(
  source: string,
  error: unknown,
  context?: Record<string, unknown>,
) {
  const message = error instanceof Error ? error.message : String(error);
  logger.error(source, { ...context, error: message });

  await publishToWebhook({
    type: "error",
    source,
    context,
    message,
    timestamp: new Date().toISOString(),
  });
}

export async function recordMetric(payload: MetricPayload) {
  logger.info(`metric:${payload.name}`, payload);

  await publishToWebhook({
    type: "metric",
    payload,
    timestamp: new Date().toISOString(),
  });
}
