import { redirect } from "next/navigation";

import { SetPasswordScreen } from "@/components/auth/set-password-screen";
import { getAppSession, getHomePathForRole } from "@/lib/auth";

export default async function SetPasswordPage() {
  const session = await getAppSession();

  if (!session?.user || session.expiresByInactivity) {
    redirect("/login");
  }

  if (!session.user.passwordSetupRequired) {
    redirect(getHomePathForRole(session.user.role));
  }

  return (
    <SetPasswordScreen
      email={session.user.email ?? ""}
      redirectUrl={getHomePathForRole(session.user.role)}
    />
  );
}
