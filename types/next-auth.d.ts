import type { DefaultSession } from "next-auth";

import type { Permission, UserRole } from "@/lib/constants";

declare module "next-auth" {
  interface User {
    id: string;
    role: UserRole;
    designation: string;
    passwordSetupRequired?: boolean;
    permissions?: Permission[];
    azureGroups?: string[];
  }

  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      role: UserRole;
      designation: string;
      lastActivityAt: number;
      passwordSetupRequired: boolean;
      permissions: Permission[];
    };
    expiresByInactivity?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: UserRole;
    designation?: string;
    lastActivityAt?: number;
    passwordSetupRequired?: boolean;
    permissions?: Permission[];
    azureGroups?: string[];
    expiresByInactivity?: boolean;
  }
}
