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
  const hasRole = ["user", "co_owner", "owner"].includes(body?.role);
  if (!id || id === actor.id || Number(hasStatus) + Number(hasPremium) + Number(hasRole) !== 1) {
    return NextResponse.json({ error: "Ungültige Benutzeraktion." }, { status: 400 });
  }
  if (hasRole && body.role === "owner" && actor.role !== "owner")
    return NextResponse.json(
      { error: "Nur ein Owner darf die Owner-Rolle vergeben." },
      { status: 403 },
    );
  const admin = createAdminClient();
  const { data: target } = await admin
    .from("profiles")
    .select("role, status, premium")
    .eq("id", id)
    .maybeSingle();
  if (!target) {
    return NextResponse.json({ error: "Benutzerkonto wurde nicht gefunden." }, { status: 404 });
  }
  if (hasStatus && target.status === "pending") {
    return NextResponse.json(
      { error: "Unbestätigte Konten können nur über einen Einladungscode aktiviert werden." },
      { status: 403 },
    );
  }
  const { error } = await admin
    .from("profiles")
    .update(hasRole ? { role: body.role } : hasPremium ? { premium: body.premium } : { status })
    .eq("id", id);
  if (error)
    return NextResponse.json(
      { error: "Benutzerstatus konnte nicht gespeichert werden." },
      { status: 500 },
    );
  await admin.from("audit_log").insert({
    actor_id: actor.id,
    action: hasRole
      ? `user.role_${body.role}`
      : hasPremium
        ? body.premium
          ? "user.pro_enabled"
          : "user.pro_disabled"
        : status === "suspended"
          ? "user.suspended"
          : "user.unsuspended",
    entity_type: "profile",
    entity_id: id,
  });
  return NextResponse.json({
    ok: true,
    ...(hasRole ? { role: body.role } : {}),
    premium: hasPremium ? body.premium : target.premium,
  });
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
  if (!target)
    return NextResponse.json({ error: "Benutzerkonto wurde nicht gefunden." }, { status: 404 });

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
