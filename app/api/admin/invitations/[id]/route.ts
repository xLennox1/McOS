import { NextResponse } from "next/server";
import { requestAdmin } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/admin";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const profile = await requestAdmin();
  if (!profile) return NextResponse.json({ error: "Keine Administratorrechte." }, { status: 403 });
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  if (typeof body?.disabled !== "boolean")
    return NextResponse.json({ error: "Ungültiger Status." }, { status: 400 });
  const admin = createAdminClient();
  const { error } = await admin
    .from("invitations")
    .update({ disabled: body.disabled })
    .eq("id", id);
  if (error)
    return NextResponse.json(
      { error: "Einladung konnte nicht aktualisiert werden." },
      { status: 500 },
    );
  await admin.from("audit_log").insert({
    actor_id: profile.id,
    action: body.disabled ? "invitation.disabled" : "invitation.enabled",
    entity_type: "invitation",
    entity_id: id,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const profile = await requestAdmin();
  if (!profile) return NextResponse.json({ error: "Keine Administratorrechte." }, { status: 403 });
  const { id } = await context.params;
  const admin = createAdminClient();
  const { error } = await admin.from("invitations").delete().eq("id", id);
  if (error)
    return NextResponse.json({ error: "Einladung konnte nicht gelöscht werden." }, { status: 500 });
  await admin.from("audit_log").insert({
    actor_id: profile.id,
    action: "invitation.deleted",
    entity_type: "invitation",
    entity_id: id,
  });
  return NextResponse.json({ ok: true });
}
