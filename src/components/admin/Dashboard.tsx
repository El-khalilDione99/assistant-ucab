"use client";

import { useEffect, useState } from "react";
import { api } from "./AdminApp";
import { AreaChart, Donut, Heat, Ring, Spark, TOPIC_COLORS } from "./charts";

type Summary = { visitors: number; questions: number; perVisitor: number; unansweredRate: number; unanswered: number };
type Stats = {
  period: "7" | "30" | "365";
  current: Summary;
  previous: Summary;
  answerRate: number | null;
  series: (Summary & { label: string; long: string })[];
  topics: { name: string; n: number; pct: number }[];
  heat: number[][];
  peak: { day: string; from: number; to: number } | null;
  lang: { fr: number; ar: number };
  device: { mobile: number; desktop: number };
  open: { id: number; text: string; n: number }[];
  openCount: number;
};

const PERIODS = [
  ["7", "7 jours"],
  ["30", "30 jours"],
  ["365", "Année"],
] as const;
const PREV: Record<string, string> = { "7": "la semaine passée", "30": "le mois passé", "365": "l'année passée" };
const nf = (n: number, d = 0) => n.toLocaleString("fr-FR", { maximumFractionDigits: d, minimumFractionDigits: d });

function Delta({ cur, prev, kind, goodWhenDown }: { cur: number; prev: number; kind: "pct" | "abs" | "pt"; goodWhenDown?: boolean }) {
  if (!prev && !cur) return null;
  let diff: number;
  let text: string;
  if (kind === "pct") {
    if (!prev) return <span className="badge up">Nouveau</span>;
    diff = ((cur - prev) / prev) * 100;
    text = `${nf(Math.abs(diff))} %`;
  } else {
    diff = cur - prev;
    text = kind === "pt" ? `${nf(Math.abs(diff))} pt` : nf(Math.abs(diff), 1);
  }
  if (Math.abs(diff) < 0.05) return <span className="badge up">=</span>;
  const good = goodWhenDown ? diff < 0 : diff > 0;
  return (
    <span className={`badge ${good ? "up" : "bad"}`}>
      {diff > 0 ? "▲" : "▼"} {text}
    </span>
  );
}

