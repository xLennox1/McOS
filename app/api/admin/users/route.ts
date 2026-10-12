import { NextResponse } from "next/server";
import { requestAdmin } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  if (!(await requestAdmin()))
    return NextResponse.json({ error: "Keine Administratorrechte." }, { status: 403 });
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("id, username, role, status, created_at, premium")
    .order("created_at", { ascending: false })
    .limit(250);
  if (error)
    return NextResponse.json({ error: "Benutzer konnten nicht geladen werden." }, { status: 500 });
  const { data: authData } = await admin.auth.admin.listUsers({ perPage: 250 });
  const emails = new Map((authData?.users ?? []).map((user) => [user.id, user.email ?? ""]));
  return NextResponse.json(
    (data ?? []).map((profile) => ({ ...profile, email: emails.get(profile.id) ?? "" })),
  );
}

export async function PATCH(request: Request) {
  const actor = await requestAdmin();
  if (!actor) return NextResponse.json({ error: "Keine Administratorrechte." }, { status: 403 });
  const body = await request.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  const status = body?.status;
  const hasStatus = ["active", "suspended"].includes(status);
  const hasPremium = typeof body?.premium === "boolean";
  if (!id || id === actor.id || hasStatus === hasPremium) {
    return NextResponse.json({ error: "Ungültige Benutzeraktion." }, { status: 400 });
  }
  const admin = createAdminClient();
  const { data: target } = await admin
    .from("profiles")
    .select("role, status, premium")
    .eq("id", id)
    .maybeSingle();
  if (!target || target.role === "admin") {
    return NextResponse.json(
      { error: "Administratorkonten können hier nicht gesperrt werden." },
      { status: 403 },
    );
  }
  if (hasStatus && target.status === "pending") {
    return NextResponse.json(
      { error: "Unbestätigte Konten können nur über einen Einladungscode aktiviert werden." },
      { status: 403 },
    );
  }
  const { error } = await admin
    .from("profiles")
    .update(hasPremium ? { premium: body.premium } : { status })
    .eq("id", id);
  if (error)
    return NextResponse.json(
      { error: "Benutzerstatus konnte nicht gespeichert werden." },
      { status: 500 },
    );
  await admin.from("audit_log").insert({
    actor_id: actor.id,
    action: hasPremium
      ? body.premium
        ? "user.pro_enabled"
        : "user.pro_disabled"
      : status === "suspended"
        ? "user.suspended"
        : "user.unsuspended",
    entity_type: "profile",
    entity_id: id,
  });
  return NextResponse.json({ ok: true, premium: hasPremium ? body.premium : target.premium });
}

export async function DELETE(request: Request) {
  const actor = await requestAdmin();
  if (!actor) return NextResponse.json({ error: "Keine Administratorrechte." }, { status: 403 });
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id) || id === actor.id)
    return NextResponse.json(
      { error: "Dieses Konto kann nicht gelöscht werden." },
      { status: 400 },
    );
  const admin = createAdminClient();
  const { data: target } = await admin
    .from("profiles")
    .select("id, username, role, avatar_path")
    .eq("id", id)
    .maybeSingle();
  if (!target || target.role === "admin")
    return NextResponse.json(
      { error: "Administratorkonten können hier nicht gelöscht werden." },
      { status: 403 },
    );

  await admin.from("audit_log").insert({
    actor_id: actor.id,
    action: "user.deleted",
    entity_type: "profile",
    entity_id: id,
    details: { username: target.username },
  });
  if (target.avatar_path) await admin.storage.from("profile-avatars").remove([target.avatar_path]);
  const { error } = await admin.auth.admin.deleteUser(id);
  if (error)
    return NextResponse.json(
      { error: "Benutzerkonto konnte nicht vollständig gelöscht werden." },
      { status: 500 },
    );
  return NextResponse.json({ ok: true });
}
