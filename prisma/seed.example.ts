// seed.example.ts — Template for local and production database seeding.
//
// SETUP:
//   1. Copy this file to prisma/seed.ts (which is gitignored).
//   2. Replace every "REPLACE_WITH_ACTUAL_PASSWORD" value with the real password.
//   3. Run: npm run db:seed
//
// The seed script is safe to re-run: existing users with a password hash
// already set will only have their name/role/designation updated — their
// password is never overwritten.

import { PrismaClient } from "@prisma/client";

import { hashPassword } from "../lib/password-auth";

const prisma = new PrismaClient();

type SeedUserDefinition = {
  email: string;
  name: string;
  role: "ASSOCIATE_DIRECTOR" | "ADMIN";
  designation: string;
  password: string;
};

const GIRIJA: SeedUserDefinition = {
  email: "girija.n@janaagraha.org",
  name: "Girija N",
  role: "ADMIN",
  designation: "Director - Finance",
  password: "REPLACE_WITH_ACTUAL_PASSWORD",
};

const OTHER_USERS: SeedUserDefinition[] = [
  {
    email: "anand.iyer@janaagraha.org",
    name: "Anand Sundararaman Iyer",
    role: "ASSOCIATE_DIRECTOR",
    designation: "Chief Policy and Insights Officer",
    password: "REPLACE_WITH_ACTUAL_PASSWORD",
  },
  {
    email: "anita.kumar@janaagraha.org",
    name: "Anita Kumar",
    role: "ASSOCIATE_DIRECTOR",
    designation: "Director - Policy and Insights",
    password: "REPLACE_WITH_ACTUAL_PASSWORD",
  },
  {
    email: "katie.pyle@janaagraha.org",
    name: "Katie Pyle",
    role: "ASSOCIATE_DIRECTOR",
    designation: "Director - Research and MEL",
    password: "REPLACE_WITH_ACTUAL_PASSWORD",
  },
  {
    email: "krishnan.s@janaagraha.org",
    name: "Krishnan Subbaraman",
    role: "ASSOCIATE_DIRECTOR",
    designation: "Director - Strategy and Partnerships",
    password: "REPLACE_WITH_ACTUAL_PASSWORD",
  },
  {
    email: "prabhat.kumar@janaagraha.org",
    name: "Prabhat Kumar",
    role: "ASSOCIATE_DIRECTOR",
    designation: "Director - Public Finance Management",
    password: "REPLACE_WITH_ACTUAL_PASSWORD",
  },
  {
    email: "pranati.das@janaagraha.org",
    name: "Pranati Das",
    role: "ASSOCIATE_DIRECTOR",
    designation: "Associate Director - State Program (Odisha)",
    password: "REPLACE_WITH_ACTUAL_PASSWORD",
  },
  {
    email: "prarthana.ramesh@janaagraha.org",
    name: "Prarthana Ramesh",
    role: "ASSOCIATE_DIRECTOR",
    designation: "Associate Director - State Programs",
    password: "REPLACE_WITH_ACTUAL_PASSWORD",
  },
  {
    email: "prerana.somani@janaagraha.org",
    name: "Prerana Somani",
    role: "ASSOCIATE_DIRECTOR",
    designation: "Associate Director - State Program (Assam)",
    password: "REPLACE_WITH_ACTUAL_PASSWORD",
  },
  {
    email: "sajith.s@janaagraha.org",
    name: "Sajith Sukumaran",
    role: "ASSOCIATE_DIRECTOR",
    designation: "Director - State Programs",
    password: "REPLACE_WITH_ACTUAL_PASSWORD",
  },
  {
    email: "sapna@janaagraha.org",
    name: "Sapna Karim",
    role: "ASSOCIATE_DIRECTOR",
    designation: "Chief Operating Officer",
    password: "REPLACE_WITH_ACTUAL_PASSWORD",
  },
  {
    email: "shiv.menon@janaagraha.org",
    name: "Shiv Kumar Shadananan Menon",
    role: "ASSOCIATE_DIRECTOR",
    designation: "Director - Civic Learning",
    password: "REPLACE_WITH_ACTUAL_PASSWORD",
  },
  {
    email: "shoumik.guha@janaagraha.org",
    name: "Shoumik Guha",
    role: "ASSOCIATE_DIRECTOR",
    designation: "Director - Development",
    password: "REPLACE_WITH_ACTUAL_PASSWORD",
  },
  {
    email: "srikanth@janaagraha.org",
    name: "Srikanth Viswanathan",
    role: "ASSOCIATE_DIRECTOR",
    designation: "Chief Executive Officer",
    password: "REPLACE_WITH_ACTUAL_PASSWORD",
  },
  {
    email: "swati.shukla@janaagraha.org",
    name: "Swati Shukla",
    role: "ADMIN",
    designation: "Director - People and Culture",
    password: "REPLACE_WITH_ACTUAL_PASSWORD",
  },
  {
    email: "vachana.vr@janaagraha.org",
    name: "V R Vachana",
    role: "ASSOCIATE_DIRECTOR",
    designation: "Associate Director - Policy",
    password: "REPLACE_WITH_ACTUAL_PASSWORD",
  },
  {
    email: "vivekanand.k@janaagraha.org",
    name: "Vivekananda K",
    role: "ASSOCIATE_DIRECTOR",
    designation: "Director - Transforming Bengaluru",
    password: "REPLACE_WITH_ACTUAL_PASSWORD",
  },
  {
    email: "nithya.ramesh@janaagraha.org",
    name: "Nithya Ramesh",
    role: "ASSOCIATE_DIRECTOR",
    designation: "Director - Planning and Design",
    password: "REPLACE_WITH_ACTUAL_PASSWORD",
  },
];

async function upsertSeedUser(
  definition: SeedUserDefinition,
  approverUserId: string | null,
) {
  const existingUser = await prisma.user.findUnique({
    where: { email: definition.email },
    select: {
      passwordHash: true,
    },
  });

  const now = new Date();

  if (existingUser?.passwordHash) {
    return prisma.user.update({
      where: { email: definition.email },
      data: {
        name: definition.name,
        role: definition.role,
        designation: definition.designation,
        approverUserId,
        isActive: true,
      },
    });
  }

  const passwordHash = await hashPassword(definition.password);

  if (existingUser) {
    return prisma.user.update({
      where: { email: definition.email },
      data: {
        name: definition.name,
        role: definition.role,
        designation: definition.designation,
        approverUserId,
        passwordHash,
        passwordSetAt: now,
        passwordResetRequired: false,
        emailVerifiedAt: now,
        isActive: true,
      },
    });
  }

  return prisma.user.create({
    data: {
      email: definition.email,
      name: definition.name,
      role: definition.role,
      designation: definition.designation,
      approverUserId,
      passwordHash,
      passwordSetAt: now,
      passwordResetRequired: false,
      emailVerifiedAt: now,
      isActive: true,
    },
  });
}

async function upsertUsers() {
  const girija = await upsertSeedUser(GIRIJA, null);

  const users = [girija];
  for (const definition of OTHER_USERS) {
    users.push(await upsertSeedUser(definition, girija.id));
  }

  return { girija, users };
}

async function main() {
  const { users } = await upsertUsers();

  console.log(`Seeded ${users.length} Janaagraha staff users.`);
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
