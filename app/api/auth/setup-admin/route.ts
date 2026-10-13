import { timingSafeEqual as cryptoTimingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const setupSecret = process.env.XLXOS_SETUP_SECRET;
  if (!setupSecret || setupSecret.length < 24) {
    return NextResponse.json(
      { error: "Die Admin-Ersteinrichtung ist nicht aktiviert." },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => null);
  if (typeof body?.setupSecret !== "string" || body.setupSecret.length < 24) {
    return NextResponse.json({ error: "Einrichtungstoken ist ungültig." }, { status: 400 });
  }
  const supplied = Buffer.from(body.setupSecret);
  const expected = Buffer.from(setupSecret);
  if (supplied.length !== expected.length || !cryptoTimingSafeEqual(supplied, expected)) {
    return NextResponse.json({ error: "Einrichtungstoken ist ungültig." }, { status: 403 });
  }

  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    !/^[a-zA-Z0-9_-]{3,24}$/.test(username) ||
    password.length < 12 ||
    password.length > 128
  ) {
    return NextResponse.json(
      { error: "Bitte prüfe E-Mail, Benutzername und Passwort (mindestens 12 Zeichen)." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const { data: current } = await admin.from("profiles").select("id").eq("role", "admin").limit(1);
  if (current?.length) {
    return NextResponse.json(
      { error: "Ein Administrator ist bereits eingerichtet." },
      { status: 409 },
    );
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username },
  });
  if (error || !data.user) {
    return NextResponse.json(
      { error: "Das Administratorkonto konnte nicht erstellt werden." },
      { status: 400 },
    );
  }
  const { data: promoted, error: promoteError } = await admin.rpc("bootstrap_first_admin", {
    p_user_id: data.user.id,
  });
  if (promoteError || !promoted) {
    await admin.auth.admin.deleteUser(data.user.id);
    return NextResponse.json(
      { error: "Die Ersteinrichtung ist bereits abgeschlossen oder fehlgeschlagen." },
      { status: 409 },
    );
  }
  await admin.from("audit_log").insert({
    actor_id: data.user.id,
    action: "admin.bootstrapped",
    entity_type: "profile",
    entity_id: data.user.id,
  });
  return NextResponse.json({ ok: true });
}
