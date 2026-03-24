import { redirect } from "next/navigation";
import { getServerSession, type NextAuthOptions, type Session } from "next-auth";
import AzureADProvider from "next-auth/providers/azure-ad";
import CredentialsProvider from "next-auth/providers/credentials";

import {
  AZURE_AUTH_PROVIDER_ID,
  OTP_AUTH_PROVIDER_ID,
  PASSWORD_AUTH_PROVIDER_ID,
  type Permission,
  type UserRole,
} from "@/lib/constants";
import { isAppError, AppError } from "@/lib/errors";
import { env, hasAzureSsoConfig, isAzureSsoEnabled, isPasswordAuthEnabled } from "@/lib/env";
import { requiresPasswordSetup } from "@/lib/password-auth";
import { prisma } from "@/lib/prisma";
import { getPermissionsForRole } from "@/lib/rbac";
import { safeWriteAuditLog } from "@/services/audit-service";
import { authorizeOtpUser, authorizePasswordUser } from "@/services/auth-service";
import { getSystemConfiguration } from "@/services/configuration-service";

type AzureProfile = {
  oid?: string;
  name?: string;
  email?: string;
  preferred_username?: string;
  groups?: string[];
};

type AppSessionRequirement =
  | UserRole[]
  | {
      roles?: UserRole[];
      permission?: Permission;
      allowPendingPasswordSetup?: boolean;
    };

function normalizeRequirement(requirement?: AppSessionRequirement) {
  if (Array.isArray(requirement)) {
    return {
      roles: requirement,
      permission: undefined,
      allowPendingPasswordSetup: false,
    };
  }

  return {
    roles: requirement?.roles,
    permission: requirement?.permission,
    allowPendingPasswordSetup: requirement?.allowPendingPasswordSetup ?? false,
  };
}

function getRequesterKey(request: unknown) {
  if (!request || typeof request !== "object" || !("headers" in request)) {
    return "next-auth";
  }

  const headers = (request as { headers?: Record<string, string | string[] | undefined> })
    .headers;
  const forwarded = headers?.["x-forwarded-for"];
  const realIp = headers?.["x-real-ip"];

  if (typeof forwarded === "string" && forwarded) {
    return forwarded.split(",")[0].trim();
  }

  if (Array.isArray(forwarded) && forwarded[0]) {
    return forwarded[0];
  }

  if (typeof realIp === "string" && realIp) {
    return realIp;
  }

  return "next-auth";
}

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
      emailVerifiedAt: new Date(),
    },
    create: {
      email,
      name: profile.name ?? email,
      azureAdId: profile.oid,
      azureGroups: groups,
      role,
      lastLoginAt: new Date(),
      emailVerifiedAt: new Date(),
    },
  });
}

function buildPasswordProviders(): NextAuthOptions["providers"] {
  return [
    CredentialsProvider({
      id: PASSWORD_AUTH_PROVIDER_ID,
      name: "Email and password",
      credentials: {
        email: {
          label: "Email",
          type: "email",
          placeholder: "name@janaagraha.org",
        },
        password: {
          label: "Password",
          type: "password",
        },
      },
      async authorize(credentials) {
        try {
          if (!credentials?.email || !credentials.password) {
            throw new AppError("INVALID_CREDENTIALS", 401, "Invalid email or password.");
          }

          return await authorizePasswordUser(credentials.email, credentials.password);
        } catch (error) {
          throw new Error(
            isAppError(error) ? error.code : "INVALID_CREDENTIALS",
          );
        }
      },
    }),
    CredentialsProvider({
      id: OTP_AUTH_PROVIDER_ID,
      name: "One-time code",
      credentials: {
        email: {
          label: "Email",
          type: "email",
        },
        code: {
          label: "Code",
          type: "text",
        },
        purpose: {
          label: "Purpose",
          type: "text",
        },
      },
      async authorize(credentials, request) {
        try {
          if (!credentials?.email || !credentials.code || !credentials.purpose) {
            throw new AppError("OTP_INVALID", 401, "The code is invalid or has expired.");
          }

          return await authorizeOtpUser({
            email: credentials.email,
            code: credentials.code,
            purpose: credentials.purpose as "FIRST_LOGIN" | "FORGOT_PASSWORD" | "ACCOUNT_ACTIVATION",
            requesterKey: getRequesterKey(request),
          });
        } catch (error) {
          throw new Error(isAppError(error) ? error.code : "OTP_INVALID");
        }
      },
    }),
  ];
}

