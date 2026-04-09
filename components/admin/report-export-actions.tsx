"use client";

import { Button } from "@/components/common/button";
import { useToast } from "@/components/common/toast-provider";
import {
  createApiClientError,
  handleUnauthorizedApiClientError,
} from "@/lib/client-api";

export function ReportExportActions({
  type,
  monthKey,
}: {
  type: "compliance" | "hours-utilization" | "edit-requests";
  monthKey?: string;
}) {
  const { pushToast } = useToast();

  async function download(format: "pdf" | "csv") {
    try {
      const response = await fetch("/api/v1/reports/export", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ type, format, monthKey }),
      });

      if (!response.ok) {
        throw await createApiClientError(response, "Export failed.");
      }

      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition");
      const filename =
        disposition?.match(/filename="(.+)"/)?.[1] ??
        `${type}.${format === "pdf" ? "pdf" : "csv"}`;
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      if (handleUnauthorizedApiClientError(error)) {
        return;
      }

      pushToast({
        title: error instanceof Error ? error.message : "Export failed.",
        tone: "error",
      });
    }
  }

  return (
    <div className="grid w-full gap-3 sm:w-auto sm:grid-cols-2">
      <Button className="w-full" variant="secondary" onClick={() => download("csv")}>
        Export Excel/CSV
      </Button>
      <Button className="w-full" variant="secondary" onClick={() => download("pdf")}>
        Export PDF
      </Button>
    </div>
  );
}
