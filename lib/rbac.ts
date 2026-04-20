import { AppError } from "@/lib/errors";
import {
  DEFAULT_ROLE_ACCESS,
  TIMESHEET_OWNER_ROLES,
  type Permission,
  type UserRole,
} from "@/lib/constants";

export type RoleAccessMatrix = Record<UserRole, Permission[]>;

export function normalizeRoleAccess(raw: unknown): RoleAccessMatrix {
  const fallback = DEFAULT_ROLE_ACCESS;

  if (!raw || typeof raw !== "object") {
    return fallback;
  }

  const matrix = raw as Partial<Record<UserRole, Permission[]>>;

  return {
    PROGRAM_HEAD: matrix.PROGRAM_HEAD ?? fallback.PROGRAM_HEAD,
    ASSOCIATE_DIRECTOR:
      matrix.ASSOCIATE_DIRECTOR ?? fallback.ASSOCIATE_DIRECTOR,
    ADMIN: matrix.ADMIN ?? fallback.ADMIN,
    OPERATIONS: matrix.OPERATIONS ?? fallback.OPERATIONS,
  };
}

export function hasPermission(
  role: UserRole,
  permission: Permission,
  overrides?: unknown,
) {
  return getPermissionsForRole(role, overrides).includes(permission);
}

export function getPermissionsForRole(role: UserRole, overrides?: unknown) {
  const matrix = normalizeRoleAccess(overrides);
  return matrix[role];
}

export function assertPermission(
  role: UserRole,
  permission: Permission,
  overrides?: unknown,
) {
  if (!hasPermission(role, permission, overrides)) {
    throw new AppError(
      "FORBIDDEN",
      403,
      "You do not have permission to perform this action.",
    );
  }
}

export function isAdminRole(role: UserRole) {
  return role === "ADMIN" || role === "OPERATIONS";
}

const TIMESHEET_OWNER_ROLE_SET: ReadonlySet<UserRole> = new Set(
  TIMESHEET_OWNER_ROLES,
);

export function isTimesheetOwnerRole(
  role: UserRole,
): role is (typeof TIMESHEET_OWNER_ROLES)[number] {
  return TIMESHEET_OWNER_ROLE_SET.has(role);
}
