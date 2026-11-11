import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const KNOWLEDGE_DIR = path.join(process.cwd(), "knowledge");

let cache: { text: string; loadedAt: number } | null = null;
const CACHE_MS = 60_000;

/**
 * Lit tous les fichiers .md du dossier knowledge/ (sauf README.md)
 * et les assemble en un seul texte, dans l'ordre alphabétique des fichiers.
 * Le résultat est gardé en mémoire une minute pour éviter de relire le disque à chaque question.
 */
export async function loadKnowledge(): Promise<string> {
  if (cache && Date.now() - cache.loadedAt < CACHE_MS) return cache.text;

  const files = (await readdir(KNOWLEDGE_DIR))
    .filter((f) => f.endsWith(".md") && f.toLowerCase() !== "readme.md")
    .sort();

  const parts = await Promise.all(
    files.map(async (f) => {
      const content = await readFile(path.join(KNOWLEDGE_DIR, f), "utf8");
      return `<document fichier="${f}">\n${content.trim()}\n</document>`;
    }),
  );

  const text = parts.join("\n\n");
  cache = { text, loadedAt: Date.now() };
  return text;
}
