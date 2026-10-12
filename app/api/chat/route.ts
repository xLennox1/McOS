import { NextResponse } from "next/server";
import { requestProfile } from "@/lib/http";
import { createAdminClient } from "@/lib/supabase/admin";
import { isStaffRole } from "@/lib/types";

async function publicProfile(id: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .select("id, username, avatar_path, premium")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const avatar = data.avatar_path
    ? await admin.storage.from("profile-avatars").createSignedUrl(data.avatar_path, 3600)
    : null;
  return {
    id: data.id,
    username: data.username,
    premium: data.premium,
    avatarUrl: avatar?.data?.signedUrl ?? null,
  };
}

export async function GET(request: Request) {
  const profile = await requestProfile();
  if (!profile) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  const admin = createAdminClient();

  const [{ data: friendships, error: friendshipsError }, { data: requests, error: requestsError }] =
    await Promise.all([
      admin
        .from("friendships")
        .select("id, user_one, user_two, conversation_id, created_at")
        .or(`user_one.eq.${profile.id},user_two.eq.${profile.id}`)
        .order("created_at", { ascending: false }),
      admin
        .from("friend_requests")
        .select("id, sender_id, recipient_id, status, created_at")
        .or(`sender_id.eq.${profile.id},recipient_id.eq.${profile.id}`)
        .eq("status", "pending")
        .order("created_at", { ascending: false }),
    ]);
  if (friendshipsError || requestsError) {
    return NextResponse.json({ error: "Kontakte konnten nicht geladen werden." }, { status: 500 });
  }

  const friends = await Promise.all(
    (friendships ?? []).map(async (item) => {
      const otherId = item.user_one === profile.id ? item.user_two : item.user_one;
      return { conversationId: item.conversation_id, profile: await publicProfile(otherId) };
    }),
  );
  const pending = await Promise.all(
    (requests ?? []).map(async (item) => {
      const incoming = item.recipient_id === profile.id;
      const otherId = incoming ? item.sender_id : item.recipient_id;
      return {
        id: item.id,
        direction: incoming ? "incoming" : "outgoing",
        created_at: item.created_at,
        profile: await publicProfile(otherId),
      };
    }),
  );

  const { data: ownSupport } = await admin
    .from("conversations")
    .select("id, created_at")
    .eq("kind", "support")
    .eq("created_by", profile.id)
    .maybeSingle();
  if (ownSupport) {
    const { error: membershipError } = await admin
      .from("conversation_members")
      .upsert(
        { conversation_id: ownSupport.id, user_id: profile.id },
        { onConflict: "conversation_id,user_id", ignoreDuplicates: true },
      );
    if (membershipError)
      return NextResponse.json(
        { error: "Support-Zugang konnte nicht geprüft werden." },
        { status: 500 },
      );
  }

  let supportInbox: {
    id: string;
    created_at: string;
    profile: Awaited<ReturnType<typeof publicProfile>>;
  }[] = [];
  if (isStaffRole(profile.role) && new URL(request.url).searchParams.get("support") === "all") {
    const { data: supportRows, error } = await admin
      .from("conversations")
      .select("id, created_at, created_by")
      .eq("kind", "support")
      .order("created_at", { ascending: false })
      .limit(250);
    if (error)
      return NextResponse.json(
        { error: "Support-Anfragen konnten nicht geladen werden." },
        { status: 500 },
      );
    supportInbox = await Promise.all(
      (supportRows ?? []).map(async (item) => ({
        id: item.id,
        created_at: item.created_at,
        profile: await publicProfile(item.created_by),
      })),
    );
  }

  return NextResponse.json({
    friends: friends.filter((item) => item.profile),
    requests: pending.filter((item) => item.profile),
    supportConversation: ownSupport?.id ?? null,
    supportInbox: supportInbox.filter((item) => item.profile),
  });
}

