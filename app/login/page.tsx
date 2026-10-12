import { redirect } from "next/navigation";
import { LoginForm } from "@/components/AuthForms";
import { getProfile } from "@/lib/auth";

export default async function LoginPage() {
  const profile = await getProfile();
  if (profile?.status === "active") redirect("/desktop");
  return <LoginForm />;
}
