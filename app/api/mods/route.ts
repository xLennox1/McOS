import { NextResponse } from "next/server";
import { requestProfile } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const profile = await requestProfile();
  if (!profile) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const search = searchParams.get("q")?.trim().slice(0, 80) ?? "";
  const loader = searchParams.get("loader")?.trim().slice(0, 30) ?? "";
  const gameVersion = searchParams.get("version")?.trim().slice(0, 30) ?? "";
  const category = searchParams.get("category")?.trim().slice(0, 40) ?? "";
  const assetType = searchParams.get("type") === "schematic" ? "schematic" : "mod";
  const admin = createAdminClient();

  let query = admin
    .from("mods")
    .select("id, name, slug, description, asset_type, category, image_url, active, created_at")
    .eq("active", true)
    .eq("asset_type", assetType)
    .order("name");
  if (search) query = query.ilike("name", `%${search.replace(/[%_]/g, "\\$&")}%`);
  if (category) query = query.eq("category", category);
  const { data: mods, error } = await query;
  if (error)
    return NextResponse.json(
      { error: "Die Mod-Bibliothek konnte nicht geladen werden." },
      { status: 500 },
    );
  if (!mods?.length) return NextResponse.json([]);

  const { data: versions, error: versionError } = await admin
    .from("mod_versions")
    .select(
      "id, mod_id, version, minecraft_version, loaders, changelog, file_size, created_at, downloads, premium_only",
    )
    .in(
      "mod_id",
      mods.map((mod) => mod.id),
    )
    .eq("published", true)
    .order("created_at", { ascending: false });
  if (versionError)
    return NextResponse.json(
      { error: "Mod-Versionen konnten nicht geladen werden." },
      { status: 500 },
    );

  const filteredVersions = (versions ?? []).filter(
    (item) =>
      (!loader || item.loaders.includes(loader)) &&
      (!gameVersion || item.minecraft_version === gameVersion),
  );
  const allowedIds = new Set(filteredVersions.map((item) => item.mod_id));
  return NextResponse.json(
    mods
      .filter((mod) => (!loader && !gameVersion) || allowedIds.has(mod.id))
      .map((mod) => ({
        ...mod,
        mod_versions: filteredVersions.filter((item) => item.mod_id === mod.id),
      })),
  );
}
