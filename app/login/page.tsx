import { redirect } from "next/navigation";

import { LoginScreen } from "@/components/auth/login-screen";
import { getAppSession, getHomePathForRole } from "@/lib/auth";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{
    view?: "login" | "activate" | "forgot";
    reason?: "session-expired";
  }>;
}) {
  const [session, params] = await Promise.all([getAppSession(), searchParams]);

  if (session?.user && !session.expiresByInactivity) {
    if (session.user.passwordSetupRequired) {
      redirect("/auth/set-password");
    }

    redirect(getHomePathForRole(session.user.role));
  }

  return (
    <LoginScreen
      defaultView={params.view ?? "login"}
      sessionExpired={
        params.reason === "session-expired" || Boolean(session?.expiresByInactivity)
      }
    />
  );
}
