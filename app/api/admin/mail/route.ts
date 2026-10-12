import { NextResponse } from "next/server";
import { requestAdmin } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const actor = await requestAdmin();
  if (!actor) return NextResponse.json({ error: "Keine Administratorrechte." }, { status: 403 });
  const body = await request.json().catch(() => null);
  const subject = typeof body?.subject === "string" ? body.subject.trim() : "";
  const message = typeof body?.body === "string" ? body.body.trim() : "";
  if (subject.length < 1 || subject.length > 160 || message.length < 1 || message.length > 5000)
    return NextResponse.json(
      {
        error:
          "Betreff und Nachricht dürfen nicht leer sein und müssen innerhalb der Längenlimits liegen.",
      },
      { status: 400 },
    );
  const admin = createAdminClient();
  const { data: recipients, error: recipientError } = await admin
    .from("profiles")
    .select("id")
    .eq("status", "active");
  if (recipientError)
    return NextResponse.json({ error: "Empfänger konnten nicht geladen werden." }, { status: 500 });
  if (!recipients?.length) return NextResponse.json({ sent: 0 });

  const { error } = await admin.from("mailbox_messages").insert(
    recipients.map((recipient) => ({
      recipient_id: recipient.id,
      sender_id: actor.id,
      sender_name: "MC OS Administration",
      subject,
      body: message,
    })),
  );
  if (error)
    return NextResponse.json(
      { error: "Systemnachricht konnte nicht versendet werden." },
      { status: 500 },
    );
  await admin.from("audit_log").insert({
    actor_id: actor.id,
    action: "mail.broadcast",
    entity_type: "mailbox_message",
    details: { subject, recipient_count: recipients.length },
  });
  return NextResponse.json({ sent: recipients.length });
}
