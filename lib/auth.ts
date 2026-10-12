import "server-only";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isStaffRole, type Profile } from "@/lib/types";

export async function getProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("id, username, role, status, created_at, settings, premium, bio, avatar_path")
    .eq("id", user.id)
    .maybeSingle();
  if (!data) return null;
  const avatar = data.avatar_path
    ? await admin.storage.from("profile-avatars").createSignedUrl(data.avatar_path, 3600)
    : null;
  return { ...data, avatar_url: avatar?.data?.signedUrl ?? null } as Profile;
}

export async function requireProfile() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  if (profile.status !== "active") redirect("/login?error=account-suspended");
  return profile;
}

export async function requireAdmin() {
  const profile = await requireProfile();
  if (!isStaffRole(profile.role)) redirect("/desktop");
  return profile;
}
