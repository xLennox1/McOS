"use client";

import { Check, Copy, Mail, MessageCircle, Phone, Send, UserPlus, Video } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isStaffRole, type Profile } from "@/lib/types";

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Die Aktion ist fehlgeschlagen.");
  return result as T;
}

type PublicProfile = {
  id: string;
  username: string;
  premium: boolean;
  avatarUrl: string | null;
};
type ChatData = {
  friends: { conversationId: string; profile: PublicProfile }[];
  requests: {
    id: string;
    direction: "incoming" | "outgoing";
    created_at: string;
    profile: PublicProfile;
  }[];
  supportConversation: string | null;
  supportInbox: { id: string; created_at: string; profile: PublicProfile }[];
};
type ChatMessage = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  sender: { id: string; username: string; avatarUrl: string | null } | null;
};

export function ChatApp({
  profile,
  supportOnly = false,
}: {
  profile: Profile;
  supportOnly?: boolean;
}) {
  const [data, setData] = useState<ChatData>({
    friends: [],
    requests: [],
    supportConversation: null,
    supportInbox: [],
  });
  const [selected, setSelected] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [friendId, setFriendId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [idCopied, setIdCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const isAdmin = isStaffRole(profile.role);

  const load = useCallback(async () => {
    try {
      const next = await api<ChatData>(`/api/chat${isAdmin ? "?support=all" : ""}`);
      setData(next);
      setError("");
      setSelected((current) => {
        if (
          current &&
          (next.friends.some((item) => item.conversationId === current) ||
            next.supportInbox.some((item) => item.id === current) ||
            next.supportConversation === current)
        )
          return current;
        if (supportOnly) return next.supportInbox[0]?.id ?? "";
        return (
          next.friends[0]?.conversationId ??
          next.supportConversation ??
          next.supportInbox[0]?.id ??
          ""
        );
      });
    } catch (reason) {
      setError((reason as Error).message);
    }
  }, [isAdmin, supportOnly]);

  const loadMessages = useCallback(async (conversationId: string) => {
    try {
      setMessages(await api<ChatMessage[]>(`/api/chat/${conversationId}/messages`));
    } catch (reason) {
      setError((reason as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
    const client = createClient();
    const channel = client
      .channel(`community-${profile.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "friend_requests",
          filter: `recipient_id=eq.${profile.id}`,
        },
        () => void load(),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "friend_requests",
          filter: `sender_id=eq.${profile.id}`,
        },
        () => void load(),
      )
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, () => {
        void load();
        if (selected) void loadMessages(selected);
      })
      .subscribe();
    const fallback = window.setInterval(() => {
      void load();
      if (selected) void loadMessages(selected);
    }, 8000);
    return () => {
      window.clearInterval(fallback);
      void client.removeChannel(channel);
    };
  }, [load, loadMessages, profile.id, selected]);

  useEffect(() => {
    if (selected) void loadMessages(selected);
    else setMessages([]);
  }, [loadMessages, selected]);

  async function action(work: () => Promise<void>, success: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
      setNotice(success);
      await load();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function addFriend(event: FormEvent) {
    event.preventDefault();
    await action(async () => {
      await api("/api/chat", {
        method: "POST",
        body: JSON.stringify({ action: "friend-request", userId: friendId }),
      });
      setFriendId("");
    }, "Freundschaftsanfrage gesendet.");
  }

  async function decideRequest(id: string, decision: "accept" | "reject") {
    await action(
      async () => {
        const result = await api<{ conversationId?: string }>("/api/chat", {
          method: "PATCH",
          body: JSON.stringify({ id, decision }),
        });
        if (result.conversationId) setSelected(result.conversationId);
      },
      decision === "accept" ? "Freundschaft bestätigt." : "Anfrage abgelehnt.",
    );
  }

  async function openSupport() {
    await action(async () => {
      const result = await api<{ id: string }>("/api/chat", {
        method: "POST",
        body: JSON.stringify({ action: "support" }),
      });
      setSelected(result.id);
    }, "Support-Chat geöffnet.");
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    if (!selected || !draft.trim()) return;
    setBusy(true);
    setError("");
    try {
      await api(`/api/chat/${selected}/messages`, {
        method: "POST",
        body: JSON.stringify({ body: draft }),
      });
      setDraft("");
      await loadMessages(selected);
      await load();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const activeFriend = data.friends.find((item) => item.conversationId === selected);
  const activeSupport = data.supportInbox.find((item) => item.id === selected);
  const currentSupport = selected === data.supportConversation;
  const title =
    activeFriend?.profile.username ??
    (activeSupport
      ? `${activeSupport.profile.username} · Support`
      : currentSupport
        ? "MC OS Support"
        : "Wähle einen Chat");
  async function copyUserId() {
    try {
      await navigator.clipboard.writeText(profile.id);
      setIdCopied(true);
      window.setTimeout(() => setIdCopied(false), 1800);
    } catch {
      setError(
        "Die Benutzer-ID konnte nicht kopiert werden. Du kannst sie markieren und kopieren.",
      );
    }
  }
  const list = (
    <aside className="community-sidebar">
      {!supportOnly && (
        <section className="chat-user-id">
          <span>DEINE CHAT-ID</span>
          <code>{profile.id}</code>
          <button type="button" onClick={() => void copyUserId()}>
            {idCopied ? <Check size={13} /> : <Copy size={13} />}
            {idCopied ? "Kopiert" : "ID kopieren"}
          </button>
        </section>
      )}
      {!supportOnly && !isAdmin && (
        <form className="friend-add-form" onSubmit={addFriend}>
          <label htmlFor="friend-id">Freund über Benutzer-ID hinzufügen</label>
          <div>
            <input
              id="friend-id"
              value={friendId}
              onChange={(event) => setFriendId(event.target.value)}
              placeholder="UUID des Mitglieds"
              required
            />
            <button type="submit" disabled={busy} aria-label="Anfrage senden">
              <UserPlus size={15} />
            </button>
          </div>
        </form>
      )}
      {!supportOnly && data.requests.length > 0 && (
        <section className="community-list-section">
          <h3>Anfragen</h3>
          {data.requests.map((request) => (
            <div className="friend-request-item" key={request.id}>
              <ProfileAvatar profile={request.profile} />
              <div>
                <strong>{request.profile.username}</strong>
                <small>
                  {request.direction === "incoming" ? "Möchte dein Freund sein" : "Ausstehend"}
                </small>
              </div>
              {request.direction === "incoming" && (
                <>
                  <button
                    onClick={() => void decideRequest(request.id, "accept")}
                    aria-label="Annehmen"
                  >
                    <Check size={14} />
                  </button>
                  <button
                    onClick={() => void decideRequest(request.id, "reject")}
                    aria-label="Ablehnen"
                  >
                    ×
                  </button>
                </>
              )}
            </div>
          ))}
        </section>
      )}
      {!supportOnly && !isAdmin && (
        <section className="community-list-section">
          <h3>Freunde</h3>
          {data.friends.map((friend) => (
            <button
              className={`community-contact ${selected === friend.conversationId ? "selected" : ""}`}
              key={friend.conversationId}
              onClick={() => setSelected(friend.conversationId)}
            >
              <ProfileAvatar profile={friend.profile} />
              <span>
                <strong>{friend.profile.username}</strong>
                <small>{friend.profile.premium ? "PRO-Mitglied" : "MC OS Mitglied"}</small>
              </span>
            </button>
          ))}
          {data.friends.length === 0 && <p className="community-empty">Noch keine Freunde.</p>}
        </section>
      )}
      {!isAdmin && (
        <button
          className={`community-contact support-contact ${currentSupport ? "selected" : ""}`}
          onClick={() =>
            data.supportConversation ? setSelected(data.supportConversation) : void openSupport()
          }
        >
          <span className="community-system-avatar">
            <MessageCircle size={15} />
          </span>
          <span>
            <strong>MC OS Support</strong>
            <small>Vertraulich mit Admins</small>
          </span>
        </button>
      )}
      {isAdmin && (
        <section className="community-list-section support-inbox-list">
          <h3>Support-Anfragen</h3>
          {data.supportInbox.map((ticket) => (
            <button
              className={`community-contact ${selected === ticket.id ? "selected" : ""}`}
              key={ticket.id}
              onClick={() => setSelected(ticket.id)}
            >
              <ProfileAvatar profile={ticket.profile} />
              <span>
                <strong>{ticket.profile.username}</strong>
                <small>{new Date(ticket.created_at).toLocaleDateString("de-DE")}</small>
              </span>
            </button>
          ))}
          {data.supportInbox.length === 0 && (
            <p className="community-empty">Noch keine Anfragen.</p>
          )}
        </section>
      )}
    </aside>
  );

  return (
    <div className="community-app">
      {supportOnly ? (
        <div className="support-console">
          <header className="community-heading">
            <div>
              <span className="app-eyebrow">ADMIN CENTER / SUPPORT</span>
              <h2>Support-Chat</h2>
              <p>Jeder aktive Admin kann alle Support-Unterhaltungen einsehen und beantworten.</p>
            </div>
          </header>
          <div className="community-layout">
            {list}
            <ChatPane
              title={title}
              selected={selected}
              messages={messages}
              draft={draft}
              setDraft={setDraft}
              sendMessage={sendMessage}
              busy={busy}
              ownId={profile.id}
            />
          </div>
        </div>
      ) : (
        <>
          <header className="community-heading">
            <div>
              <span className="app-eyebrow">
                {isAdmin ? "ADMIN CENTER" : "COMMUNITY / LIVE CHAT"}
              </span>
              <h2>{isAdmin ? "Support & Chats" : "Community-Chat"}</h2>
            </div>
            <span className="live-indicator">
              <i /> LIVE
            </span>
          </header>
          {error && (
            <p className="inline-error" role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className="inline-success" role="status">
              {notice}
            </p>
          )}
          <div className="community-layout">
            {list}
            <ChatPane
              title={title}
              selected={selected}
              messages={messages}
              draft={draft}
              setDraft={setDraft}
              sendMessage={sendMessage}
              busy={busy}
              ownId={profile.id}
            />
          </div>
        </>
      )}
    </div>
  );
}

function ProfileAvatar({ profile }: { profile: Pick<PublicProfile, "username" | "avatarUrl"> }) {
  return profile.avatarUrl ? (
    <span
      className="community-avatar"
      role="img"
      aria-label={`${profile.username} Profilbild`}
      style={{ backgroundImage: `url(${JSON.stringify(profile.avatarUrl)})` }}
    />
  ) : (
    <span className="community-avatar community-avatar-fallback">
      {profile.username.slice(0, 1).toUpperCase()}
    </span>
  );
}

function ChatPane({
  title,
  selected,
  messages,
  draft,
  setDraft,
  sendMessage,
  busy,
  ownId,
}: {
  title: string;
  selected: string;
  messages: ChatMessage[];
  draft: string;
  setDraft: (value: string) => void;
  sendMessage: (event: FormEvent) => void;
  busy: boolean;
  ownId: string;
}) {
  function openCall(video: boolean) {
    const room = `MCOS-${selected.replace(/[^a-zA-Z0-9]/g, "")}`;
    const startMuted = video ? "false" : "true";
    window.open(
      `https://meet.jit.si/${room}#config.startWithVideoMuted=${startMuted}&config.startWithAudioMuted=false`,
      "_blank",
      "noopener,noreferrer",
    );
  }

  return (
    <section className="chat-pane">
      {selected ? (
        <>
          <header>
            <span className="community-title-avatar">
              <MessageCircle size={15} />
            </span>
            <div>
              <strong>{title}</strong>
              <small>Live-Chat · Anrufe über Jitsi</small>
            </div>
            <div className="chat-call-actions">
              <button
                type="button"
                onClick={() => openCall(false)}
                aria-label="Sprachanruf über Jitsi starten"
                title="Sprachanruf"
              >
                <Phone size={15} />
              </button>
              <button
                type="button"
                onClick={() => openCall(true)}
                aria-label="Videoanruf über Jitsi starten"
                title="Videoanruf"
              >
                <Video size={15} />
              </button>
            </div>
          </header>
          <div className="chat-messages" aria-live="polite">
            {messages.length === 0 && (
              <p className="community-empty">Noch keine Nachrichten. Schreib die erste.</p>
            )}
            {messages.map((message) => (
              <article
                className={`chat-message ${message.sender_id === ownId ? "mine" : ""}`}
                key={message.id}
              >
                <div className="chat-message-meta">
                  <strong>{message.sender?.username ?? "Gelöschtes Konto"}</strong>
                  <time>
                    {new Date(message.created_at).toLocaleString("de-DE", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </time>
                </div>
                <p>{message.body}</p>
              </article>
            ))}
          </div>
          <form className="chat-compose" onSubmit={sendMessage}>
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              maxLength={2000}
              rows={2}
              placeholder="Nachricht schreiben …"
            />
            <button
              className="admin-action-button"
              disabled={busy || !draft.trim()}
              aria-label="Nachricht senden"
            >
              <Send size={15} />
            </button>
          </form>
        </>
      ) : (
        <div className="chat-empty-panel">
          <MessageCircle size={29} />
          <strong>Deine Chats</strong>
          <span>Wähle links einen Chat oder sende eine Freundschaftsanfrage.</span>
        </div>
      )}
    </section>
  );
}

type MailMessage = {
  id: string;
  sender_name: string;
  subject: string;
  body: string;
  created_at: string;
  read_at: string | null;
};

export function MailApp({ profile }: { profile: Profile }) {
  const [messages, setMessages] = useState<MailMessage[]>([]);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const next = await api<MailMessage[]>("/api/mail");
      setMessages(next);
      setSelected((current) =>
        current && next.some((item) => item.id === current) ? current : (next[0]?.id ?? ""),
      );
      setError("");
    } catch (reason) {
      setError((reason as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
    const client = createClient();
    const channel = client
      .channel(`mail-${profile.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "mailbox_messages",
          filter: `recipient_id=eq.${profile.id}`,
        },
        () => void load(),
      )
      .subscribe();
    const timer = window.setInterval(() => void load(), 15000);
    return () => {
      window.clearInterval(timer);
      void client.removeChannel(channel);
    };
  }, [load, profile.id]);

  async function openMessage(message: MailMessage) {
    setSelected(message.id);
    if (message.read_at) return;
    try {
      await api("/api/mail", { method: "PATCH", body: JSON.stringify({ id: message.id }) });
      setMessages((current) =>
        current.map((item) =>
          item.id === message.id ? { ...item, read_at: new Date().toISOString() } : item,
        ),
      );
    } catch (reason) {
      setError((reason as Error).message);
    }
  }

  const current = messages.find((item) => item.id === selected);
  return (
    <div className="mail-app">
      <header className="community-heading">
        <div>
          <span className="app-eyebrow">INTERNES POSTFACH</span>
          <h2>McOS-Mail</h2>
        </div>
        <span className="subtle-count">
          {messages.filter((item) => !item.read_at).length} UNGELESEN
        </span>
      </header>
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      <div className="mail-layout">
        <nav className="mail-list" aria-label="Postfach">
          {messages.map((message) => (
            <button
              className={`mail-list-item ${selected === message.id ? "selected" : ""} ${message.read_at ? "" : "unread"}`}
              key={message.id}
              onClick={() => void openMessage(message)}
            >
              <span className="mail-sender-icon">
                <Mail size={14} />
              </span>
              <span>
                <strong>{message.sender_name}</strong>
                <b>{message.subject}</b>
                <small>{new Date(message.created_at).toLocaleDateString("de-DE")}</small>
              </span>
            </button>
          ))}
          {messages.length === 0 && <p className="community-empty">Dein Postfach ist noch leer.</p>}
        </nav>
        <article className="mail-message-view">
          {current ? (
            <>
              <span className="app-eyebrow">VON {current.sender_name.toUpperCase()}</span>
              <h3>{current.subject}</h3>
              <time>
                {new Date(current.created_at).toLocaleString("de-DE", {
                  dateStyle: "long",
                  timeStyle: "short",
                })}
              </time>
              <p>{current.body}</p>
            </>
          ) : (
            <div className="chat-empty-panel">
              <Mail size={27} />
              <strong>McOS-Mail</strong>
              <span>Wähle links eine Nachricht aus.</span>
            </div>
          )}
        </article>
      </div>
    </div>
  );
}

export function AdminBroadcastApp() {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function send(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await api<{ sent: number }>("/api/admin/mail", {
        method: "POST",
        body: JSON.stringify({ subject, body }),
      });
      setMessage(`Systemnachricht an ${result.sent} aktive Konten gesendet.`);
      setSubject("");
      setBody("");
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="admin-section admin-broadcast">
      <div className="admin-section-heading">
        <div>
          <h3>Systemnachricht verfassen</h3>
          <p>
            Die Nachricht erscheint im internen McOS-Mail-Postfach aller aktiven Mitglieder. Es
            werden keine externen E-Mails versendet.
          </p>
        </div>
        <Mail size={18} />
      </div>
      <form className="admin-form" onSubmit={send}>
        <label>
          Betreff
          <input
            value={subject}
            maxLength={160}
            onChange={(event) => setSubject(event.target.value)}
            required
          />
        </label>
        <label>
          Nachricht
          <textarea
            value={body}
            maxLength={5000}
            rows={7}
            onChange={(event) => setBody(event.target.value)}
            required
          />
        </label>
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="inline-success" role="status">
            {message}
          </p>
        )}
        <button className="admin-action-button" disabled={busy}>
          {busy ? "Sendet …" : "An Postfächer senden"} <Mail size={14} />
        </button>
      </form>
    </section>
  );
}
