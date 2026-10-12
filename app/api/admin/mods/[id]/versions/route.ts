import { NextResponse } from "next/server";
import { requestAdmin } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/admin";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const profile = await requestAdmin();
  if (!profile) return NextResponse.json({ error: "Keine Administratorrechte." }, { status: 403 });
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const version = typeof body?.version === "string" ? body.version.trim() : "";
  const minecraftVersion =
    typeof body?.minecraftVersion === "string" ? body.minecraftVersion.trim() : "";
  const filePath = typeof body?.filePath === "string" ? body.filePath : "";
  const isSchematicPath = /^[a-f0-9-]{36}\.(schem|schematic|litematic)$/.test(filePath);
  const isModPath = /^[a-f0-9-]{36}\.jar$/.test(filePath);
  const loaders = Array.isArray(body?.loaders) ? body.loaders : [];
  const changelog = typeof body?.changelog === "string" ? body.changelog.trim() : "";
  const premiumOnly = body?.premiumOnly === true;
  if (
    !/^[0-9A-Za-z.+_-]{1,32}$/.test(version) ||
    !/^[0-9A-Za-z.+_-]{1,32}$/.test(minecraftVersion) ||
    !(isModPath || isSchematicPath) ||
    (isModPath && (!loaders.length || loaders.length > 3)) ||
    (isSchematicPath && loaders.length > 0) ||
    !loaders.every((loader: unknown) =>
      ["Fabric", "Forge", "NeoForge", "Quilt"].includes(String(loader)),
    ) ||
    changelog.length > 3000
  ) {
    return NextResponse.json({ error: "Versionsdaten sind ungültig." }, { status: 400 });
  }
  const admin = createAdminClient();
  const { data: existing, error: modError } = await admin
    .from("mods")
    .select("id, asset_type")
    .eq("id", id)
    .maybeSingle();
  if (modError)
    return NextResponse.json({ error: "Mod konnte nicht geprüft werden." }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "Mod wurde nicht gefunden." }, { status: 404 });
  if (
    (existing.asset_type === "schematic" && !isSchematicPath) ||
    (existing.asset_type === "mod" && !isModPath)
  )
    return NextResponse.json(
      { error: "Der Dateityp passt nicht zum Inhaltstyp." },
      { status: 400 },
    );

  const { data: objects, error: listError } = await admin.storage
    .from("mod-files")
    .list("", { search: filePath });
  const object = objects?.find((item) => item.name === filePath);
  if (
    listError ||
    !object ||
    !object.metadata ||
    typeof object.metadata.size !== "number" ||
    object.metadata.size <= 0 ||
    object.metadata.size > 262144000
  ) {
    return NextResponse.json(
      { error: "Die hochgeladene Datei fehlt oder überschreitet 250 MB." },
      { status: 400 },
    );
  }

  const { data, error } = await admin.rpc("publish_mod_version_and_notify", {
    p_mod_id: id,
    p_version: version,
    p_minecraft_version: minecraftVersion,
    p_loaders: loaders,
    p_changelog: changelog,
    p_file_path: filePath,
    p_file_size: object.metadata.size,
    p_premium_only: premiumOnly,
  });
  if (error)
    return NextResponse.json(
      { error: "Version konnte nicht veröffentlicht werden." },
      { status: 409 },
    );
  await admin.from("audit_log").insert({
    actor_id: profile.id,
    action: "mod.version_published",
    entity_type: "mod_version",
    entity_id: data,
  });
  return NextResponse.json({ ok: true, id: data });
}
