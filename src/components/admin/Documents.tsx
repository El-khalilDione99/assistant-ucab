"use client";

import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { api, useToast } from "./AdminApp";

type Doc = {
  id: number;
  name: string;
  category: string;
  kind: "pdf" | "doc" | "scan" | "texte";
  size: number;
  pages: number;
  status: "wait" | "ok" | "err";
  error: string | null;
  created_at: number;
};

const ACCEPT = ".pdf,.docx,.doc,.jpg,.jpeg,.png,.webp,.txt,.md";
const TYPE = { pdf: "PDF", doc: "WORD", scan: "SCAN", texte: "TEXTE" };
const STATUS = {
  ok: ["ok", "Utilisé par l'assistant"],
  wait: ["wait", "Lecture du texte en cours…"],
  err: ["err", "Illisible, à reprendre"],
} as const;

function sizeOf(d: Doc) {
  const size = d.size > 1024 * 1024 ? `${(d.size / 1024 / 1024).toFixed(1).replace(".", ",")} Mo` : `${Math.max(1, Math.round(d.size / 1024))} Ko`;
  const pages = d.pages ? ` · ${d.pages} page${d.pages > 1 ? "s" : ""}` : "";
  return d.kind === "texte" ? `Texte · ${size}` : `${size}${pages}`;
}

