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
  const published = body?.published !== false;
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
    .select("id, name, asset_type, active")
    .eq("id", id)
    .maybeSingle();
  if (modError)
    return NextResponse.json({ error: "Mod konnte nicht geprüft werden." }, { status: 500 });
  if (!existing)
    return NextResponse.json({ error: "Eintrag wurde nicht gefunden." }, { status: 404 });
  if (published && !existing.active) {
    return NextResponse.json(
      {
        error: "Der Eintrag ist deaktiviert. Aktiviere ihn zuerst, damit er im Browser erscheint.",
      },
      { status: 409 },
    );
  }
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

  const { data, error } = await admin
    .from("mod_versions")
    .insert({
      mod_id: id,
      version,
      minecraft_version: minecraftVersion,
      loaders,
      changelog,
      file_path: filePath,
      file_size: object.metadata.size,
      premium_only: premiumOnly,
      published,
    })
    .select("id, published")
    .single();
  if (error) {
    if (error.code === "23505")
      return NextResponse.json(
        { error: "Diese Version ist für diesen Eintrag bereits vorhanden." },
        { status: 409 },
      );
    return NextResponse.json(
      { error: "Version konnte nicht gespeichert werden. Prüfe die Supabase-Migrationen." },
      { status: 500 },
    );
  }
  let warning: string | undefined;
  if (published)
    warning = await notifyPublication(
      admin,
      existing.name,
      existing.asset_type,
      version,
      minecraftVersion,
      changelog,
      premiumOnly,
    );
  await admin.from("audit_log").insert({
    actor_id: profile.id,
    action: published ? "mod.version_published" : "mod.version_drafted",
    entity_type: "mod_version",
    entity_id: data.id,
  });
  return NextResponse.json({ ok: true, id: data.id, published: data.published, warning });
}

export async function PATCH(request: Request, context: RouteContext) {
  const profile = await requestAdmin();
  if (!profile) return NextResponse.json({ error: "Keine Administratorrechte." }, { status: 403 });
  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  if (typeof body?.versionId !== "string" || typeof body?.published !== "boolean") {
    return NextResponse.json({ error: "Ungültiger Veröffentlichungsstatus." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: version, error: versionError } = await admin
    .from("mod_versions")
    .select(
      "id, mod_id, version, minecraft_version, changelog, premium_only, published, mods!inner(name, asset_type, active)",
    )
    .eq("id", body.versionId)
    .eq("mod_id", id)
    .maybeSingle();
  if (versionError)
    return NextResponse.json({ error: "Version konnte nicht geprüft werden." }, { status: 500 });
  if (!version)
    return NextResponse.json({ error: "Version wurde nicht gefunden." }, { status: 404 });
  const mod = Array.isArray(version.mods) ? version.mods[0] : version.mods;
  if (body.published && !mod.active) {
    return NextResponse.json(
      {
        error: "Der Eintrag ist deaktiviert. Aktiviere ihn zuerst, damit er im Browser erscheint.",
      },
      { status: 409 },
    );
  }

  const { error: updateError } = await admin
    .from("mod_versions")
    .update({ published: body.published })
    .eq("id", body.versionId)
    .eq("mod_id", id);
  if (updateError)
    return NextResponse.json(
      { error: "Veröffentlichungsstatus konnte nicht gespeichert werden." },
      { status: 500 },
    );

  let warning: string | undefined;
  if (body.published && !version.published) {
    warning = await notifyPublication(
      admin,
      mod.name,
      mod.asset_type,
      version.version,
      version.minecraft_version,
      version.changelog,
      version.premium_only,
    );
  }
  await admin.from("audit_log").insert({
    actor_id: profile.id,
    action: body.published ? "mod.version_published" : "mod.version_unpublished",
    entity_type: "mod_version",
    entity_id: body.versionId,
  });
  return NextResponse.json({ ok: true, published: body.published, warning });
}

async function notifyPublication(
  admin: ReturnType<typeof createAdminClient>,
  modName: string,
  assetType: "mod" | "schematic",
  version: string,
  minecraftVersion: string,
  changelog: string,
  premiumOnly: boolean,
) {
  const { data: profiles, error: profilesError } = await admin
    .from("profiles")
    .select("id")
    .eq("status", "active");
  if (profilesError)
    return "Die Veröffentlichung ist aktiv, aber McOS-Mail konnte nicht geladen werden.";
  if (!profiles?.length) return undefined;
  const { error } = await admin.from("mailbox_messages").insert(
    profiles.map((recipient) => ({
      recipient_id: recipient.id,
      sender_name: "MC OS",
      subject: `${assetType === "mod" ? "Neue Mod-Version" : "Neue Schematic"}: ${modName}`.slice(
        0,
        160,
      ),
      body: (
        `${assetType === "mod" ? "Die Mod-Version" : "Die Schematic"} ${version} für Minecraft ${minecraftVersion} ist jetzt in der ${
          assetType === "mod" ? "Mod-Bibliothek" : "Schematic-Bibliothek"
        } verfügbar.` +
        (premiumOnly ? " Diese Version ist exklusiv für PRO-Mitglieder." : "") +
        (changelog ? `\n\nÄnderungsprotokoll:\n${changelog}` : "")
      ).slice(0, 5000),
    })),
  );
  return error
    ? "Die Veröffentlichung ist aktiv, aber die McOS-Mail-Benachrichtigung ist fehlgeschlagen."
    : undefined;
}
