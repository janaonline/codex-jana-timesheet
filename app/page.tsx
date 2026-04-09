import { redirect } from "next/navigation";

import { getAppSession, getHomePathForRole, getLoginPath } from "@/lib/auth";

export default async function HomePage() {
  const session = await getAppSession();

  if (!session?.user || session.expiresByInactivity) {
    redirect(getLoginPath(session));
  }

  if (session.user.passwordSetupRequired) {
    redirect("/auth/set-password");
  }

  redirect(getHomePathForRole(session.user.role));
}
