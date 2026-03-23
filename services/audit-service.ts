import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { captureError } from "@/lib/observability";

type AuditInput = {
  actorUserId?: string | null;
  subjectUserId?: string | null;
  timesheetId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
};

type PrismaLike = typeof prisma;

export async function writeAuditLog(
  input: AuditInput,
  db: PrismaLike = prisma,
) {
  return db.auditLog.create({
    data: {
      actorUserId: input.actorUserId ?? undefined,
      subjectUserId: input.subjectUserId ?? undefined,
      timesheetId: input.timesheetId ?? undefined,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? undefined,
      metadata: (input.metadata as Prisma.InputJsonValue | undefined) ?? undefined,
    },
  });
}

export async function safeWriteAuditLog(
  input: AuditInput,
  db: PrismaLike = prisma,
) {
  try {
    await writeAuditLog(input, db);
  } catch (error) {
    await captureError("audit_log_write_failed", error, {
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
    });
  }
}
