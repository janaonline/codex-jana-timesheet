import { PrismaClient } from "@prisma/client";

import { getMonthStart, getPreviousMonthKey, getMonthKey } from "../lib/time";
import { calculateAssignedHours } from "../lib/timesheet-calculations";

const prisma = new PrismaClient();

async function upsertProjects() {
  const projects = [
    {
      code: "LIV",
      name: "Livable Cities",
      description: "Urban governance and infrastructure workstream.",
    },
    {
      code: "DEM",
      name: "Democratic Accountability",
      description: "Citizen participation and civic process programs.",
    },
    {
      code: "RUR",
      name: "Rural Systems",
      description: "Rural governance pilots and supporting program work.",
    },
  ];

  for (const project of projects) {
    await prisma.project.upsert({
      where: { code: project.code },
      update: project,
      create: project,
    });
  }

  return prisma.project.findMany({ orderBy: { code: "asc" } });
}

async function upsertUsers() {
  const girija = await prisma.user.upsert({
    where: { email: "girija.admin@janaagraha.org" },
    update: {
      name: "Girija Admin",
      role: "ADMIN",
    },
    create: {
      email: "girija.admin@janaagraha.org",
      name: "Girija Admin",
      role: "ADMIN",
    },
  });

  const kishora = await prisma.user.upsert({
    where: { email: "kishora.admin@janaagraha.org" },
    update: {
      name: "Kishora Admin",
      role: "ADMIN",
    },
    create: {
      email: "kishora.admin@janaagraha.org",
      name: "Kishora Admin",
      role: "ADMIN",
    },
  });

  const operations = await prisma.user.upsert({
    where: { email: "mira.operations@janaagraha.org" },
    update: {
      name: "Mira Operations",
      role: "OPERATIONS",
    },
    create: {
      email: "mira.operations@janaagraha.org",
      name: "Mira Operations",
      role: "OPERATIONS",
    },
  });

  const anita = await prisma.user.upsert({
    where: { email: "anita.director@janaagraha.org" },
    update: {
      name: "Anita Director",
      role: "PROGRAM_HEAD",
      approverUserId: girija.id,
      joinDate: new Date("2025-01-01T00:00:00+05:30"),
    },
    create: {
      email: "anita.director@janaagraha.org",
      name: "Anita Director",
      role: "PROGRAM_HEAD",
      approverUserId: girija.id,
      joinDate: new Date("2025-01-01T00:00:00+05:30"),
    },
  });

  const ravi = await prisma.user.upsert({
    where: { email: "ravi.director@janaagraha.org" },
    update: {
      name: "Ravi Director",
      role: "PROGRAM_HEAD",
      approverUserId: girija.id,
      joinDate: new Date("2025-07-01T00:00:00+05:30"),
    },
    create: {
      email: "ravi.director@janaagraha.org",
      name: "Ravi Director",
      role: "PROGRAM_HEAD",
      approverUserId: girija.id,
      joinDate: new Date("2025-07-01T00:00:00+05:30"),
    },
  });

  return { girija, kishora, operations, anita, ravi };
}

function buildDailyEntries(
  monthKey: string,
  projectIds: string[],
  totalHours: number,
) {
  const entries: Array<{
    workDate: Date;
    projectId: string;
    hours: number;
    description: string;
  }> = [];

  let remaining = totalHours;
  let day = 1;
  let projectCursor = 0;

  while (remaining > 0) {
    const slice = remaining >= 8 ? 8 : remaining;
    entries.push({
      workDate: new Date(`${monthKey}-${String(day).padStart(2, "0")}T00:00:00+05:30`),
      projectId: projectIds[projectCursor % projectIds.length],
      hours: Number(slice.toFixed(2)),
      description: `Program delivery and leadership support for ${monthKey}`,
    });
    remaining = Number((remaining - slice).toFixed(2));
    day += 1;
    projectCursor += 1;
  }

  return entries;
}

