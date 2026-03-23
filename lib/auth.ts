import { redirect } from "next/navigation";
import { getServerSession, type NextAuthOptions, type Session } from "next-auth";
import AzureADProvider from "next-auth/providers/azure-ad";
import CredentialsProvider from "next-auth/providers/credentials";

import { env, hasAzureSsoConfig, isLocalDevelopmentAuthEnabled } from "@/lib/env";
import { AppError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import type { UserRole } from "@/lib/constants";
import { getSystemConfiguration } from "@/services/configuration-service";
import { safeWriteAuditLog } from "@/services/audit-service";

type AzureProfile = {
  oid?: string;
  name?: string;
  email?: string;
  preferred_username?: string;
  groups?: string[];
};

type LocalDevelopmentUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  azureGroups: string[];
};

async function resolveRole(email: string, groups: string[]) {
  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { role: true },
  });

  if (groups.includes(env.azureAdAdminGroupId)) {
    return "ADMIN" satisfies UserRole;
  }

  if (groups.includes(env.azureAdOperationsGroupId)) {
    return "OPERATIONS" satisfies UserRole;
  }

  if (groups.includes(env.azureAdProgramHeadGroupId)) {
    return "PROGRAM_HEAD" satisfies UserRole;
  }

  return existingUser?.role ?? null;
}

async function syncUserProfile(profile: AzureProfile) {
  const email = profile.email ?? profile.preferred_username;

  if (!email) {
    await safeWriteAuditLog({
      action: "AUTHENTICATION_FAILED",
      entityType: "AUTH",
      metadata: {
        reason: "Azure profile did not include an email address.",
      },
    });
    return null;
  }

  const groups = profile.groups ?? [];
  const role = await resolveRole(email, groups);

  if (!role) {
    await safeWriteAuditLog({
      action: "AUTHORIZATION_FAILED",
      entityType: "AUTH",
      subjectUserId: undefined,
      metadata: {
        email,
        reason:
          "Unable to map Azure AD groups to an internal role. Check Azure group configuration or seeded user role.",
      },
    });
    return null;
  }

  return prisma.user.upsert({
    where: { email },
    update: {
      name: profile.name ?? email,
      azureAdId: profile.oid,
      azureGroups: groups,
      role,
      lastLoginAt: new Date(),
    },
    create: {
      email,
      name: profile.name ?? email,
      azureAdId: profile.oid,
      azureGroups: groups,
      role,
      lastLoginAt: new Date(),
    },
  });
}

async function authorizeLocalDevelopmentUser(email: string | undefined) {
  const normalizedEmail = email?.trim().toLowerCase();

  if (!normalizedEmail) {
    await safeWriteAuditLog({
      action: "AUTHENTICATION_FAILED",
      entityType: "AUTH",
      metadata: {
        provider: "local-dev",
        reason: "Local development sign-in was attempted without an email address.",
      },
    });
    return null;
  }

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      azureGroups: true,
    },
  });

  if (!user || !user.isActive) {
    await safeWriteAuditLog({
      action: "AUTHENTICATION_FAILED",
      entityType: "AUTH",
      metadata: {
        provider: "local-dev",
        email: normalizedEmail,
        reason: "Local development sign-in was attempted for an inactive or unknown user.",
      },
    });
    return null;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      lastLoginAt: new Date(),
    },
  });

  await safeWriteAuditLog({
    action: "AUTHENTICATION_SUCCEEDED",
    entityType: "AUTH",
    actorUserId: user.id,
    subjectUserId: user.id,
    metadata: {
      provider: "local-dev",
    },
  });

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    azureGroups: Array.isArray(user.azureGroups)
      ? (user.azureGroups as string[])
      : [],
  } satisfies LocalDevelopmentUser;
}

