import { NextResponse } from "next/server";
import { requestAdmin } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/admin";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const profile = await requestAdmin();
  if (!profile) return NextResponse.json({ error: "Keine Administratorrechte." }, { status: 403 });
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const description = typeof body?.description === "string" ? body.description.trim() : "";
  const category = typeof body?.category === "string" ? body.category.trim() : "";
  const imageUrl = typeof body?.imageUrl === "string" ? body.imageUrl.trim() : "";
  if (
    name.length < 2 ||
    name.length > 80 ||
    description.length > 3000 ||
    category.length < 2 ||
    category.length > 40 ||
    typeof body?.active !== "boolean" ||
    !isSafeImageUrl(imageUrl)
  ) {
    return NextResponse.json({ error: "Mod-Daten sind ungültig." }, { status: 400 });
  }
  const slug = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  const admin = createAdminClient();
  const { data: updatedMod, error } = await admin
    .from("mods")
    .update({
      name,
      slug,
      description,
      category,
      image_url: imageUrl || null,
      active: body.active,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("id, active")
    .maybeSingle();
  if (error)
    return NextResponse.json({ error: "Mod konnte nicht gespeichert werden." }, { status: 500 });
  if (!updatedMod || updatedMod.active !== body.active) {
    return NextResponse.json(
      { error: "Supabase hat die Browser-Freigabe nicht übernommen. Bitte erneut versuchen." },
      { status: 500 },
    );
  }
  await admin.from("audit_log").insert({
    actor_id: profile.id,
    action: body.active ? "mod.updated" : "mod.deactivated",
    entity_type: "mod",
    entity_id: id,
  });
  return NextResponse.json({ ok: true });
}

function isSafeImageUrl(value: string) {
  if (!value) return true;
  if (value.length > 1000) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const profile = await requestAdmin();
  if (!profile) return NextResponse.json({ error: "Keine Administratorrechte." }, { status: 403 });
  const { id } = await context.params;
  const admin = createAdminClient();
  const { data: versions, error: readError } = await admin
    .from("mod_versions")
    .select("file_path")
    .eq("mod_id", id);
  if (readError)
    return NextResponse.json(
      { error: "Mod-Dateien konnten nicht ermittelt werden." },
      { status: 500 },
    );
  if (versions?.length) {
    const { error: storageError } = await admin.storage
      .from("mod-files")
      .remove(versions.map((item) => item.file_path));
    if (storageError)
      return NextResponse.json(
        { error: "Mod-Dateien konnten nicht gelöscht werden." },
        { status: 500 },
      );
  }
  const { error } = await admin.from("mods").delete().eq("id", id);
  if (error)
    return NextResponse.json({ error: "Mod konnte nicht gelöscht werden." }, { status: 500 });
  await admin.from("audit_log").insert({
    actor_id: profile.id,
    action: "mod.deleted",
    entity_type: "mod",
    entity_id: id,
  });
  return NextResponse.json({ ok: true });
}
