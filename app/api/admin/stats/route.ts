import { NextResponse } from "next/server";
import { requestAdmin } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  if (!(await requestAdmin()))
    return NextResponse.json({ error: "Keine Administratorrechte." }, { status: 403 });
  const admin = createAdminClient();
  const [profiles, mods, versions, downloads, activity] = await Promise.all([
    admin.from("profiles").select("id", { count: "exact", head: true }),
    admin.from("mods").select("id", { count: "exact", head: true }).eq("active", true),
    admin.from("mod_versions").select("id", { count: "exact", head: true }).eq("published", true),
    admin.from("download_history").select("id", { count: "exact", head: true }),
    admin
      .from("audit_log")
      .select("id, actor_id, action, entity_type, entity_id, created_at")
      .order("created_at", { ascending: false })
      .limit(30),
  ]);
  if ([profiles.error, mods.error, versions.error, downloads.error, activity.error].some(Boolean)) {
    return NextResponse.json(
      { error: "Statistiken konnten nicht geladen werden." },
      { status: 500 },
    );
  }
  return NextResponse.json({
    profiles: profiles.count ?? 0,
    mods: mods.count ?? 0,
    versions: versions.count ?? 0,
    downloads: downloads.count ?? 0,
    activity: activity.data ?? [],
  });
}
