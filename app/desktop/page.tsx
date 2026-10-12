import { redirect } from "next/navigation";
import { Desktop } from "@/components/Desktop";
import { getProfile } from "@/lib/auth";

export default async function DesktopPage() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (profile.status !== "active") redirect("/login?error=account-suspended");
  return <Desktop profile={profile} />;
}
