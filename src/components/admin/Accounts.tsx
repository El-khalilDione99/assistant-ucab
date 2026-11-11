"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { api, useToast, type Admin } from "./AdminApp";

type Account = { id: number; email: string; name: string; created_at: number };

export default function Accounts({ me }: { me: Admin }) {
  const [data, setData] = useState<{ accounts: Account[]; max: number } | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useToast();

  const load = useCallback(async () => setData(await api("/api/admin/accounts")), []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- chargement des données depuis le serveur
    load().catch((e: Error) => setError(e.message));
  }, [load]);

  const remove = async (id: number) => {
    try {
      await api(`/api/admin/accounts/${id}`, { method: "DELETE" });
      setConfirmId(null);
      setToast("Compte retiré.");
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <>
      <div className="head">
        <div>
          <h2>Comptes</h2>
          <p>Deux comptes au maximum peuvent gérer l&apos;assistant.</p>
        </div>
      </div>
      {error && <div className="form-err" role="alert" style={{ marginBottom: 14 }}>{error}</div>}

      <div className="card" style={{ maxWidth: 680, marginBottom: 16 }}>
        <h3>Accès</h3>
        {data === null ? (
          <p className="empty">Chargement…</p>
        ) : (
          <ul className="mini-list">
            {data.accounts.map((a) => (
              <li key={a.id} style={{ alignItems: "center" }}>
                <span>
                  <b>{a.name}</b>
                  <br />
                  <span style={{ color: "var(--mute)" }}>
                    {a.email}
                    {a.id === me.id && " · vous"}
                  </span>
                </span>
                {a.id !== me.id &&
                  (confirmId === a.id ? (
                    <span style={{ display: "flex", gap: 8 }}>
                      <button className="btn btn-ghost" onClick={() => setConfirmId(null)}>Annuler</button>
                      <button className="btn btn-danger" onClick={() => remove(a.id)}>Retirer</button>
                    </span>
                  ) : (
                    <button className="btn btn-ghost" onClick={() => setConfirmId(a.id)}>Retirer</button>
                  ))}
              </li>
            ))}
          </ul>
        )}
        {data && data.accounts.length >= data.max && (
          <p className="cap" style={{ margin: "12px 0 0" }}>
            La limite de deux comptes est atteinte. Retirez un compte pour en inviter un autre.
          </p>
        )}
      </div>

      {data && data.accounts.length < data.max && <AddAccount onDone={() => (setToast("Compte ajouté."), load())} />}
      <ChangePassword onDone={() => setToast("Mot de passe changé.")} />
      {toast}
    </>
  );
}

function AddAccount({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api("/api/admin/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setForm({ name: "", email: "", password: "" });
      onDone();
    } catch (err) {
      setError((err as Error).message);
    }
  };
  return (
    <form className="card" style={{ maxWidth: 680, marginBottom: 16 }} onSubmit={submit}>
      <h3>Ajouter le second compte</h3>
      <p className="cap">Donnez ensuite le mot de passe provisoire à la personne. Elle pourra le changer ici.</p>
      <div className="acc-form">
        <div>
          <label htmlFor="an">Nom</label>
          <input id="an" type="text" placeholder="Secrétariat" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div>
          <label htmlFor="ae">Adresse e-mail</label>
          <input id="ae" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div className="full">
          <label htmlFor="ap">Mot de passe provisoire (8 caractères au moins)</label>
          <input id="ap" type="text" required minLength={8} autoComplete="off" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </div>
        {error && <div className="form-err full" role="alert">{error}</div>}
        <button className="btn btn-main" type="submit">Ajouter le compte</button>
      </div>
    </form>
  );
}

function ChangePassword({ onDone }: { onDone: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api("/api/admin/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current, next }),
      });
      setCurrent("");
      setNext("");
      onDone();
    } catch (err) {
      setError((err as Error).message);
    }
  };
  return (
    <form className="card" style={{ maxWidth: 680 }} onSubmit={submit}>
      <h3>Changer mon mot de passe</h3>
      <div className="acc-form">
        <div>
          <label htmlFor="pc">Mot de passe actuel</label>
          <input id="pc" type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
        </div>
        <div>
          <label htmlFor="pn">Nouveau mot de passe</label>
          <input id="pn" type="password" autoComplete="new-password" required minLength={8} value={next} onChange={(e) => setNext(e.target.value)} />
        </div>
        {error && <div className="form-err full" role="alert">{error}</div>}
        <button className="btn btn-main" type="submit">Enregistrer</button>
      </div>
    </form>
  );
}