export default function Dashboard({ go, onOpenCount }: { go: (v: "qs") => void; onOpenCount: (n: number) => void }) {
  const [period, setPeriod] = useState<Stats["period"]>("7");
  const [data, setData] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    api<Stats>(`/api/admin/stats?periode=${period}`)
      .then((d) => {
        if (!live) return;
        setData(d);
        setError(null);
        onOpenCount(d.openCount);
      })
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [period, onOpenCount]);

  const head = (
    <div className="head">
      <div>
        <h2>Tableau de bord</h2>
        <p>Activité de l&apos;assistant sur le site web</p>
      </div>
      <div className="seg" role="group" aria-label="Période">
        {PERIODS.map(([v, l]) => (
          <button key={v} className={period === v ? "on" : ""} aria-pressed={period === v} onClick={() => setPeriod(v)}>
            {l}
          </button>
        ))}
      </div>
    </div>
  );

  if (error) return <>{head}<div className="form-err">{error}</div></>;
  if (!data) return <>{head}<div className="empty">Chargement des chiffres…</div></>;

  const { current: c, previous: p, series } = data;
  const range = data.period === "7" ? "Cette semaine" : data.period === "30" ? "Ces 30 jours" : "Cette année";
  const spark = (k: keyof Summary) => series.map((s) => s[k]);

  return (
    <>
      {head}

      <div className="hero">
        <div className="hero-txt">
          <span className="hero-tag">{range}</span>
          {data.answerRate === null ? (
            <>
              <h3>Aucune question pour le moment</h3>
              <p>Les chiffres apparaîtront ici dès que les premiers visiteurs utiliseront l&apos;assistant.</p>
            </>
          ) : (
            <>
              <h3>
                L&apos;assistant a répondu à <b>{data.answerRate} %</b> des questions
              </h3>
              <p>
                {nf(c.questions)} question{c.questions > 1 ? "s" : ""} de {nf(c.visitors)} visiteur{c.visitors > 1 ? "s" : ""}.
                {data.peak && ` Le moment le plus actif : le ${data.peak.day}, entre ${data.peak.from} h et ${data.peak.to} h.`}
              </p>
            </>
          )}
          {data.openCount > 0 && (
            <button className="btn btn-gold" onClick={() => go("qs")}>
              Voir {data.openCount > 1 ? `les ${data.openCount} questions` : "la question"} à compléter
            </button>
          )}
        </div>
        <Ring pct={data.answerRate} color="#F2C200" big />
      </div>

      <div className="kpis">
        <div className="card kpi k1">
          <div className="k-top">
            <span className="k-ic"><svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0113 0M16 4.5a3.5 3.5 0 010 7M21.5 20a6.5 6.5 0 00-4-6" /></svg></span>
            <Delta cur={c.visitors} prev={p.visitors} kind="pct" />
          </div>
          <div className="val">{nf(c.visitors)}</div>
          <div className="lbl">Visiteurs</div>
          <Spark values={spark("visitors")} color="#026701" />
        </div>
        <div className="card kpi k2">
          <div className="k-top">
            <span className="k-ic"><svg viewBox="0 0 24 24"><path d="M21 12a8 8 0 01-11.6 7.1L4 20l1-4.6A8 8 0 1121 12z" /></svg></span>
            <Delta cur={c.questions} prev={p.questions} kind="pct" />
          </div>
          <div className="val">{nf(c.questions)}</div>
          <div className="lbl">Questions posées</div>
          <Spark values={spark("questions")} color="#C99A00" />
        </div>
        <div className="card kpi k3">
          <div className="k-top">
            <span className="k-ic"><svg viewBox="0 0 24 24"><path d="M4 19l5-6 4 3 7-9" /><path d="M15 7h5v5" /></svg></span>
            <Delta cur={c.perVisitor} prev={p.perVisitor} kind="abs" />
          </div>
          <div className="val">{nf(c.perVisitor, 1)}</div>
          <div className="lbl">Questions par visiteur</div>
          <Spark values={spark("perVisitor")} color="#1F8A70" />
        </div>
        <div className="card kpi k4">
          <div className="k-top">
            <span className="k-ic"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 114 2c-.9.6-1.5 1.1-1.5 2.2M12 17h.01" /></svg></span>
            <Delta cur={c.unansweredRate} prev={p.unansweredRate} kind="pt" goodWhenDown />
          </div>
          <div className="val">{nf(c.unansweredRate)} %</div>
          <div className="lbl">Sans réponse</div>
          <Spark values={spark("unansweredRate")} color="#7A0000" />
        </div>
      </div>
      <p className="cap" style={{ margin: "-6px 0 16px" }}>Les flèches comparent avec {PREV[data.period]}.</p>

      <div className="grid2">
        <div className="card chart">
          <div className="c-head">
            <div>
              <h3>Évolution de l&apos;activité</h3>
              <p className="cap">
                {series[0].long} – {series[series.length - 1].long}
              </p>
            </div>
            <div className="legend">
              <span><i style={{ background: "#026701" }} />Questions</span>
              <span><i style={{ background: "#E0A800" }} />Visiteurs</span>
            </div>
          </div>
          <AreaChart
            labels={series.map((s) => s.label)}
            longLabels={series.map((s) => s.long)}
            a={spark("questions")}
            b={spark("visitors")}
          />
        </div>
        <div className="card">
          <h3>Sujets les plus demandés</h3>
          <p className="cap">Part des questions de la période</p>
          <div className="donut-box">
            <Donut items={data.topics} total={c.questions} />
            {data.topics.length ? (
              <ul className="dleg">
                {data.topics.map((t, i) => (
                  <li key={t.name}>
                    <i style={{ background: TOPIC_COLORS[i % TOPIC_COLORS.length] }} />
                    {t.name}
                    <b>{t.pct} %</b>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty">Pas encore de questions.</p>
            )}
          </div>
        </div>
      </div>

      <div className="grid2">
        <div className="card">
          <h3>Quand les étudiants écrivent</h3>
          <p className="cap">Plus la case est foncée, plus il y a de questions (heure de Dakar)</p>
          <Heat grid={data.heat} />
          <div className="heat-leg"><span>Peu</span><i /><span>Beaucoup</span></div>
        </div>
        <div className="card">
          <h3>Langue et appareil</h3>
          <p className="cap">D&apos;où viennent les questions</p>
          <div className="rings">
            <div className="ring">
              <Ring pct={c.questions ? data.lang.fr : null} color="#026701" />
              <b>Français</b>
              <span>{c.questions ? `${data.lang.fr} % · Arabe ${data.lang.ar} %` : "–"}</span>
            </div>
            <div className="ring">
              <Ring pct={c.questions ? data.device.mobile : null} color="#E0A800" />
              <b>Téléphone</b>
              <span>{c.questions ? `${data.device.mobile} % · Ordinateur ${data.device.desktop} %` : "–"}</span>
            </div>
          </div>
          <div className="soon"><span className="wa">WhatsApp</span> bientôt disponible</div>
        </div>
      </div>

      <div className="card">
        <div className="c-head">
          <div>
            <h3>Dernières questions sans réponse</h3>
            <p className="cap">L&apos;assistant n&apos;a pas trouvé l&apos;information dans les documents</p>
          </div>
          <button className="btn btn-ghost" onClick={() => go("qs")}>Tout voir</button>
        </div>
        {data.open.length ? (
          <ul className="mini-list" id="dashQs">
            {data.open.map((q) => (
              <li key={q.id}>
                <span dir="auto">{q.text}</span>
                <span style={{ color: "var(--mute)", whiteSpace: "nowrap" }}>{q.n} fois</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty">Aucune question en attente. Bravo !</p>
        )}
      </div>
    </>
  );
}
