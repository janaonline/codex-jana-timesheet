import { handleApiRoute } from "@/lib/api-route";
import { readJson } from "@/lib/response";
import { requireString } from "@/lib/validators";
import { generateReportExport } from "@/services/export-service";

export async function POST(request: Request) {
  return handleApiRoute(request, {
    roles: ["ADMIN", "OPERATIONS"],
    requireOriginCheck: true,
    actionName: "export_report",
    handler: async () => {
      const body = (await readJson(request)) as {
        type?: string;
        format?: string;
        monthKey?: string;
      };

      const report = await generateReportExport({
        type: requireString(body.type, "type") as
          | "compliance"
          | "hours-utilization"
          | "edit-requests",
        format: requireString(body.format, "format") as "pdf" | "csv" | "excel",
        monthKey: body.monthKey,
      });

      return new Response(
        typeof report.body === "string"
          ? report.body
          : new Uint8Array(report.body),
        {
          status: 200,
          headers: {
            "content-type": report.contentType,
            "content-disposition": `attachment; filename="${report.fileName}"`,
          },
        },
      );
    },
  });
}