async function seedTimesheet(params: {
  userId: string;
  monthKey: string;
  leaveDays: number;
  status:
    | "DRAFT"
    | "SUBMITTED"
    | "AUTO_SUBMITTED"
    | "FROZEN"
    | "EDIT_REQUESTED"
    | "EDIT_APPROVED"
    | "REJECTED"
    | "RESUBMITTED";
  totalHours: number;
  projectIds: string[];
  rejectionReason?: string | null;
}) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: params.userId } });
  const derived = calculateAssignedHours({
    monthKey: params.monthKey,
    leaveDays: params.leaveDays,
    joinDate: user.joinDate,
    exitDate: user.exitDate,
    holidays: [],
  });

  const timesheet = await prisma.timesheet.upsert({
    where: {
      userId_monthKey: {
        userId: params.userId,
        monthKey: params.monthKey,
      },
    },
    update: {
      leaveDays: params.leaveDays,
      workingDaysCount: derived.workingDaysCount,
      assignedHours: derived.assignedHours,
      status: params.status,
      submittedAt:
        params.status === "SUBMITTED" ||
        params.status === "AUTO_SUBMITTED" ||
        params.status === "RESUBMITTED"
          ? new Date(`${params.monthKey}-28T18:00:00+05:30`)
          : null,
      frozenAt:
        params.status === "FROZEN" ||
        params.status === "AUTO_SUBMITTED" ||
        params.status === "SUBMITTED" ||
        params.status === "RESUBMITTED"
          ? new Date(`${params.monthKey}-28T18:00:00+05:30`)
          : null,
      rejectionReason: params.rejectionReason ?? null,
      monthStart: getMonthStart(params.monthKey),
    },
    create: {
      userId: params.userId,
      monthKey: params.monthKey,
      monthStart: getMonthStart(params.monthKey),
      leaveDays: params.leaveDays,
      workingDaysCount: derived.workingDaysCount,
      assignedHours: derived.assignedHours,
      status: params.status,
      submittedAt:
        params.status === "SUBMITTED" ||
        params.status === "AUTO_SUBMITTED" ||
        params.status === "RESUBMITTED"
          ? new Date(`${params.monthKey}-28T18:00:00+05:30`)
          : null,
      frozenAt:
        params.status === "FROZEN" ||
        params.status === "AUTO_SUBMITTED" ||
        params.status === "SUBMITTED" ||
        params.status === "RESUBMITTED"
          ? new Date(`${params.monthKey}-28T18:00:00+05:30`)
          : null,
      rejectionReason: params.rejectionReason ?? null,
    },
  });

  await prisma.timesheetEntry.deleteMany({
    where: { timesheetId: timesheet.id },
  });

  await prisma.timesheetEntry.createMany({
    data: buildDailyEntries(params.monthKey, params.projectIds, params.totalHours).map(
      (entry) => ({
        ...entry,
        timesheetId: timesheet.id,
      }),
    ),
  });

  return timesheet;
}

async function main() {
  const projects = await upsertProjects();
  const users = await upsertUsers();

  await prisma.systemConfiguration.upsert({
    where: { id: "default" },
    update: {
      supportContactEmail: "support@janaagraha.org",
      holidayCalendar: [],
    },
    create: {
      id: "default",
      reminderDays: {
        currentMonthDraftDays: [25, 28],
        currentMonthSubmitDay: "last-day",
        nextMonthPendingDays: [3, 5],
      },
      autoSubmitDay: 5,
      completionThreshold: 100,
      inactivityTimeoutMins: 30,
      holidayCalendar: [],
      roleAccess: {},
      emailTemplates: {},
      notifyAdminOnAutoSubmit: true,
      supportContactEmail: "support@janaagraha.org",
    },
  });

  const currentMonthKey = getMonthKey(new Date());
  const previousMonthKey = getPreviousMonthKey(new Date());
  const olderMonthKey = "2026-01";

  await seedTimesheet({
    userId: users.anita.id,
    monthKey: currentMonthKey,
    leaveDays: 1,
    status: "DRAFT",
    totalHours: 64,
    projectIds: [projects[0].id, projects[1].id],
  });

  await seedTimesheet({
    userId: users.anita.id,
    monthKey: previousMonthKey,
    leaveDays: 0,
    status: "SUBMITTED",
    totalHours: calculateAssignedHours({
      monthKey: previousMonthKey,
      leaveDays: 0,
      joinDate: users.anita.joinDate,
      exitDate: users.anita.exitDate,
      holidays: [],
    }).assignedHours,
    projectIds: [projects[0].id, projects[1].id],
  });

  const raviPrevious = await seedTimesheet({
    userId: users.ravi.id,
    monthKey: previousMonthKey,
    leaveDays: 0,
    status: "EDIT_REQUESTED",
    totalHours: 80,
    projectIds: [projects[1].id, projects[2].id],
  });

  await prisma.editRequest.upsert({
    where: { id: "seed-pending-edit-request" },
    update: {
      timesheetId: raviPrevious.id,
      requestedById: users.ravi.id,
      status: "PENDING",
      reason: "Need to correct late-entered hours before payroll reconciliation.",
    },
    create: {
      id: "seed-pending-edit-request",
      timesheetId: raviPrevious.id,
      requestedById: users.ravi.id,
      status: "PENDING",
      reason: "Need to correct late-entered hours before payroll reconciliation.",
    },
  });

  await seedTimesheet({
    userId: users.anita.id,
    monthKey: olderMonthKey,
    leaveDays: 0,
    status: "AUTO_SUBMITTED",
    totalHours: calculateAssignedHours({
      monthKey: olderMonthKey,
      leaveDays: 0,
      joinDate: users.anita.joinDate,
      exitDate: users.anita.exitDate,
      holidays: [],
    }).assignedHours,
    projectIds: [projects[0].id, projects[2].id],
  });

  await prisma.emailLog.create({
    data: {
      userId: users.anita.id,
      category: "SUBMISSION_CONFIRMATION",
      subject: "[Seed] Previous month timesheet submitted",
      recipient: users.anita.email,
      status: "SENT",
      attempts: 1,
      htmlPreview: "<p>Seeded email log</p>",
      sentAt: new Date(),
    },
  });

  await prisma.auditLog.createMany({
    data: [
      {
        actorUserId: users.anita.id,
        subjectUserId: users.anita.id,
        action: "TIMESHEET_SUBMITTED",
        entityType: "TIMESHEET",
        entityId: users.anita.id,
      },
      {
        actorUserId: users.girija.id,
        subjectUserId: users.ravi.id,
        action: "EDIT_REQUEST_CREATED",
        entityType: "EDIT_REQUEST",
        entityId: "seed-pending-edit-request",
      },
    ],
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
