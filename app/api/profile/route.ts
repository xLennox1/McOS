import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { requestProfile } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/admin";
import { isStaffRole } from "@/lib/types";

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxAvatarBytes = 5 * 1024 * 1024;

export async function GET() {
  const profile = await requestProfile();
  if (!profile) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("id, username, bio, premium, avatar_path")
    .eq("id", profile.id)
    .single();
  if (error || !data)
    return NextResponse.json({ error: "Profil konnte nicht geladen werden." }, { status: 500 });
  const avatar = data.avatar_path
    ? await admin.storage.from("profile-avatars").createSignedUrl(data.avatar_path, 3600)
    : null;
  return NextResponse.json({
    ...data,
    avatarUrl: avatar?.data?.signedUrl ?? null,
    canEdit: data.premium || isStaffRole(profile.role),
  });
}

export async function PATCH(request: Request) {
  const profile = await requestProfile();
  if (!profile) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  const admin = createAdminClient();
  const { data: current } = await admin
    .from("profiles")
    .select("premium, avatar_path")
    .eq("id", profile.id)
    .maybeSingle();
  if (!current || (!current.premium && !isStaffRole(profile.role)))
    return NextResponse.json(
      { error: "Profilbearbeitung ist nur mit XLXOS PRO verfügbar." },
      { status: 403 },
    );

  const body = await request.json().catch(() => null);
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const bio = typeof body?.bio === "string" ? body.bio.trim() : "";
  if (!/^[a-zA-Z0-9_-]{3,24}$/.test(username) || bio.length > 280)
    return NextResponse.json(
      { error: "Benutzername oder Profiltext ist ungültig." },
      { status: 400 },
    );
  const { data, error } = await admin
    .from("profiles")
    .update({ username, bio })
    .eq("id", profile.id)
    .select("id, username, bio, premium, avatar_path")
    .single();
  if (error)
    return NextResponse.json(
      {
        error:
          error.code === "23505"
            ? "Dieser Benutzername ist bereits vergeben."
            : "Profil konnte nicht gespeichert werden.",
      },
      { status: error.code === "23505" ? 409 : 500 },
    );
  await admin.from("audit_log").insert({
    actor_id: profile.id,
    action: "profile.updated",
    entity_type: "profile",
    entity_id: profile.id,
  });
  const avatar = data.avatar_path
    ? await admin.storage.from("profile-avatars").createSignedUrl(data.avatar_path, 3600)
    : null;
  return NextResponse.json({ ...data, avatarUrl: avatar?.data?.signedUrl ?? null });
}

export async function POST(request: Request) {
  const profile = await requestProfile();
  if (!profile) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  const admin = createAdminClient();
  const { data: current } = await admin
    .from("profiles")
    .select("premium, avatar_path")
    .eq("id", profile.id)
    .maybeSingle();
  if (!current || (!current.premium && !isStaffRole(profile.role)))
    return NextResponse.json(
      { error: "Profilbilder sind nur mit XLXOS PRO verfügbar." },
      { status: 403 },
    );

  const form = await request.formData().catch(() => null);
  const file = form?.get("avatar");
  if (
    !(file instanceof File) ||
    !allowedTypes.has(file.type) ||
    file.size < 1 ||
    file.size > maxAvatarBytes
  )
    return NextResponse.json(
      { error: "Bitte lade ein JPEG-, PNG- oder WebP-Bild bis 5 MB hoch." },
      { status: 400 },
    );

  const extension = file.type === "image/jpeg" ? "jpg" : file.type === "image/png" ? "png" : "webp";
  const path = `${profile.id}/${randomUUID()}.${extension}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  const isValidImage =
    (file.type === "image/jpeg" && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) ||
    (file.type === "image/png" &&
      bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
    (file.type === "image/webp" &&
      bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
      bytes.subarray(8, 12).toString("ascii") === "WEBP");
  if (!isValidImage)
    return NextResponse.json(
      { error: "Der Bildinhalt passt nicht zum ausgewählten Dateityp." },
      { status: 400 },
    );
  const { error: uploadError } = await admin.storage
    .from("profile-avatars")
    .upload(path, bytes, { contentType: file.type, upsert: false });
  if (uploadError)
    return NextResponse.json(
      { error: "Profilbild konnte nicht gespeichert werden." },
      { status: 500 },
    );
  const { data, error } = await admin
    .from("profiles")
    .update({ avatar_path: path })
    .eq("id", profile.id)
    .select("id, username, bio, premium, avatar_path")
    .single();
  if (error) {
    await admin.storage.from("profile-avatars").remove([path]);
    return NextResponse.json(
      { error: "Profilbild konnte nicht mit dem Profil verknüpft werden." },
      { status: 500 },
    );
  }
  if (current.avatar_path)
    await admin.storage.from("profile-avatars").remove([current.avatar_path]);
  const avatar = await admin.storage.from("profile-avatars").createSignedUrl(path, 3600);
  return NextResponse.json({ ...data, avatarUrl: avatar.data?.signedUrl ?? null });
}
