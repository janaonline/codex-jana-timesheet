import { redirect } from "next/navigation";

import { getAppSession, getHomePathForRole } from "@/lib/auth";

export default async function HomePage() {
  const session = await getAppSession();

  if (!session?.user || session.expiresByInactivity) {
    redirect("/login");
  }

  if (session.user.passwordSetupRequired) {
    redirect("/auth/set-password");
  }

  redirect(getHomePathForRole(session.user.role));
}
