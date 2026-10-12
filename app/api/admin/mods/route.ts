import { NextResponse } from "next/server";
import { requestAdmin } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const profile = await requestAdmin();
  if (!profile) return NextResponse.json({ error: "Keine Administratorrechte." }, { status: 403 });
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("mods")
    .select("*, mod_versions(*)")
    .order("created_at", { ascending: false });
  if (error)
    return NextResponse.json({ error: "Mods konnten nicht geladen werden." }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(request: Request) {
  const profile = await requestAdmin();
  if (!profile) return NextResponse.json({ error: "Keine Administratorrechte." }, { status: 403 });
  const body = await request.json().catch(() => null);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const description = typeof body?.description === "string" ? body.description.trim() : "";
  const category = typeof body?.category === "string" ? body.category.trim() : "Utility";
  const assetType = body?.assetType;
  const imageUrl = typeof body?.imageUrl === "string" ? body.imageUrl.trim() : "";
  const slug = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  if (
    name.length < 2 ||
    name.length > 80 ||
    !["mod", "schematic"].includes(assetType) ||
    !slug ||
    description.length > 3000 ||
    category.length > 40 ||
    !isSafeImageUrl(imageUrl)
  ) {
    return NextResponse.json(
      { error: "Name, Beschreibung oder Kategorie sind ungültig." },
      { status: 400 },
    );
  }
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("mods")
    .insert({
      name,
      slug,
      description,
      asset_type: assetType,
      category,
      image_url: imageUrl || null,
      created_by: profile.id,
    })
    .select("id, name, slug, description, asset_type, category, image_url, active, created_at")
    .single();
  if (error)
    return NextResponse.json(
      { error: "Mod konnte nicht angelegt werden. Der Name ist möglicherweise bereits vergeben." },
      { status: 409 },
    );
  await admin.from("audit_log").insert({
    actor_id: profile.id,
    action: "mod.created",
    entity_type: "mod",
    entity_id: data.id,
  });
  return NextResponse.json(data);
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
