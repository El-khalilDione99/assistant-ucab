import { all, get } from "./db";
import { seedDocuments } from "./documents";

/**
 * Choisit, dans les documents ajoutés par l'administration, les passages utiles à une question.
 * Tant que les documents sont courts, on les envoie tous à l'IA. Quand il y en a beaucoup,
 * on n'envoie que les passages qui partagent le plus de mots avec la question,
 * pour rester dans les limites de l'offre gratuite de Groq.
 */

const SEND_ALL_UNDER = 14_000; // caractères
const MAX_CONTEXT = 9_000; // caractères envoyés quand on choisit des passages
const CHUNK = 900;

type Chunk = { doc: string; category: string; text: string; terms: Map<string, number>; len: number };
type Index = { signature: string; full: string; total: number; chunks: Chunk[]; df: Map<string, number>; avgLen: number };

let index: Index | null = null;

const STOP = new Set(
  (
    "les des une est que qui dans pour par sur avec pas plus son ses aux ces mais ont sont été être avoir tout tous " +
    "cette leur leurs vous nous elle ils comme fait faire peut quel quelle quels quelles comment combien est-ce " +
    "من في على الى إلى عن مع هل ما ماذا كيف هذا هذه التي الذي أن ان او أو"
  ).split(" "),
);

/** Met les mots sous une forme simple : minuscules, sans accents, arabe sans voyelles. */
export function terms(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[ً-ْـ]/g, "") // voyelles et tatweel arabes
    .replace(/[إأآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .split(/[^\p{L}\p{N}]+/u)
    .map((w) => (w.startsWith("ال") && w.length > 4 ? w.slice(2) : w))
    .map((w) => (/^[a-z]+$/.test(w) && w.length > 4 ? w.replace(/(s|x)$/, "") : w))
    .filter((w) => w.length > 2 && !STOP.has(w));
}

function split(text: string): string[] {
  const parts: string[] = [];
  let current = "";
  for (const para of text.split(/\n\s*\n/)) {
    if (current && current.length + para.length > CHUNK) {
      parts.push(current);
      current = "";
    }
    current = current ? `${current}\n\n${para}` : para;
    while (current.length > CHUNK * 1.6) {
      parts.push(current.slice(0, CHUNK));
      current = current.slice(CHUNK - 150);
    }
  }
  if (current.trim()) parts.push(current);
  return parts;
}

async function getIndex(): Promise<Index> {
  await seedDocuments();
  const sig = get<{ s: string }>(
    "SELECT COUNT(*) || '-' || IFNULL(SUM(id), 0) || '-' || IFNULL(SUM(LENGTH(text)), 0) AS s FROM documents WHERE status = 'ok'",
  )!.s;
  if (index?.signature === sig) return index;

  const docs = all<{ name: string; category: string; text: string }>(
    "SELECT name, category, text FROM documents WHERE status = 'ok' ORDER BY category, id",
  );
  const full = docs
    .map((d) => `<document titre="${d.name.replace(/"/g, "'")}" categorie="${d.category}">\n${d.text}\n</document>`)
    .join("\n\n");
  const chunks: Chunk[] = [];
  const df = new Map<string, number>();
  for (const d of docs) {
    for (const part of split(d.text)) {
      const words = terms(`${d.name} ${d.category} ${part}`);
      const tf = new Map<string, number>();
      for (const w of words) tf.set(w, (tf.get(w) || 0) + 1);
      for (const w of tf.keys()) df.set(w, (df.get(w) || 0) + 1);
      chunks.push({ doc: d.name, category: d.category, text: part, terms: tf, len: words.length });
    }
  }
  const avgLen = chunks.reduce((n, c) => n + c.len, 0) / (chunks.length || 1);
  index = { signature: sig, full, total: full.length, chunks, df, avgLen };
  return index;
}

/** Texte des documents à donner à l'IA pour cette question. */
export async function contextFor(question: string): Promise<string> {
  const idx = await getIndex();
  if (idx.total <= SEND_ALL_UNDER) return idx.full;

  // Classement BM25 : les mots rares de la question comptent plus que les mots fréquents.
  const q = [...new Set(terms(question))];
  const N = idx.chunks.length;
  const scored = idx.chunks
    .map((c) => {
      let score = 0;
      for (const w of q) {
        const f = c.terms.get(w);
        if (!f) continue;
        const n = idx.df.get(w) || 0;
        const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
        score += (idf * f * 2.2) / (f + 1.2 * (0.25 + 0.75 * (c.len / idx.avgLen)));
      }
      return { c, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  const picked: string[] = [];
  let size = 0;
  for (const { c } of scored) {
    if (size + c.text.length > MAX_CONTEXT) break;
    picked.push(`<extrait document="${c.doc.replace(/"/g, "'")}" categorie="${c.category}">\n${c.text}\n</extrait>`);
    size += c.text.length;
  }
  return picked.length ? picked.join("\n\n") : "(Aucun passage des documents ne correspond à cette question.)";
}
