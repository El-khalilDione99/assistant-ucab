import { all, get, run } from "./db";

/* ---------- Enregistrement ---------- */

export const VISITOR_COOKIE = "ucab-v";

export function isMobile(userAgent: string | null): boolean {
  return /Mobi|Android|iPhone|iPad|iPod/i.test(userAgent || "");
}

const TOPICS: [string, RegExp][] = [
  ["Bourses", /bourse|aide financ|prise en charge|منح/],
  ["Inscription", /inscri|dossier|piece|depot|depos|تسجيل|ملف|وثائق/],
  ["Frais", /frais|prix|cout|payer|paiement|montant|fcfa|mensualit|tarif|رسوم|سعر|دفع|تكلف/],
  ["Admission", /admission|admis|condition|baccalaur|\bbac\b|concours|قبول|شروط|بكالوري/],
  ["Formations", /formation|filiere|licence|master|cours|genie|informatique|diplome|electri|topograph|تخصص|ليسانس|ماستر|كليه|كلية|دراس/],
  ["Campus / accès", /campus|adresse|\bou est\b|situe|transport|fass|mbao|internat|logement|heberg|حرم|اين|موقع|عنوان|سكن/],
  ["Contact", /contact|telephone|numero|e-?mail|appeler|joindre|هاتف|رقم|تواصل|اتصال/],
];

export function topicOf(question: string): string {
  const q = question.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  for (const [name, re] of TOPICS) if (re.test(q)) return name;
  return "Autre";
}

export function logVisit(visitor: string, mobile: boolean) {
  // Une visite par visiteur et par heure suffit pour compter.
  const recent = get("SELECT 1 FROM visits WHERE visitor = ? AND ts > ?", visitor, Date.now() - 3600_000);
  if (!recent) run("INSERT INTO visits (visitor, ts, mobile) VALUES (?, ?, ?)", visitor, Date.now(), mobile ? 1 : 0);
}

export function logQuestion(q: {
  visitor: string;
  lang: "fr" | "ar";
  mobile: boolean;
  answered: boolean;
  text: string;
}) {
  run(
    "INSERT INTO questions (visitor, ts, lang, mobile, topic, answered, text) VALUES (?, ?, ?, ?, ?, ?, ?)",
    q.visitor,
    Date.now(),
    q.lang,
    q.mobile ? 1 : 0,
    topicOf(q.text),
    q.answered ? 1 : 0,
    q.text.slice(0, 600),
  );
}

/* ---------- Tableau de bord ---------- */

const DAY = 86_400_000;
const DAYS_FR = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const DAYS_SHORT = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
const MONTHS = ["Janv.", "Févr.", "Mars", "Avr.", "Mai", "Juin", "Juil.", "Août", "Sept.", "Oct.", "Nov.", "Déc."];

type Q = { ts: number; visitor: string; lang: string; mobile: number; topic: string; answered: number };
type V = { ts: number; visitor: string };

export type Period = "7" | "30" | "365";

function bucketsFor(period: Period, now: number) {
  const today = Math.floor(now / DAY) * DAY; // jours en heure de Dakar (UTC)
  if (period === "365") {
    const d = new Date(now);
    return Array.from({ length: 12 }, (_, i) => {
      const start = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 11 + i, 1);
      const end = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 10 + i, 1);
      return { start, end, label: MONTHS[new Date(start).getUTCMonth()], long: MONTHS[new Date(start).getUTCMonth()] };
    });
  }
  const n = Number(period);
  return Array.from({ length: n }, (_, i) => {
    const start = today - (n - 1 - i) * DAY;
    const d = new Date(start);
    const label = n === 7 ? DAYS_SHORT[d.getUTCDay()] : `${d.getUTCDate()}/${d.getUTCMonth() + 1}`;
    return { start, end: start + DAY, label, long: `${DAYS_FR[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].toLowerCase()}` };
  });
}

function summary(qs: Q[], vs: V[]) {
  const visitors = new Set([...vs.map((v) => v.visitor), ...qs.map((q) => q.visitor)]).size;
  const askers = new Set(qs.map((q) => q.visitor)).size;
  const unanswered = qs.filter((q) => !q.answered).length;
  return {
    visitors,
    questions: qs.length,
    perVisitor: askers ? qs.length / askers : 0,
    unansweredRate: qs.length ? (unanswered / qs.length) * 100 : 0,
    unanswered,
  };
}