export async function POST(request: Request) {
  const profile = await requestProfile();
  if (!profile) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  const body = await request.json().catch(() => null);
  const action = body?.action;
  const admin = createAdminClient();

  if (action === "friend-request") {
    const targetId = typeof body.userId === "string" ? body.userId.trim().toLowerCase() : "";
    if (!/^[0-9a-f-]{36}$/i.test(targetId) || targetId === profile.id)
      return NextResponse.json(
        { error: "Bitte gib eine gültige fremde Benutzer-ID ein." },
        { status: 400 },
      );
    const { data: target } = await admin
      .from("profiles")
      .select("id, status")
      .eq("id", targetId)
      .maybeSingle();
    if (target?.status !== "active")
      return NextResponse.json(
        { error: "Zu dieser ID wurde kein aktives Konto gefunden." },
        { status: 404 },
      );

    const firstId = profile.id < targetId ? profile.id : targetId;
    const secondId = profile.id < targetId ? targetId : profile.id;
    const { data: friendship } = await admin
      .from("friendships")
      .select("id")
      .eq("user_one", firstId)
      .eq("user_two", secondId)
      .maybeSingle();
    if (friendship)
      return NextResponse.json({ error: "Ihr seid bereits befreundet." }, { status: 409 });

    const { data: existing } = await admin
      .from("friend_requests")
      .select("id, sender_id, recipient_id, status")
      .or(
        `and(sender_id.eq.${profile.id},recipient_id.eq.${targetId}),and(sender_id.eq.${targetId},recipient_id.eq.${profile.id})`,
      )
      .limit(1)
      .maybeSingle();
    if (existing?.status === "pending") {
      return NextResponse.json(
        {
          error:
            existing.sender_id === profile.id
              ? "Die Anfrage ist bereits offen."
              : "Diese Person hat dir bereits eine Anfrage gesendet.",
        },
        { status: 409 },
      );
    }
    const result = existing
      ? await admin
          .from("friend_requests")
          .update({
            sender_id: profile.id,
            recipient_id: targetId,
            status: "pending",
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id)
      : await admin
          .from("friend_requests")
          .insert({ sender_id: profile.id, recipient_id: targetId });
    if (result.error)
      return NextResponse.json(
        { error: "Freundschaftsanfrage konnte nicht gesendet werden." },
        { status: 500 },
      );
    return NextResponse.json({ ok: true });
  }

  if (action === "support") {
    if (isStaffRole(profile.role))
      return NextResponse.json(
        { error: "Admins können Support-Unterhaltungen im Admin Center einsehen." },
        { status: 400 },
      );
    const { data: existing } = await admin
      .from("conversations")
      .select("id")
      .eq("kind", "support")
      .eq("created_by", profile.id)
      .maybeSingle();
    if (existing) return NextResponse.json({ id: existing.id });
    const { data, error } = await admin
      .from("conversations")
      .insert({ kind: "support", created_by: profile.id })
      .select("id")
      .single();
    if (error) {
      const { data: raced } = await admin
        .from("conversations")
        .select("id")
        .eq("kind", "support")
        .eq("created_by", profile.id)
        .maybeSingle();
      if (raced) return NextResponse.json({ id: raced.id });
      return NextResponse.json(
        { error: "Support-Chat konnte nicht geöffnet werden." },
        { status: 500 },
      );
    }
    const { error: memberError } = await admin
      .from("conversation_members")
      .insert({ conversation_id: data.id, user_id: profile.id });
    if (memberError)
      return NextResponse.json(
        { error: "Support-Chat konnte nicht eingerichtet werden." },
        { status: 500 },
      );
    return NextResponse.json({ id: data.id });
  }

  return NextResponse.json({ error: "Unbekannte Chat-Aktion." }, { status: 400 });
}

export async function PATCH(request: Request) {
  const profile = await requestProfile();
  if (!profile) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  const body = await request.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  const decision = body?.decision;
  if (!id || !["accept", "reject"].includes(decision))
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });

  const admin = createAdminClient();
  if (decision === "accept") {
    const { data: conversationId, error } = await admin.rpc("accept_friend_request", {
      p_request_id: id,
      p_actor_id: profile.id,
    });
    if (error || !conversationId)
      return NextResponse.json(
        { error: "Anfrage konnte nicht angenommen werden." },
        { status: 409 },
      );
    return NextResponse.json({ conversationId });
  }

  const { data, error } = await admin
    .from("friend_requests")
    .update({ status: "rejected", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("recipient_id", profile.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (error || !data)
    return NextResponse.json({ error: "Anfrage konnte nicht abgelehnt werden." }, { status: 409 });
  return NextResponse.json({ ok: true });
}
