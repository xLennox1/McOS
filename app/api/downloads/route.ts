import { NextResponse } from "next/server";
import { requestProfile } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/admin";
import { isStaffRole } from "@/lib/types";

export async function GET() {
  const profile = await requestProfile();
  if (!profile) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("download_history")
    .select("id, downloaded_at, mod_versions(version, minecraft_version, mods(name, slug))")
    .eq("user_id", profile.id)
    .order("downloaded_at", { ascending: false })
    .limit(50);
  if (error)
    return NextResponse.json(
      { error: "Download-Verlauf konnte nicht geladen werden." },
      { status: 500 },
    );
  return NextResponse.json(data ?? []);
}

export async function POST(request: Request) {
  const profile = await requestProfile();
  if (!profile) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (typeof body?.versionId !== "string") {
    return NextResponse.json({ error: "Ungültige Version." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: version, error } = await admin
    .from("mod_versions")
    .select("id, file_path, published, premium_only, mods!inner(active)")
    .eq("id", body.versionId)
    .eq("published", true)
    .eq("mods.active", true)
    .maybeSingle();
  if (error || !version)
    return NextResponse.json({ error: "Diese Datei ist nicht verfügbar." }, { status: 404 });
  const { data: access } = await admin
    .from("profiles")
    .select("premium, role")
    .eq("id", profile.id)
    .maybeSingle();
  if (version.premium_only && !isStaffRole(access?.role ?? "") && access?.premium !== true)
    return NextResponse.json(
      { error: "Diese Version ist exklusiv für MC OS PRO." },
      { status: 403 },
    );
  const { data: signed, error: signedError } = await admin.storage
    .from("mod-files")
    .createSignedUrl(version.file_path, 60, { download: true });
  if (signedError || !signed?.signedUrl) {
    return NextResponse.json(
      { error: "Der Download-Link konnte nicht erstellt werden." },
      { status: 500 },
    );
  }
  const { data: recorded, error: recordError } = await admin.rpc("record_download", {
    p_user_id: profile.id,
    p_version_id: version.id,
  });
  if (recordError || !recorded)
    return NextResponse.json(
      { error: "Download konnte nicht protokolliert werden." },
      { status: 500 },
    );
  return NextResponse.json({ url: signed.signedUrl });
}