function buildProviders(): NextAuthOptions["providers"] {
  const providers: NextAuthOptions["providers"] = [];

  if (hasAzureSsoConfig()) {
    providers.push(
      AzureADProvider({
        clientId: env.azureAdClientId,
        clientSecret: env.azureAdClientSecret,
        tenantId: env.azureAdTenantId,
      }),
    );
  }

  if (isLocalDevelopmentAuthEnabled()) {
    providers.push(
      CredentialsProvider({
        id: "local-dev",
        name: "Local Development Sign-In",
        credentials: {
          email: {
            label: "Email",
            type: "email",
            placeholder: "anita.director@janaagraha.org",
          },
        },
        async authorize(credentials) {
          return authorizeLocalDevelopmentUser(credentials?.email);
        },
      }),
    );
  }

  if (providers.length > 0) {
    return providers;
  }

  return [
    AzureADProvider({
      clientId: env.azureAdClientId || "replace-with-azure-client-id",
      clientSecret: env.azureAdClientSecret || "replace-with-azure-client-secret",
      tenantId: env.azureAdTenantId || "replace-with-azure-tenant-id",
    }),
  ];
}

export const authOptions: NextAuthOptions = {
  providers: buildProviders(),
  pages: {
    signIn: "/login",
  },
  secret: env.nextAuthSecret,
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
  },
  callbacks: {
    async signIn({ account, profile, user }) {
      if (account?.provider === "local-dev") {
        return Boolean(user);
      }

      const syncedUser = await syncUserProfile(profile as AzureProfile);

      if (!syncedUser) {
        return false;
      }

      await safeWriteAuditLog({
        action: "AUTHENTICATION_SUCCEEDED",
        entityType: "AUTH",
        actorUserId: syncedUser.id,
        subjectUserId: syncedUser.id,
      });

      return true;
    },
    async jwt({ token, profile, user }) {
      const config = await getSystemConfiguration();
      const timeoutMs = config.inactivityTimeoutMins * 60 * 1000;
      const now = Date.now();
      const lastActivityAt =
        typeof token.lastActivityAt === "number" ? token.lastActivityAt : now;

      if (now - lastActivityAt > timeoutMs) {
        token.expiresByInactivity = true;
        return token;
      }

      token.lastActivityAt = now;
      token.expiresByInactivity = false;

      if (user) {
        token.sub = user.id;
        token.email = user.email;
        token.name = user.name;
        token.role = user.role;
        token.azureGroups = Array.isArray(user.azureGroups)
          ? user.azureGroups
          : token.azureGroups ?? [];
      }

      const email =
        typeof token.email === "string" ? token.email : undefined;

      if (email) {
        const user = await prisma.user.findUnique({
          where: { email },
          select: { id: true, role: true, azureGroups: true },
        });

        if (user) {
          token.sub = user.id;
          token.role = user.role;
          token.azureGroups = Array.isArray(user.azureGroups)
            ? (user.azureGroups as string[])
            : [];
        }
      }

      if (profile) {
        const azureProfile = profile as AzureProfile;
        token.azureGroups = azureProfile.groups ?? token.azureGroups ?? [];
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub && token.role) {
        session.user.id = token.sub;
        session.user.role = token.role;
        session.user.lastActivityAt = token.lastActivityAt ?? Date.now();
        session.user.email =
          typeof token.email === "string" ? token.email : session.user.email;
        session.user.name =
          typeof token.name === "string" ? token.name : session.user.name;
      }

      session.expiresByInactivity = Boolean(token.expiresByInactivity);

      return session;
    },
  },
};

export async function getAppSession() {
  return getServerSession(authOptions);
}

function assertSession(
  session: Session | null,
  allowedRoles?: UserRole[],
): asserts session is Session {
  if (!session?.user || session.expiresByInactivity) {
    throw new AppError("UNAUTHORIZED", 401, "Authentication is required.");
  }

  if (allowedRoles && !allowedRoles.includes(session.user.role)) {
    throw new AppError("FORBIDDEN", 403, "You do not have access to this route.");
  }
}

export async function requireAppSession(allowedRoles?: UserRole[]) {
  const session = await getAppSession();

  if (!session?.user || session.expiresByInactivity) {
    redirect("/login");
  }

  if (allowedRoles && !allowedRoles.includes(session.user.role)) {
    redirect("/forbidden");
  }

  return session;
}

export async function requireApiSession(allowedRoles?: UserRole[]) {
  const session = await getAppSession();
  assertSession(session, allowedRoles);
  return session;
}
