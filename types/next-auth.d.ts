import type { DefaultSession } from "next-auth";

import type { UserRole } from "@/lib/constants";

declare module "next-auth" {
  interface User {
    id: string;
    role: UserRole;
    azureGroups?: string[];
  }

  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      role: UserRole;
      lastActivityAt: number;
    };
    expiresByInactivity?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: UserRole;
    lastActivityAt?: number;
    azureGroups?: string[];
    expiresByInactivity?: boolean;
  }
}
