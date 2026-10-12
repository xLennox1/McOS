import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isStaffRole, type Profile } from "@/lib/types";

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function requestProfile(): Promise<Profile | null> {
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
  if (data?.status !== "active") return null;
  const avatar = data.avatar_path
    ? await admin.storage.from("profile-avatars").createSignedUrl(data.avatar_path, 3600)
    : null;
  return { ...data, avatar_url: avatar?.data?.signedUrl ?? null } as Profile;
}

export async function requestAdmin() {
  const profile = await requestProfile();
  return profile && isStaffRole(profile.role) ? profile : null;
}
