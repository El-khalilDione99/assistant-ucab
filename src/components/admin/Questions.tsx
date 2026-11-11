"use client";

import { useCallback, useEffect, useState } from "react";
import { api, useToast } from "./AdminApp";

type Q = { id: number; text: string; topic: string; lang: string; last: number; n: number; handled: number };

function when(ts: number) {
  const d = new Date(ts);
  const now = new Date();
  const time = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return `Aujourd'hui, ${time}`;
  if (d.toDateString() === new Date(now.getTime() - 86_400_000).toDateString()) return `Hier, ${time}`;
  return `${d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}, ${time}`;
}

export default function Questions({ go, onOpenCount }: { go: (v: "docs") => void; onOpenCount: (n: number) => void }) {
  const [list, setList] = useState<Q[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useToast();

  const load = useCallback(async () => {
    const rows = await api<Q[]>("/api/admin/questions");
    setList(rows);
    onOpenCount(rows.filter((q) => !q.handled).length);
  }, [onOpenCount]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- chargement des données depuis le serveur
    load().catch((e: Error) => setError(e.message));
  }, [load]);

  const done = async (id: number) => {
    try {
      await api(`/api/admin/questions/${id}`, { method: "PATCH" });
      setToast("Question marquée comme traitée.");
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <>
      <div className="head">
        <div>
          <h2>Questions sans réponse</h2>
          <p>Ajoutez le document qui manque, et l&apos;assistant saura répondre la prochaine fois.</p>
        </div>
      </div>
      {error && <div className="form-err" role="alert" style={{ marginBottom: 14 }}>{error}</div>}
      <div className="card">
        {list === null ? (
          <p className="empty">Chargement…</p>
        ) : list.length === 0 ? (
          <p className="empty">Aucune question sans réponse pour le moment.</p>
        ) : (
          list.map((q) => (
            <div key={q.id} className={`q${q.handled ? " done" : ""}`}>
              <div>
                <div className="txt" dir="auto">{q.text}</div>
                <div className="meta">
                  <span className="tag">{q.topic}</span>
                  {when(q.last)} · posée {q.n} fois · {q.lang === "ar" ? "arabe" : "français"}
                </div>
              </div>
              <div className="acts">
                {q.handled ? (
                  <span className="st ok">Traitée</span>
                ) : (
                  <>
                    <button className="btn btn-gold" onClick={() => go("docs")}>Ajouter un document</button>
                    <button className="btn btn-ghost" onClick={() => done(q.id)}>Marquer traitée</button>
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>
      {toast}
    </>
  );
}
