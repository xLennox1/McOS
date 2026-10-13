"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, Suspense, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const code = params.get("code");
    if (!code) {
      setError("Der Link ist ungültig oder abgelaufen. Fordere einen neuen Link an.");
      return;
    }
    createClient()
      .auth.exchangeCodeForSession(code)
      .then(({ error: exchangeError }) => {
        if (exchangeError)
          setError("Der Link ist ungültig oder abgelaufen. Fordere einen neuen Link an.");
        else setReady(true);
      });
  }, [params]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const { error: updateError } = await createClient().auth.updateUser({ password });
    if (updateError) {
      setError("Passwort konnte nicht geändert werden. Prüfe die Mindestlänge.");
      setBusy(false);
      return;
    }
    await createClient().auth.signOut();
    router.replace("/login?password-reset=1");
  }

  return (
    <main className="auth-screen">
      <section className="auth-card">
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
        <div className="auth-heading">
          <span className="eyebrow">KONTO-SICHERHEIT</span>
          <h1>Neues Passwort.</h1>
          <p>Wähle ein neues Passwort für deinen Zugang.</p>
        </div>
        {ready ? (
          <form className="auth-form" onSubmit={submit}>
            <label>
              Neues Passwort
              <input
                type="password"
                autoComplete="new-password"
                minLength={10}
                maxLength={128}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </label>
            {error && (
              <p className="form-message error-message" role="alert">
                {error}
              </p>
            )}
            <button type="submit" className="primary-button full-button" disabled={busy}>
              {busy ? "Wird gespeichert …" : "Passwort speichern"}
            </button>
          </form>
        ) : (
          <p className="form-message error-message" role="alert">
            {error || "Sicherer Link wird geprüft …"}
          </p>
        )}
        <p className="auth-switch auth-switch-bottom">
          <Link href="/login">
            Zur Anmeldung <span>→</span>
          </Link>
        </p>
      </section>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <main className="auth-screen">
          <div className="auth-card">Sicherer Link wird geprüft …</div>
        </main>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
