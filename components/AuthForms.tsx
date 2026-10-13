"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";

function Brand() {
  return (
    <div className="brand-lockup">
      <div className="brand-mark">
        <span>MC</span>
        <i>OS</i>
      </div>
      <div>
        <strong>XLXOS</strong>
        <small>MINECRAFT MOD PLATFORM</small>
      </div>
    </div>
  );
}

function AuthFrame({ children, caption }: { children: React.ReactNode; caption: string }) {
  return (
    <main className="auth-screen">
      <div className="auth-orb auth-orb-one" />
      <div className="auth-orb auth-orb-two" />
      <section className="auth-card">
        <Brand />
        {children}
        <p className="auth-footnote">{caption}</p>
      </section>
      <div className="auth-bottom">
        PRIVATE MOD LIBRARY <span>·</span> ACCESS BY INVITATION
      </div>
    </main>
  );
}

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  async function signIn(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      setError("Anmeldung fehlgeschlagen. Prüfe deine Zugangsdaten.");
      setBusy(false);
      return;
    }
    router.replace("/desktop");
    router.refresh();
  }

  async function resetPassword() {
    setError("");
    setNotice("");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Gib zuerst deine E-Mail-Adresse ein.");
      return;
    }
    const supabase = createClient();
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin;
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${siteUrl}/reset-password`,
    });
    if (resetError) setError("Die Anfrage konnte nicht gesendet werden.");
    else {
      setResetSent(true);
      setNotice("Falls ein Konto existiert, erhältst du eine E-Mail zum Zurücksetzen.");
    }
  }

  return (
    <AuthFrame caption="Dein privater Raum für ausgewählte Minecraft-Mods.">
      <div className="auth-heading">
        <span className="eyebrow">WILLKOMMEN ZURÜCK</span>
        <h1>Dein Desktop wartet.</h1>
        <p>Melde dich mit deinem XLXOS-Konto an.</p>
      </div>
      <form className="auth-form" onSubmit={signIn}>
        <label>
          E-Mail-Adresse
          <input
            autoComplete="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="du@beispiel.de"
            required
          />
        </label>
        <label>
          Passwort
          <input
            autoComplete="current-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Dein Passwort"
            required
          />
        </label>
        {error && (
          <p className="form-message error-message" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="form-message success-message" role="status">
            {notice}
          </p>
        )}
        <button type="submit" className="primary-button full-button" disabled={busy}>
          {busy ? "Anmeldung läuft …" : "Anmelden"}
          <span>↗</span>
        </button>
      </form>
      <button
        type="button"
        className="text-button reset-button"
        onClick={resetPassword}
        disabled={resetSent}
      >
        Passwort vergessen?
      </button>
      <div className="auth-divider">
        <span />
      </div>
      <p className="auth-switch">
        Noch kein Zugang?{" "}
        <Link href="/join">
          Einladungscode einlösen <span>→</span>
        </Link>
      </p>
    </AuthFrame>
  );
}

export function JoinForm({ invitationCode }: { invitationCode: string }) {
  const router = useRouter();
  const [values, setValues] = useState({
    username: "",
    email: "",
    password: "",
    confirm: "",
    code: invitationCode,
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (values.password !== values.confirm) {
      setError("Die Passwörter stimmen nicht überein.");
      return;
    }
    setBusy(true);
    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: values.username,
        email: values.email,
        password: values.password,
        code: values.code,
      }),
    });
    const result = await response.json();
    if (!response.ok) {
      setError(result.error ?? "Das Konto konnte nicht erstellt werden.");
      setBusy(false);
      return;
    }
    const supabase = createClient();
    const { error: loginError } = await supabase.auth.signInWithPassword({
      email: values.email,
      password: values.password,
    });
    if (loginError) {
      router.replace("/login?registered=1");
      return;
    }
    router.replace("/desktop");
    router.refresh();
  }

  return (
    <AuthFrame caption="Zugang gibt es nur mit einem gültigen Einladungscode.">
      <div className="auth-heading">
        <span className="eyebrow">PRIVATE ACCESS</span>
        <h1>Ein Platz für dich.</h1>
        <p>Einladungscode einlösen und Konto erstellen.</p>
      </div>
      <form className="auth-form" onSubmit={submit}>
        <label>
          Einladungscode
          <input
            autoComplete="off"
            value={values.code}
            onChange={(e) => setValues({ ...values, code: e.target.value })}
            placeholder="Dein Einladungscode"
            required
          />
        </label>
        <label>
          Benutzername
          <input
            autoComplete="username"
            minLength={3}
            maxLength={24}
            value={values.username}
            onChange={(e) => setValues({ ...values, username: e.target.value })}
            placeholder="3–24 Zeichen"
            required
          />
        </label>
        <label>
          E-Mail-Adresse
          <input
            autoComplete="email"
            type="email"
            value={values.email}
            onChange={(e) => setValues({ ...values, email: e.target.value })}
            placeholder="du@beispiel.de"
            required
          />
        </label>
        <div className="form-row">
          <label>
            Passwort
            <input
              autoComplete="new-password"
              type="password"
              minLength={10}
              value={values.password}
              onChange={(e) => setValues({ ...values, password: e.target.value })}
              required
            />
          </label>
          <label>
            Wiederholen
            <input
              autoComplete="new-password"
              type="password"
              minLength={10}
              value={values.confirm}
              onChange={(e) => setValues({ ...values, confirm: e.target.value })}
              required
            />
          </label>
        </div>
        {error && (
          <p className="form-message error-message" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="primary-button full-button" disabled={busy}>
          {busy ? "Konto wird erstellt …" : "Konto erstellen"}
          <span>↗</span>
        </button>
      </form>
      <p className="auth-switch auth-switch-bottom">
        Schon registriert?{" "}
        <Link href="/login">
          Anmelden <span>→</span>
        </Link>
      </p>
    </AuthFrame>
  );
}

export function SetupForm() {
  const router = useRouter();
  const [values, setValues] = useState({ setupSecret: "", username: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const response = await fetch("/api/auth/setup-admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(values),
    });
    const result = await response.json();
    if (!response.ok) {
      setError(result.error ?? "Einrichtung fehlgeschlagen.");
      setBusy(false);
      return;
    }
    router.replace("/login?admin-created=1");
  }

  return (
    <AuthFrame caption="Diese einmalige Einrichtung ist mit einem Server-Secret geschützt.">
      <div className="auth-heading">
        <span className="eyebrow">EINMALIGE EINRICHTUNG</span>
        <h1>Administrator anlegen.</h1>
        <p>Nur mit dem Secret aus deiner Serverkonfiguration.</p>
      </div>
      <form className="auth-form" onSubmit={submit}>
        <label>
          Setup-Secret
          <input
            type="password"
            autoComplete="off"
            minLength={24}
            value={values.setupSecret}
            onChange={(e) => setValues({ ...values, setupSecret: e.target.value })}
            required
          />
        </label>
        <label>
          Benutzername
          <input
            autoComplete="username"
            minLength={3}
            maxLength={24}
            value={values.username}
            onChange={(e) => setValues({ ...values, username: e.target.value })}
            required
          />
        </label>
        <label>
          E-Mail-Adresse
          <input
            type="email"
            autoComplete="email"
            value={values.email}
            onChange={(e) => setValues({ ...values, email: e.target.value })}
            required
          />
        </label>
        <label>
          Passwort (mindestens 12 Zeichen)
          <input
            type="password"
            autoComplete="new-password"
            minLength={12}
            value={values.password}
            onChange={(e) => setValues({ ...values, password: e.target.value })}
            required
          />
        </label>
        {error && (
          <p className="form-message error-message" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="primary-button full-button" disabled={busy}>
          {busy ? "Wird eingerichtet …" : "Ersten Admin erstellen"}
          <span>↗</span>
        </button>
      </form>
      <p className="auth-switch auth-switch-bottom">
        <Link href="/login">
          Zur Anmeldung <span>→</span>
        </Link>
      </p>
    </AuthFrame>
  );
}
