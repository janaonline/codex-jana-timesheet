import { requireCrudApiKey } from "@/lib/crud-auth";
import { handlePublicApiRoute } from "@/lib/api-route";
import { apiSuccess, readJson } from "@/lib/response";
import { requireString, optionalString } from "@/lib/validators";
import { createProject, listProjects } from "@/services/project-service";

export async function GET(request: Request) {
  return handlePublicApiRoute(request, "list_projects", async () => {
    requireCrudApiKey(request);
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1") || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("pageSize") ?? "25") || 25),
    );
    const isActiveParam = searchParams.get("isActive");
    const isActive =
      isActiveParam === "true" ? true : isActiveParam === "false" ? false : undefined;
    const search = searchParams.get("search") ?? undefined;
    return apiSuccess(await listProjects({ isActive, search, page, pageSize }));
  });
}

export async function POST(request: Request) {
  return handlePublicApiRoute(request, "create_project", async () => {
    requireCrudApiKey(request);
    const body = (await readJson(request)) as Record<string, unknown>;
    const code = requireString(body.code, "code");
    const name = requireString(body.name, "name");
    const description = optionalString(body.description);
    const isActive = body.isActive === undefined ? true : Boolean(body.isActive);
    return apiSuccess(await createProject({ code, name, description, isActive }), { status: 201 });
  });
}
