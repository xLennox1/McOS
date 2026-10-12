import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const username = typeof body?.username === "string" ? body.username.trim() : "";
  const code = typeof body?.code === "string" ? body.code.trim() : "";

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { error: "Bitte gib eine gültige E-Mail-Adresse ein." },
      { status: 400 },
    );
  }
  if (password.length < 10 || password.length > 128) {
    return NextResponse.json(
      { error: "Das Passwort muss 10 bis 128 Zeichen lang sein." },
      { status: 400 },
    );
  }
  if (!/^[a-zA-Z0-9_-]{3,24}$/.test(username)) {
    return NextResponse.json(
      { error: "Der Benutzername muss 3–24 Zeichen lang sein (Buchstaben, Zahlen, _ oder -)." },
      { status: 400 },
    );
  }
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(code)) {
    return NextResponse.json(
      { error: "Der Einladungscode ist ungültig oder abgelaufen." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const codeHash = createHash("sha256").update(code).digest("hex");
  const { data: invitation, error: invitationError } = await admin
    .from("invitations")
    .select("id")
    .eq("code_hash", codeHash)
    .is("used_by", null)
    .eq("disabled", false)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (invitationError || !invitation) {
    return NextResponse.json(
      { error: "Der Einladungscode ist ungültig, abgelaufen oder bereits verwendet." },
      { status: 400 },
    );
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username },
  });
  if (createError || !created.user) {
    return NextResponse.json(
      {
        error: createError?.message.includes("already")
          ? "Für diese E-Mail-Adresse besteht bereits ein Konto."
          : "Das Konto konnte nicht erstellt werden.",
      },
      { status: 400 },
    );
  }

  const { data: redeemed, error: redeemError } = await admin.rpc("redeem_invitation", {
    p_user_id: created.user.id,
    p_code_hash: codeHash,
  });
  if (redeemError || !redeemed) {
    await admin.auth.admin.deleteUser(created.user.id);
    return NextResponse.json(
      { error: "Der Einladungscode ist ungültig, abgelaufen oder bereits verwendet." },
      { status: 400 },
    );
  }
  await admin.from("audit_log").insert({
    actor_id: created.user.id,
    action: "account.created",
    entity_type: "profile",
    entity_id: created.user.id,
  });
  return NextResponse.json({ ok: true });
}