function dateOf(ts: number) {
  const d = new Date(ts);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return "Aujourd'hui";
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

export default function Documents() {
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [category, setCategory] = useState("Autre");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<{ name: string; text: string } | null>(null);
  const [toast, setToast] = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const replaceId = useRef<number | null>(null);

  const load = useCallback(async () => {
    const r = await api<{ documents: Doc[]; categories: string[] }>("/api/admin/documents");
    setDocs(r.documents);
    setCategories(r.categories);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- chargement des données depuis le serveur
    load().catch((e: Error) => setError(e.message));
  }, [load]);

  // Tant qu'un document est en cours de lecture, on vérifie toutes les 3 secondes.
  const waiting = docs?.some((d) => d.status === "wait");
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(() => load().catch(() => {}), 3000);
    return () => clearInterval(t);
  }, [waiting, load]);

  const upload = async (files: FileList | File[]) => {
    setError(null);
    for (const file of Array.from(files)) {
      const form = new FormData();
      form.append("fichier", file);
      form.append("categorie", category);
      try {
        await api("/api/admin/documents", { method: "POST", body: form });
        setToast(`« ${file.name} » reçu. L'assistant le lit…`);
      } catch (e) {
        setError(`${file.name} : ${(e as Error).message}`);
      }
    }
    await load();
  };

  const replace = async (file: File) => {
    const id = replaceId.current;
    if (!id) return;
    const form = new FormData();
    form.append("fichier", file);
    try {
      await api(`/api/admin/documents/${id}`, { method: "PUT", body: form });
      setToast("Nouvelle version reçue. L'assistant la lit…");
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const remove = async (id: number) => {
    try {
      await api(`/api/admin/documents/${id}`, { method: "DELETE" });
      setConfirmId(null);
      setToast("Document supprimé.");
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const changeCategory = async (id: number, value: string) => {
    await api(`/api/admin/documents/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: value }),
    }).catch((e: Error) => setError(e.message));
    await load();
  };

  const view = async (id: number) => {
    try {
      setViewing(await api<{ name: string; text: string }>(`/api/admin/documents/${id}`));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    if (e.dataTransfer.files.length) void upload(e.dataTransfer.files);
  };

  const q = search.trim().toLowerCase();
  const rows = (docs || []).filter((d) => (!q || d.name.toLowerCase().includes(q)) && (!filter || d.category === filter));

  return (
    <>
      <div className="head">
        <div>
          <h2>Documents</h2>
          <p>Ce que l&apos;assistant sait. Il répond uniquement à partir de ces documents.</p>
        </div>
      </div>

      <div
        className={`drop${over ? " over" : ""}`}
        onDragOver={(e) => (e.preventDefault(), setOver(true))}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
      >
        <svg viewBox="0 0 24 24"><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 16v3a2 2 0 002 2h12a2 2 0 002-2v-3" /></svg>
        <h3>Glissez un document ici</h3>
        <p>ou choisissez-le sur votre ordinateur ou votre téléphone</p>
        <div className="types">
          <span className="chip">PDF</span>
          <span className="chip">Word (.docx)</span>
          <span className="chip">Photo ou scan (.jpg, .png)</span>
        </div>
        <div className="row">
          <label htmlFor="cat" style={{ margin: 0 }}>Catégorie</label>
          <select id="cat" value={category} onChange={(e) => setCategory(e.target.value)}>
            {categories.map((c) => <option key={c}>{c}</option>)}
          </select>
          <button className="btn btn-main" onClick={() => fileRef.current?.click()}>Choisir un fichier</button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPT}
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files?.length) void upload(e.target.files);
            e.target.value = "";
          }}
        />
        <p className="hint">15 Mo au maximum. Pour un document papier, prenez chaque page en photo, bien à plat et à la lumière.</p>
      </div>
      <input
        ref={replaceRef}
        type="file"
        accept={ACCEPT}
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void replace(f);
          e.target.value = "";
        }}
      />

      {error && <div className="form-err" role="alert" style={{ marginBottom: 14 }}>{error}</div>}

      <div className="card">
        <div className="toolbar">
          <input type="text" placeholder="Rechercher un document…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">Toutes les catégories</option>
            {categories.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        {docs === null ? (
          <p className="empty">Chargement…</p>
        ) : (
          <table>
            <thead>
              <tr><th>Document</th><th>Catégorie</th><th>Ajouté le</th><th>État</th><th style={{ textAlign: "right" }}>Actions</th></tr>
            </thead>
            <tbody>
              {rows.map((d) =>
                confirmId === d.id ? (
                  <tr key={d.id}>
                    <td colSpan={5}>
                      <div className="confirm">
                        <span>Supprimer <b>{d.name}</b> ? L&apos;assistant ne l&apos;utilisera plus.</span>
                        <span style={{ display: "flex", gap: 8 }}>
                          <button className="btn btn-ghost" onClick={() => setConfirmId(null)}>Annuler</button>
                          <button className="btn btn-danger" onClick={() => remove(d.id)}>Supprimer</button>
                        </span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={d.id}>
                    <td>
                      <div className="fname">
                        <div className={`ftype ${d.kind === "texte" ? "doc" : d.kind}`}>{TYPE[d.kind]}</div>
                        <div>{d.name}<small>{sizeOf(d)}</small></div>
                      </div>
                    </td>
                    <td className="c-size">
                      <select
                        aria-label="Catégorie"
                        value={d.category}
                        onChange={(e) => changeCategory(d.id, e.target.value)}
                        style={{ padding: "5px 8px", fontSize: 13, width: "auto" }}
                      >
                        {categories.map((c) => <option key={c}>{c}</option>)}
                      </select>
                    </td>
                    <td className="c-date">{dateOf(d.created_at)}</td>
                    <td>
                      <span className={`st ${STATUS[d.status][0]}`}>{STATUS[d.status][1]}</span>
                      {d.status === "err" && d.error && <span className="err-line">{d.error}</span>}
                    </td>
                    <td>
                      <div className="acts">
                        <button className="ib" title="Voir le texte lu" aria-label="Voir le texte lu" disabled={d.status !== "ok"} onClick={() => view(d.id)}>
                          <svg viewBox="0 0 24 24"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
                        </button>
                        <button
                          className="ib"
                          title="Remplacer par une nouvelle version"
                          aria-label="Remplacer par une nouvelle version"
                          onClick={() => {
                            replaceId.current = d.id;
                            replaceRef.current?.click();
                          }}
                        >
                          <svg viewBox="0 0 24 24"><path d="M21 12a9 9 0 11-3-6.7L21 8" /><path d="M21 3v5h-5" /></svg>
                        </button>
                        <button className="ib del" title="Supprimer" aria-label="Supprimer" onClick={() => setConfirmId(d.id)}>
                          <svg viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" /></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ),
              )}
              {!rows.length && (
                <tr><td colSpan={5} className="empty">{docs.length ? "Aucun document ne correspond." : "Aucun document pour le moment."}</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {viewing && (
        <div className="modal-bg" onClick={() => setViewing(null)}>
          <div className="modal" role="dialog" aria-label={viewing.name} onClick={(e) => e.stopPropagation()}>
            <header>
              <h3>{viewing.name}</h3>
              <button className="btn btn-ghost" onClick={() => setViewing(null)}>Fermer</button>
            </header>
            <pre dir="auto">{viewing.text}</pre>
          </div>
        </div>
      )}
      {toast}
    </>
  );
}
