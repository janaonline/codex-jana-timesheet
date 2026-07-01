import { Prisma } from "@prisma/client";

import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";

export async function listProjects({
  isActive,
  search,
  page = 1,
  pageSize = 25,
}: {
  isActive?: boolean;
  search?: string;
  page?: number;
  pageSize?: number;
}) {
  const clampedSize = Math.min(pageSize, 100);
  const where: Prisma.ProjectWhereInput = {
    ...(isActive !== undefined && { isActive }),
    ...(search && {
      OR: [
        { name: { contains: search, mode: "insensitive" } },
        { code: { contains: search, mode: "insensitive" } },
      ],
    }),
  };
  const [items, total] = await Promise.all([
    prisma.project.findMany({
      where,
      skip: (page - 1) * clampedSize,
      take: clampedSize,
      orderBy: { createdAt: "desc" },
    }),
    prisma.project.count({ where }),
  ]);
  return { items, total, page, pageSize: clampedSize };
}

export async function getProjectById(id: string) {
  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) throw new AppError("NOT_FOUND", 404, "Project not found.");
  return project;
}

export async function createProject(data: {
  code: string;
  name: string;
  description?: string | null;
  isActive?: boolean;
}) {
  try {
    return await prisma.project.create({ data });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new AppError("DUPLICATE", 409, "code already in use.");
    }
    throw e;
  }
}

export async function updateProject(
  id: string,
  data: {
    code?: string;
    name?: string;
    description?: string | null;
    isActive?: boolean;
  },
) {
  await getProjectById(id);
  try {
    return await prisma.project.update({ where: { id }, data });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new AppError("DUPLICATE", 409, "code already in use.");
    }
    throw e;
  }
}

export async function softDeleteProject(id: string) {
  await getProjectById(id);
  return await prisma.project.update({
    where: { id },
    data: { isActive: false },
  });
}
