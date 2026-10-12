import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { requestAdmin } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET() {
  if (!(await requestAdmin()))
    return NextResponse.json({ error: "Keine Administratorrechte." }, { status: 403 });
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("invitations")
    .select("id, code_hash, expires_at, used_at, disabled, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error)
    return NextResponse.json(
      { error: "Einladungen konnten nicht geladen werden." },
      { status: 500 },
    );
  return NextResponse.json(
    (data ?? []).map((item) => ({
      id: item.id,
      reference: item.code_hash.slice(0, 10),
      expires_at: item.expires_at,
      used_at: item.used_at,
      disabled: item.disabled,
      created_at: item.created_at,
    })),
  );
}

export async function POST(request: Request) {
  const profile = await requestAdmin();
  if (!profile) return NextResponse.json({ error: "Keine Administratorrechte." }, { status: 403 });
  const body = await request.json().catch(() => null);
  const days = Number(body?.expiresInDays ?? 30);
  if (!Number.isInteger(days) || days < 1 || days > 90) {
    return NextResponse.json(
      { error: "Die Gültigkeit muss zwischen 1 und 90 Tagen liegen." },
      { status: 400 },
    );
  }

  const code = randomBytes(24).toString("base64url");
  const codeHash = createHash("sha256").update(code).digest("hex");
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("invitations")
    .insert({
      code_hash: codeHash,
      created_by: profile.id,
      expires_at: new Date(Date.now() + days * 86_400_000).toISOString(),
    })
    .select("id, expires_at, created_at")
    .single();
  if (error)
    return NextResponse.json(
      { error: "Einladungscode konnte nicht erstellt werden." },
      { status: 500 },
    );
  await admin.from("audit_log").insert({
    actor_id: profile.id,
    action: "invitation.created",
    entity_type: "invitation",
    entity_id: data.id,
  });
  return NextResponse.json({ ...data, code });
}
