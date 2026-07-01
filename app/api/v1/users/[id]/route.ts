import { USER_ROLES, type UserRole } from "@/lib/constants";
import { requireCrudApiKey } from "@/lib/crud-auth";
import { handlePublicApiRoute } from "@/lib/api-route";
import { AppError } from "@/lib/errors";
import { apiSuccess, readJson } from "@/lib/response";
import { requireEmail, requireEnum, requireString, optionalString } from "@/lib/validators";
import { getUserById, updateUser, softDeleteUser } from "@/services/user-service";

const FORBIDDEN_FIELDS = [
  "passwordHash",
  "passwordSetAt",
  "passwordResetRequired",
  "emailVerifiedAt",
  "azureAdId",
  "azureGroups",
  "lastLoginAt",
];

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handlePublicApiRoute(request, "get_user", async () => {
    requireCrudApiKey(request);
    const { id } = await params;
    return apiSuccess(await getUserById(id));
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handlePublicApiRoute(request, "update_user", async () => {
    requireCrudApiKey(request);
    const { id } = await params;
    const body = (await readJson(request)) as Record<string, unknown>;
    for (const f of FORBIDDEN_FIELDS) {
      if (f in body) {
        throw new AppError("VALIDATION_ERROR", 400, `Field "${f}" cannot be set via this API.`);
      }
    }
    const data: Parameters<typeof updateUser>[1] = {};
    if ("email" in body) data.email = requireEmail(body.email, "email");
    if ("name" in body) data.name = requireString(body.name, "name");
    if ("role" in body) data.role = requireEnum(body.role, "role", USER_ROLES) as UserRole;
    if ("designation" in body) data.designation = requireString(body.designation, "designation");
    if ("isActive" in body) data.isActive = Boolean(body.isActive);
    if ("approverUserId" in body) data.approverUserId = optionalString(body.approverUserId);
    if ("joinDate" in body)
      data.joinDate = body.joinDate ? new Date(body.joinDate as string) : null;
    if ("exitDate" in body)
      data.exitDate = body.exitDate ? new Date(body.exitDate as string) : null;
    return apiSuccess(await updateUser(id, data));
  });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return handlePublicApiRoute(request, "soft_delete_user", async () => {
    requireCrudApiKey(request);
    const { id } = await params;
    return apiSuccess(await softDeleteUser(id));
  });
}
