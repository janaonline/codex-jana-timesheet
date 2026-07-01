import { requireCrudApiKey } from "@/lib/crud-auth";
import { handlePublicApiRoute } from "@/lib/api-route";
import { apiSuccess, readJson } from "@/lib/response";
import { requireString, optionalString } from "@/lib/validators";
import { getProjectById, updateProject, softDeleteProject } from "@/services/project-service";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handlePublicApiRoute(request, "get_project", async () => {
    requireCrudApiKey(request);
    const { id } = await params;
    return apiSuccess(await getProjectById(id));
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handlePublicApiRoute(request, "update_project", async () => {
    requireCrudApiKey(request);
    const { id } = await params;
    const body = (await readJson(request)) as Record<string, unknown>;
    const data: Parameters<typeof updateProject>[1] = {};
    if ("code" in body) data.code = requireString(body.code, "code");
    if ("name" in body) data.name = requireString(body.name, "name");
    if ("description" in body) data.description = optionalString(body.description);
    if ("isActive" in body) data.isActive = Boolean(body.isActive);
    return apiSuccess(await updateProject(id, data));
  });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handlePublicApiRoute(request, "soft_delete_project", async () => {
    requireCrudApiKey(request);
    const { id } = await params;
    return apiSuccess(await softDeleteProject(id));
  });
}
