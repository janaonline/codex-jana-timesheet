import { USER_ROLES, type UserRole } from "@/lib/constants";
import { requireCrudApiKey } from "@/lib/crud-auth";
import { handlePublicApiRoute } from "@/lib/api-route";
import { apiSuccess, readJson } from "@/lib/response";
import { requireEmail, requireEnum, requireString, optionalString } from "@/lib/validators";
import { createUser, listUsers } from "@/services/user-service";

export async function GET(request: Request) {
  return handlePublicApiRoute(request, "list_users", async () => {
    requireCrudApiKey(request);
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1") || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("pageSize") ?? "25") || 25),
    );
    const roleParam = searchParams.get("role");
    const role = roleParam
      ? (USER_ROLES.includes(roleParam as UserRole) ? (roleParam as UserRole) : undefined)
      : undefined;
    const isActiveParam = searchParams.get("isActive");
    const isActive =
      isActiveParam === "true" ? true : isActiveParam === "false" ? false : undefined;
    const search = searchParams.get("search") ?? undefined;
    return apiSuccess(await listUsers({ role, isActive, search, page, pageSize }));
  });
}

export async function POST(request: Request) {
  return handlePublicApiRoute(request, "create_user", async () => {
    requireCrudApiKey(request);
    const body = (await readJson(request)) as Record<string, unknown>;
    const email = requireEmail(body.email, "email");
    const name = requireString(body.name, "name");
    const role = requireEnum(body.role, "role", USER_ROLES);
    const designation = requireString(body.designation, "designation");
    const isActive = body.isActive === undefined ? true : Boolean(body.isActive);
    const approverUserId = optionalString(body.approverUserId);
    const joinDate = body.joinDate ? new Date(body.joinDate as string) : null;
    const exitDate = body.exitDate ? new Date(body.exitDate as string) : null;
    return apiSuccess(
      await createUser({ email, name, role, designation, isActive, approverUserId, joinDate, exitDate }),
      { status: 201 },
    );
  });
}