function buildProviders(): NextAuthOptions["providers"] {
  if (isPasswordAuthEnabled()) {
    return buildPasswordProviders();
  }

  if (isAzureSsoEnabled()) {
    return [
      AzureADProvider({
        clientId: env.azureAdClientId,
        clientSecret: env.azureAdClientSecret,
        tenantId: env.azureAdTenantId,
      }),
    ];
  }

  if (hasAzureSsoConfig()) {
    return [
      AzureADProvider({
        clientId: env.azureAdClientId,
        clientSecret: env.azureAdClientSecret,
        tenantId: env.azureAdTenantId,
      }),
    ];
  }

  return buildPasswordProviders();
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
      if (
        account?.provider === PASSWORD_AUTH_PROVIDER_ID ||
        account?.provider === OTP_AUTH_PROVIDER_ID
      ) {
        return Boolean(user);
      }

      if (account?.provider === AZURE_AUTH_PROVIDER_ID) {
        const syncedUser = await syncUserProfile(profile as AzureProfile);

        if (!syncedUser) {
          return false;
        }

        await safeWriteAuditLog({
          action: "AUTHENTICATION_SUCCEEDED",
          entityType: "AUTH",
          actorUserId: syncedUser.id,
          subjectUserId: syncedUser.id,
          metadata: {
            provider: AZURE_AUTH_PROVIDER_ID,
          },
        });
      }

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
        token.passwordSetupRequired = Boolean(user.passwordSetupRequired);
        token.permissions = Array.isArray(user.permissions)
          ? user.permissions
          : token.permissions ?? [];
        token.azureGroups = Array.isArray(user.azureGroups)
          ? user.azureGroups
          : token.azureGroups ?? [];
      }

      const email = typeof token.email === "string" ? token.email : undefined;
      const role = typeof token.role === "string" ? (token.role as UserRole) : undefined;

      if (email) {
        const currentUser = await prisma.user.findUnique({
          where: { email },
          select: {
            id: true,
            role: true,
            azureGroups: true,
            passwordHash: true,
            passwordResetRequired: true,
          },
        });

        if (currentUser) {
          token.sub = currentUser.id;
          token.role = currentUser.role;
          token.azureGroups = Array.isArray(currentUser.azureGroups)
            ? (currentUser.azureGroups as string[])
            : [];
          token.passwordSetupRequired = requiresPasswordSetup({
            passwordHash: currentUser.passwordHash,
            passwordResetRequired: currentUser.passwordResetRequired,
          });
        }
      }

      if (profile) {
        const azureProfile = profile as AzureProfile;
        token.azureGroups = azureProfile.groups ?? token.azureGroups ?? [];
      }

      const resolvedRole =
        typeof token.role === "string" ? (token.role as UserRole) : role;

      if (resolvedRole) {
        token.permissions = getPermissionsForRole(resolvedRole, config.roleAccess);
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub && token.role) {
        session.user.id = token.sub;
        session.user.role = token.role;
        session.user.lastActivityAt = token.lastActivityAt ?? Date.now();
        session.user.passwordSetupRequired = Boolean(token.passwordSetupRequired);
        session.user.permissions = Array.isArray(token.permissions)
          ? token.permissions
          : [];
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

export function getHomePathForRole(role: UserRole) {
  return role === "PROGRAM_HEAD" ? "/dashboard" : "/admin";
}

function assertSession(
  session: Session | null,
  requirement?: AppSessionRequirement,
): asserts session is Session {
  const normalized = normalizeRequirement(requirement);

  if (!session?.user || session.expiresByInactivity) {
    throw new AppError("UNAUTHORIZED", 401, "Authentication is required.");
  }

  if (session.user.passwordSetupRequired && !normalized.allowPendingPasswordSetup) {
    throw new AppError(
      "PASSWORD_SETUP_REQUIRED",
      403,
      "Set your password before continuing.",
    );
  }

  if (normalized.roles && !normalized.roles.includes(session.user.role)) {
    throw new AppError("FORBIDDEN", 403, "You do not have access to this route.");
  }

  if (
    normalized.permission &&
    !session.user.permissions.includes(normalized.permission)
  ) {
    throw new AppError("FORBIDDEN", 403, "You do not have access to this route.");
  }
}

export async function requireAppSession(requirement?: AppSessionRequirement) {
  const session = await getAppSession();

  try {
    assertSession(session, requirement);
  } catch (error) {
    if (isAppError(error)) {
      if (error.code === "UNAUTHORIZED") {
        redirect("/login");
      }

      if (error.code === "PASSWORD_SETUP_REQUIRED") {
        redirect("/auth/set-password");
      }

      if (error.code === "FORBIDDEN") {
        redirect("/forbidden");
      }
    }

    throw error;
  }

  return session;
}

export async function requireApiSession(requirement?: AppSessionRequirement) {
  const session = await getAppSession();
  assertSession(session, requirement);
  return session;
}
