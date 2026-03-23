import { redirect } from "next/navigation";

import { getAppSession } from "@/lib/auth";

export default async function HomePage() {
  const session = await getAppSession();

  if (!session?.user || session.expiresByInactivity) {
    redirect("/login");
  }

  if (session.user.role === "PROGRAM_HEAD") {
    redirect("/dashboard");
  }

  redirect("/admin");
}
