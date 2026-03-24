import { redirect } from "next/navigation";

import { LoginScreen } from "@/components/auth/login-screen";
import { getAppSession, getHomePathForRole } from "@/lib/auth";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: "login" | "activate" | "forgot" }>;
}) {
  const [session, params] = await Promise.all([getAppSession(), searchParams]);

  if (session?.user) {
    if (session.user.passwordSetupRequired) {
      redirect("/auth/set-password");
    }

    redirect(getHomePathForRole(session.user.role));
  }

  return <LoginScreen defaultView={params.view ?? "login"} />;
}
