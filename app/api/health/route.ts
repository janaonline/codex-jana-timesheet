import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({
      ok: true,
      data: {
        status: "healthy",
        database: "reachable",
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: {
          code: "HEALTHCHECK_FAILED",
          message: error instanceof Error ? error.message : "Unknown health check failure.",
        },
      },
      { status: 500 },
    );
  }
}
