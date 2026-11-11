"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import ReactMarkdown from "react-markdown";
import { QUICK, SLIDES, UI, type Lang } from "@/lib/i18n";

type Item =
  | { kind: "msg"; role: "user" | "assistant"; content: string; time: string; lang: Lang; pending?: boolean }
  | { kind: "sys"; text: string; lang: Lang };

const dirOf = (l: Lang) => (l === "ar" ? "rtl" : "ltr");
const now = () => new Date().toLocaleTimeString("fr-SN", { hour: "2-digit", minute: "2-digit" });

export default function Chat() {
  const [lang, setLang] = useState<Lang>("fr");
  const [items, setItems] = useState<Item[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [slide, setSlide] = useState(0);
  const [panelClosed, setPanelClosed] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const t = UI[lang];

  // Langue mémorisée dans le navigateur
  useEffect(() => {
    try {
      // Lu après le premier affichage pour que la page serveur et la page du navigateur restent identiques.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (localStorage.getItem("ucab-lang") === "ar") setLang("ar");
    } catch {}
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    try {
      localStorage.setItem("ucab-lang", lang);
    } catch {}
  }, [lang]);

  // Compte la visite (pour le tableau de bord de l'administration)
  useEffect(() => {
    void fetch("/api/visit", { method: "POST" }).catch(() => {});
  }, []);

  // Diaporama du panneau
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setSlide((s) => (s + 1) % SLIDES.length), 5500);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items]);

  const switchLang = (l: Lang) => {
    if (l === lang) return;
    setLang(l);
    setItems((prev) => (prev.length ? [...prev, { kind: "sys", text: UI[l].switched, lang: l }] : prev));
  };

  const ask = useCallback(
    async (question: string) => {
      const q = question.trim();
      if (!q || busy) return;
      setBusy(true);

      const history = items
        .filter((i): i is Extract<Item, { kind: "msg" }> => i.kind === "msg" && !i.pending && i.content !== "")
        .map((i) => ({ role: i.role, content: i.content }));
      const messages = [...history, { role: "user" as const, content: q }];

      setItems((prev) => [
        ...prev,
        { kind: "msg", role: "user", content: q, time: now(), lang },
        { kind: "msg", role: "assistant", content: "", time: now(), lang, pending: true },
      ]);

      const update = (content: string, done: boolean) =>
        setItems((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.kind === "msg" && last.role === "assistant") {
            next[next.length - 1] = { ...last, content, pending: !done, time: done ? now() : last.time };
          }
          return next;
        });

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages, lang }),
        });
        if (!res.ok || !res.body) {
          update(res.status === 429 ? UI[lang].tooMany : UI[lang].error, true);
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let text = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          text += decoder.decode(value, { stream: true });
          update(text, false);
        }
        update(text || UI[lang].error, true);
      } catch {
        update(UI[lang].error, true);
      } finally {
        setBusy(false);
      }
    },
    [busy, items, lang],
  );

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const v = input;
    setInput("");
    void ask(v);
  };

  const toggleLabel = panelClosed ? t.showPics : t.hidePics;
  const tickerItems = [...t.ticker, ...t.ticker];

  return (
    <div className={`app${panelClosed ? " panel-closed" : ""}`}>
      <div className="ticker" role="marquee" aria-label="Annonces">
        <div className="ticker-tag">
          <span className="dot" />
          <span className="lbl" dir={dirOf(lang)}>{t.tickerTag}</span>
        </div>
        <div className="ticker-view">
          <div className="ticker-track" key={lang}>
            {tickerItems.map((s, i) => (
              <span key={i} dir={dirOf(lang)}>{s}</span>
            ))}
          </div>
        </div>
      </div>

      <button
        type="button"
        ref={toggleRef}
        className="banner-toggle"
        aria-expanded={!panelClosed}
        aria-label={toggleLabel}
        title={toggleLabel}
        onClick={() => {
          setPanelClosed((c) => !c);
          const el = toggleRef.current;
          if (el) {
            el.classList.remove("pop");
            void el.offsetWidth; // relance l'animation de l'anneau
            el.classList.add("pop");
          }
        }}
      >
        <span className="bt-ring" aria-hidden="true" />
        <svg className="ic-close" viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 6l-6 6 6 6" /></svg>
        <svg className="ic-open" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3.5" y="5" width="17" height="14" rx="3" />
          <circle cx="9" cy="10" r="1.8" />
          <path d="M4.5 17l4.5-4 3.5 3 3-2.5 4 3.5" />
        </svg>
      </button>

      <aside className="panel" aria-label="UCAB Dakar">
        <div className="slides" aria-hidden="true">
          {SLIDES.map((s, i) => (
            <div key={s.name} className={`slide${i === slide ? " on" : ""}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.src} alt="" style={{ objectPosition: s.pos }} />
            </div>
          ))}
        </div>
        <div className="in">
          <div className="brand">
            <div className="logo-badge">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/logo.png" alt="Logo de l'UCAB" />
            </div>
            <div className="brand-txt">
              <div className="brand-name" dir={dirOf(lang)}>{t.uniName}</div>
              <div className="brand-sub" dir={dirOf(lang)}>{t.centre}</div>
            </div>
          </div>
          <div className="caption">
            <div className="bars">
              {SLIDES.map((s, i) => (
                <i key={`${s.name}-${i === slide ? slide : "x"}`} className={i === slide ? "on" : i < slide ? "done" : ""} />
              ))}
            </div>
            <span className="name" dir={dirOf(lang)}>{t.places[SLIDES[slide].name]}</span>
          </div>
          <div className="centres">
            <p className="centres-t" dir={dirOf(lang)}>{t.centresT}</p>
            <div className="centres-g">
              {t.centres.map((c, i) => (
                <div key={i} className={`ctr${i === 0 ? " here" : ""}`}>
                  <span dir={dirOf(lang)}>{c}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </aside>

      <main className="chat">
        <header className="chat-head">
          <div className="lang" role="group" aria-label={t.langLabel}>
            <button type="button" aria-pressed={lang === "fr"} onClick={() => switchLang("fr")}>FR</button>
            <button type="button" aria-pressed={lang === "ar"} onClick={() => switchLang("ar")}>عربي</button>
          </div>
          <button
            type="button"
            className="icon-btn"
            title={t.reset}
            aria-label={t.reset}
            onClick={() => !busy && setItems([])}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M3 12a9 9 0 109-9 9.7 9.7 0 00-6.7 2.8L3 8" />
              <path d="M3 3v5h5" />
            </svg>
          </button>
        </header>

        <div className="thread" ref={threadRef} aria-live="polite">
          <div className="thread-inner">
            <div className="day">{t.today}</div>
            {items.map((it, i) =>
              it.kind === "sys" ? (
                <div key={i} className="sys" dir={dirOf(it.lang)}>{it.text}</div>
              ) : it.role === "user" ? (
                <div key={i} className="msg user">
                  <div className="bubble" dir="auto">
                    {it.content}
                    <span className="time">{it.time}</span>
                  </div>
                </div>
              ) : (
                <div key={i} className="msg bot">
                  <div className="mini" aria-hidden="true">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/images/logo.png" alt="" />
                  </div>
                  <div className="bubble" dir="auto">
                    {it.content === "" ? (
                      <span className="typing"><i /><i /><i /></span>
                    ) : (
                      <div className="md">
                        <ReactMarkdown
                          components={{
                            a: ({ href, children }) => (
                              <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
                            ),
                          }}
                        >
                          {it.content}
                        </ReactMarkdown>
                      </div>
                    )}
                    {!it.pending && <span className="time">{it.time}</span>}
                  </div>
                </div>
              ),
            )}
          </div>
        </div>

        <div className="composer">
          <div className="composer-in">
            <div className="quick" aria-label={t.quickLabel}>
              {QUICK[lang].map((label) => (
                <button key={label} type="button" className="quick-btn" dir={dirOf(lang)} disabled={busy} onClick={() => void ask(label)}>
                  {label}
                </button>
              ))}
            </div>
            <form onSubmit={onSubmit} autoComplete="off">
              <input
                type="text"
                maxLength={600}
                aria-label={t.question}
                placeholder={t.placeholder}
                dir={dirOf(lang)}
                value={input}
                onChange={(e) => setInput(e.target.value)}
              />
              <button className="send" type="submit" aria-label={t.send} disabled={busy || !input.trim()}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              </button>
            </form>
            <p className="foot-note" dir={dirOf(lang)}>{t.footNote}</p>
          </div>
        </div>
      </main>
    </div>
  );
}
