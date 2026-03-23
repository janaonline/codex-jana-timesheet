import { LoginScreen } from "@/components/auth/login-screen";
import { hasAzureSsoConfig, isLocalDevelopmentAuthEnabled } from "@/lib/env";

export default function LoginPage() {
  return (
    <LoginScreen
      azureEnabled={hasAzureSsoConfig()}
      localAuthEnabled={isLocalDevelopmentAuthEnabled()}
    />
  );
}
