"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Accounts from "./Accounts";
import Dashboard from "./Dashboard";
import Documents from "./Documents";
import Questions from "./Questions";

export type Admin = { id: number; email: string; name: string };
type View = "dash" | "docs" | "qs" | "acc";

/** Appel à l'API d'administration. Renvoie null si la session a expiré. */
export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (res.status === 401 && !url.endsWith("/login")) {
    window.dispatchEvent(new Event("ucab-logout"));
    throw new Error("Session expirée, reconnectez-vous.");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || "Une erreur est survenue. Réessayez.");
  }
  return (res.headers.get("content-type")?.includes("json") ? await res.json() : null) as T;
}

export function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 2800);
    return () => clearTimeout(t);
  }, [msg]);
  const node = msg ? (
    <div className="toast" role="status">
      {msg}
    </div>
  ) : null;
  return [node, setMsg] as const;
}

const Icon = {
  dash: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  docs: (
    <>
      <path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z" />
      <path d="M14 3v6h6M8 13h8M8 17h5" />
    </>
  ),
  qs: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 114 2c-.9.6-1.5 1.1-1.5 2.2M12 17h.01" />
    </>
  ),
  acc: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0113 0M16 4.5a3.5 3.5 0 010 7M21.5 20a6.5 6.5 0 00-4-6" />
    </>
  ),
};
const LABELS: Record<View, string> = { dash: "Tableau de bord", docs: "Documents", qs: "Sans réponse", acc: "Comptes" };

export default function AdminApp() {
  const [me, setMe] = useState<Admin | null | undefined>(undefined);

  const refreshMe = useCallback(async () => {
    const res = await fetch("/api/admin/me");
    setMe(res.ok ? await res.json() : null);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lecture de la session au chargement
    void refreshMe();
    const onLogout = () => setMe(null);
    window.addEventListener("ucab-logout", onLogout);
    return () => window.removeEventListener("ucab-logout", onLogout);
  }, [refreshMe]);

  if (me === undefined) return <div className="loading">Chargement…</div>;
  if (me === null) return <Login onDone={refreshMe} />;
  return <Shell me={me} onLogout={() => setMe(null)} />;
}

function Login({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const eyeLabel = show ? "Masquer le mot de passe" : "Afficher le mot de passe";
  return (
    <section className="login">
      <form className="login-card" onSubmit={submit}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="logo" src="/images/logo.png" alt="Logo de l'UCAB" />
        <h1>Espace administration</h1>
        <p className="sub">Assistant virtuel · Centre de Dakar</p>
        <label htmlFor="em">Adresse e-mail</label>
        <input id="em" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <label htmlFor="pw">Mot de passe</label>
        <div className="pwd">
          <input
            id="pw"
            type={show ? "text" : "password"}
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button type="button" className="eye" aria-label={eyeLabel} title={eyeLabel} onClick={() => setShow((s) => !s)}>
            {show ? (
              <svg viewBox="0 0 24 24">
                <path d="M3 3l18 18M10.6 5.1A10.4 10.4 0 0112 5c6.5 0 10 7 10 7a17.6 17.6 0 01-3.2 4.2M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7a9.7 9.7 0 005.4-1.6M9.9 9.9a3 3 0 004.2 4.2" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24">
                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        </div>
        {error && <div className="form-err" role="alert">{error}</div>}
        <button className="btn btn-main" type="submit" disabled={busy}>
          {busy ? "Connexion…" : "Se connecter"}
        </button>
        <a className="forgot" href="#" onClick={(e) => (e.preventDefault(), setForgot((f) => !f))}>
          Mot de passe oublié ?
        </a>
        {forgot && (
          <p className="sub" style={{ marginTop: 10 }}>
            Demandez à l&apos;autre administrateur de retirer puis de recréer votre compte, depuis l&apos;écran « Comptes ».
          </p>
        )}
      </form>
    </section>
  );
}

function Shell({ me, onLogout }: { me: Admin; onLogout: () => void }) {
  const [view, setView] = useState<View>("dash");
  const [mini, setMini] = useState(false);
  const [openCount, setOpenCount] = useState(0);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- préférence gardée dans le navigateur
      if (localStorage.getItem("ucab-admin-mini") === "1") setMini(true);
    } catch {}
    const fromHash = location.hash.slice(1) as View;
    if (fromHash in LABELS) setView(fromHash);
  }, []);

  const go = useCallback((v: View) => {
    setView(v);
    history.replaceState(null, "", `#${v}`);
    scrollTo(0, 0);
  }, []);

  const toggle = () =>
    setMini((m) => {
      try {
        localStorage.setItem("ucab-admin-mini", m ? "0" : "1");
      } catch {}
      return !m;
    });

  const logout = async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    onLogout();
  };

  return (
    <section className={`app${mini ? " mini" : ""}`}>
      <div className="mob-top">
        <div className="b">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/logo.png" alt="" />
        </div>
        <b>Admin</b>
        <button onClick={logout}>Déconnexion</button>
      </div>
      <nav className="side">
        <div className="brand">
          <div className="b">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/images/logo.png" alt="" />
          </div>
          <div className="bt">
            <b>Espace admin</b>Assistant · Dakar
          </div>
          <button
            type="button"
            className="collapse"
            aria-label={mini ? "Ouvrir le menu" : "Fermer le menu"}
            title={mini ? "Ouvrir le menu" : "Fermer le menu"}
            onClick={toggle}
          >
            <svg viewBox="0 0 24 24">
              <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
              <path d="M9 4.5v15M15.5 10l-2 2 2 2" />
            </svg>
          </button>
        </div>
        {(Object.keys(LABELS) as View[]).map((v) => (
          <button key={v} className={`nav${view === v ? " on" : ""}`} title={mini ? LABELS[v] : undefined} onClick={() => go(v)}>
            <svg viewBox="0 0 24 24">{Icon[v]}</svg>
            <span className="lbl">{LABELS[v]}</span>
            {v === "qs" && openCount > 0 && <span className="pill">{openCount}</span>}
          </button>
        ))}
        <div className="user">
          <b>{me.name}</b>
          {me.email}
          <br />
          <button onClick={logout}>Se déconnecter</button>
        </div>
      </nav>
      <main>
        {view === "dash" && <Dashboard go={go} onOpenCount={setOpenCount} />}
        {view === "docs" && <Documents />}
        {view === "qs" && <Questions go={go} onOpenCount={setOpenCount} />}
        {view === "acc" && <Accounts me={me} />}
      </main>
    </section>
  );
}
