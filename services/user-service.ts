import { Prisma, type UserRole } from "@prisma/client";

import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";

const OMIT_PASSWORD = { passwordHash: true } as const;

export async function listUsers({
  role,
  isActive,
  search,
  page = 1,
  pageSize = 25,
}: {
  role?: UserRole;
  isActive?: boolean;
  search?: string;
  page?: number;
  pageSize?: number;
}) {
  const clampedSize = Math.min(pageSize, 100);
  const where: Prisma.UserWhereInput = {
    ...(role !== undefined && { role }),
    ...(isActive !== undefined && { isActive }),
    ...(search && {
      OR: [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ],
    }),
  };
  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      omit: OMIT_PASSWORD,
      skip: (page - 1) * clampedSize,
      take: clampedSize,
      orderBy: { createdAt: "desc" },
    }),
    prisma.user.count({ where }),
  ]);
  return { items, total, page, pageSize: clampedSize };
}

export async function getUserById(id: string) {
  const user = await prisma.user.findUnique({ where: { id }, omit: OMIT_PASSWORD });
  if (!user) throw new AppError("NOT_FOUND", 404, "User not found.");
  return user;
}

async function assertApproverExists(approverUserId: string) {
  const approver = await prisma.user.findUnique({
    where: { id: approverUserId },
    select: { id: true },
  });
  if (!approver) throw new AppError("VALIDATION_ERROR", 400, "Approver user not found.");
}

export async function createUser(data: {
  email: string;
  name: string;
  role: UserRole;
  designation: string;
  isActive?: boolean;
  approverUserId?: string | null;
  joinDate?: Date | null;
  exitDate?: Date | null;
}) {
  if (data.approverUserId) {
    await assertApproverExists(data.approverUserId);
  }
  try {
    return await prisma.user.create({ data, omit: OMIT_PASSWORD });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new AppError("DUPLICATE", 409, "email already in use.");
    }
    throw e;
  }
}

export async function updateUser(
  id: string,
  data: {
    email?: string;
    name?: string;
    role?: UserRole;
    designation?: string;
    isActive?: boolean;
    approverUserId?: string | null;
    joinDate?: Date | null;
    exitDate?: Date | null;
  },
) {
  await getUserById(id);
  if (data.approverUserId) {
    await assertApproverExists(data.approverUserId);
  }
  try {
    return await prisma.user.update({ where: { id }, data, omit: OMIT_PASSWORD });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new AppError("DUPLICATE", 409, "email already in use.");
    }
    throw e;
  }
}

export async function softDeleteUser(id: string) {
  await getUserById(id);
  return await prisma.user.update({
    where: { id },
    data: { isActive: false },
    omit: OMIT_PASSWORD,
  });
}
