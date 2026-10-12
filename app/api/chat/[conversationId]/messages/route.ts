import { NextResponse } from "next/server";
import { requestProfile } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/admin";
import { isStaffRole } from "@/lib/types";

type RouteContext = { params: Promise<{ conversationId: string }> };

async function canAccess(conversationId: string, userId: string, role: string) {
  const admin = createAdminClient();
  const { data: conversation } = await admin
    .from("conversations")
    .select("id, kind, created_by")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conversation) return false;
  if (conversation.kind === "support" && isStaffRole(role)) return true;
  const { data } = await admin
    .from("conversation_members")
    .select("user_id")
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(data);
}

export async function GET(_request: Request, context: RouteContext) {
  const profile = await requestProfile();
  if (!profile) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  const { conversationId } = await context.params;
  if (!(await canAccess(conversationId, profile.id, profile.role)))
    return NextResponse.json({ error: "Kein Zugriff auf diesen Chat." }, { status: 403 });

  const admin = createAdminClient();
  const { data: messages, error } = await admin
    .from("chat_messages")
    .select("id, conversation_id, sender_id, body, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(500);
  if (error)
    return NextResponse.json(
      { error: "Nachrichten konnten nicht geladen werden." },
      { status: 500 },
    );
  const senderIds = [...new Set((messages ?? []).map((message) => message.sender_id))];
  const { data: senders } = senderIds.length
    ? await admin.from("profiles").select("id, username, avatar_path").in("id", senderIds)
    : { data: [] };
  const sendersById = new Map(
    await Promise.all(
      (senders ?? []).map(async (sender) => {
        const avatar = sender.avatar_path
          ? await admin.storage.from("profile-avatars").createSignedUrl(sender.avatar_path, 3600)
          : null;
        return [
          sender.id,
          { id: sender.id, username: sender.username, avatarUrl: avatar?.data?.signedUrl ?? null },
        ] as const;
      }),
    ),
  );
  return NextResponse.json(
    (messages ?? []).map((message) => ({
      ...message,
      sender: sendersById.get(message.sender_id) ?? null,
    })),
  );
}

export async function POST(request: Request, context: RouteContext) {
  const profile = await requestProfile();
  if (!profile) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  const { conversationId } = await context.params;
  if (!(await canAccess(conversationId, profile.id, profile.role)))
    return NextResponse.json({ error: "Kein Zugriff auf diesen Chat." }, { status: 403 });

  const body = await request.json().catch(() => null);
  const message = typeof body?.body === "string" ? body.body.trim() : "";
  if (!message || message.length > 2000)
    return NextResponse.json(
      { error: "Nachrichten müssen 1 bis 2000 Zeichen lang sein." },
      { status: 400 },
    );

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("chat_messages")
    .insert({ conversation_id: conversationId, sender_id: profile.id, body: message })
    .select("id, conversation_id, sender_id, body, created_at")
    .single();
  if (error)
    return NextResponse.json({ error: "Nachricht konnte nicht gesendet werden." }, { status: 500 });
  return NextResponse.json({
    ...data,
    sender: { id: profile.id, username: profile.username, avatarUrl: null },
  });
}
