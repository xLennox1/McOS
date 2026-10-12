import { NextResponse } from "next/server";
import { requestProfile } from "@/lib/http";
import { createClient } from "@/lib/supabase/server";

const accents = new Set(["cyan", "violet", "emerald", "rose"]);
const wallpapers = new Set(["aurora", "midnight", "grid"]);

export async function PATCH(request: Request) {
  const profile = await requestProfile();
  if (!profile) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  const body = await request.json().catch(() => null);
  const accent =
    typeof body?.accent === "string" && accents.has(body.accent)
      ? body.accent
      : (profile.settings?.accent ?? "cyan");
  const wallpaper =
    typeof body?.wallpaper === "string" && wallpapers.has(body.wallpaper)
      ? body.wallpaper
      : (profile.settings?.wallpaper ?? "aurora");
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ settings: { accent, wallpaper } })
    .eq("id", profile.id);
  if (error)
    return NextResponse.json(
      { error: "Einstellungen konnten nicht gespeichert werden." },
      { status: 500 },
    );
  return NextResponse.json({ settings: { accent, wallpaper } });
}