export function dashboard(period: Period) {
  const now = Date.now();
  const buckets = bucketsFor(period, now);
  const since = buckets[0].start;
  const prevSince = since - (now - since);

  const qs = all<Q>("SELECT ts, visitor, lang, mobile, topic, answered FROM questions WHERE ts >= ?", prevSince);
  const vs = all<V>("SELECT ts, visitor FROM visits WHERE ts >= ?", prevSince);
  const cur = summary(qs.filter((q) => q.ts >= since), vs.filter((v) => v.ts >= since));
  const prev = summary(qs.filter((q) => q.ts < since), vs.filter((v) => v.ts < since));
  const curQs = qs.filter((q) => q.ts >= since);

  const series = buckets.map((b) => {
    const s = summary(
      curQs.filter((q) => q.ts >= b.start && q.ts < b.end),
      vs.filter((v) => v.ts >= b.start && v.ts < b.end),
    );
    return { label: b.label, long: b.long, ...s };
  });

  const topicCount = new Map<string, number>();
  for (const q of curQs) topicCount.set(q.topic, (topicCount.get(q.topic) || 0) + 1);
  const topics = [...topicCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, n]) => ({ name, n, pct: Math.round((n / (curQs.length || 1)) * 100) }));

  // Carte de chaleur : lignes = jours (lundi → dimanche), colonnes = tranches de 2 heures
  const heat = Array.from({ length: 7 }, () => Array(12).fill(0) as number[]);
  for (const q of curQs) {
    const d = new Date(q.ts);
    heat[(d.getUTCDay() + 6) % 7][Math.floor(d.getUTCHours() / 2)]++;
  }
  let peak = null as { day: string; from: number; to: number } | null;
  let best = 0;
  heat.forEach((row, r) =>
    row.forEach((v, c) => {
      if (v > best) {
        best = v;
        peak = { day: DAYS_FR[(r + 1) % 7].toLowerCase(), from: c * 2, to: c * 2 + 2 };
      }
    }),
  );

  const ar = curQs.filter((q) => q.lang === "ar").length;
  const mobile = curQs.filter((q) => q.mobile).length;
  const pct = (n: number) => (curQs.length ? Math.round((n / curQs.length) * 100) : 0);

  const open = all<{ id: number; text: string; n: number }>(
    `SELECT MAX(id) AS id, text, COUNT(*) AS n FROM questions
     WHERE answered = 0 AND handled = 0 GROUP BY LOWER(TRIM(text)) ORDER BY MAX(ts) DESC LIMIT 4`,
  );
  const openCount = get<{ n: number }>(
    "SELECT COUNT(DISTINCT LOWER(TRIM(text))) AS n FROM questions WHERE answered = 0 AND handled = 0",
  )!.n;

  return {
    period,
    current: cur,
    previous: prev,
    answerRate: cur.questions ? Math.round(100 - cur.unansweredRate) : null,
    series,
    topics,
    heat,
    peak,
    lang: { fr: pct(curQs.length - ar), ar: pct(ar) },
    device: { mobile: pct(mobile), desktop: pct(curQs.length - mobile) },
    open,
    openCount,
  };
}

/* ---------- Questions sans réponse ---------- */

export function unansweredQuestions() {
  return all<{ id: number; text: string; topic: string; lang: string; last: number; n: number; handled: number }>(
    `SELECT MAX(id) AS id, text, topic, lang, MAX(ts) AS last, COUNT(*) AS n, MIN(handled) AS handled
     FROM questions WHERE answered = 0
     GROUP BY LOWER(TRIM(text)) ORDER BY MIN(handled), MAX(ts) DESC LIMIT 200`,
  );
}

/** Marque comme traitées toutes les fois où cette même question a été posée. */
export function markHandled(id: number) {
  const row = get<{ text: string }>("SELECT text FROM questions WHERE id = ?", id);
  if (!row) return false;
  run("UPDATE questions SET handled = 1 WHERE answered = 0 AND LOWER(TRIM(text)) = LOWER(TRIM(?))", row.text);
  return true;
}
