import { NextResponse } from "next/server";
import { requestProfile } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  const profile = await requestProfile();
  if (!profile) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  const admin = createAdminClient();
  const { data: welcome, error: welcomeReadError } = await admin
    .from("mailbox_messages")
    .select("id")
    .eq("recipient_id", profile.id)
    .eq("subject", "Willkommen bei XLXOS")
    .limit(1)
    .maybeSingle();
  if (welcomeReadError)
    return NextResponse.json(
      { error: "Willkommensnachricht konnte nicht geprüft werden." },
      { status: 500 },
    );
  if (!welcome) {
    const { error: welcomeInsertError } = await admin.from("mailbox_messages").insert({
      recipient_id: profile.id,
      sender_name: "XLXOS",
      subject: "Willkommen bei XLXOS",
      body: "Dein Zugang ist eingerichtet. Entdecke die Mod-Bibliothek, richte deinen Desktop ein und finde andere Mitglieder über ihre Benutzer-ID.",
    });
    if (welcomeInsertError)
      return NextResponse.json(
        { error: "Willkommensnachricht konnte nicht erstellt werden." },
        { status: 500 },
      );
  }
  const { data, error } = await admin
    .from("mailbox_messages")
    .select("id, sender_name, subject, body, created_at, read_at")
    .eq("recipient_id", profile.id)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error)
    return NextResponse.json({ error: "XLXOS-Mail konnte nicht geladen werden." }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function PATCH(request: Request) {
  const profile = await requestProfile();
  if (!profile) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  const body = await request.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  if (!/^[0-9a-f-]{36}$/i.test(id))
    return NextResponse.json({ error: "Ungültige Nachricht." }, { status: 400 });
  const admin = createAdminClient();
  const { error } = await admin
    .from("mailbox_messages")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .eq("recipient_id", profile.id);
  if (error)
    return NextResponse.json(
      { error: "Nachricht konnte nicht als gelesen markiert werden." },
      { status: 500 },
    );
  return NextResponse.json({ ok: true });
}
