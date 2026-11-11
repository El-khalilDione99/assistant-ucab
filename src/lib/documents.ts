import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { DATA_DIR, all, get, run } from "./db";

export const CATEGORIES = [
  "Présentation",
  "Formations",
  "Admission",
  "Inscription",
  "Frais",
  "Campus",
  "Vie étudiante",
  "Contact",
  "Autre",
] as const;

export const KINDS: string[] = ["pdf", "doc", "scan", "texte"];
export type Kind = "pdf" | "doc" | "scan" | "texte";
export type DocRow = {
  id: number;
  name: string;
  category: string;
  kind: Kind;
  file: string | null;
  size: number;
  pages: number;
  status: "wait" | "ok" | "err";
  error: string | null;
  created_at: number;
};

export const MAX_UPLOAD = 15 * 1024 * 1024; // 15 Mo
const FILES_DIR = path.join(DATA_DIR, "fichiers");

/** Type de document d'après l'extension du fichier. */
export function kindOf(filename: string): Kind | "word-ancien" | null {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".pdf") return "pdf";
  if (ext === ".docx") return "doc";
  if (ext === ".doc") return "word-ancien";
  if ([".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff"].includes(ext)) return "scan";
  if ([".txt", ".md"].includes(ext)) return "texte";
  return null;
}

/** Vérifie un fichier envoyé. Renvoie son type, ou un message d'erreur à afficher. */
export function checkUpload(file: File): Kind | string {
  if (file.size > MAX_UPLOAD) return "Le fichier dépasse 15 Mo. Envoyez une version plus légère.";
  const kind = kindOf(file.name);
  if (kind === "word-ancien") return "Ancien format Word (.doc) : ouvrez-le dans Word et enregistrez-le en .docx.";
  if (!kind) return "Format non pris en charge. Envoyez un PDF, un Word (.docx) ou une photo (.jpg, .png).";
  return kind;
}

/* ---------- Lecture du texte ---------- */

/** Erreur dont le message peut être montré tel quel dans l'espace administration. */
class ReadError extends Error {}

async function extract(kind: Kind, buffer: Buffer): Promise<{ text: string; pages: number }> {
  if (kind === "pdf") {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { totalPages, text } = await extractText(pdf, { mergePages: false });
    const joined = text.map((t, i) => `[Page ${i + 1}]\n${t.trim()}`).join("\n\n");
    if (text.join("").trim().length < 20 * totalPages) {
      throw new ReadError(
        "Ce PDF ne contient que des images (scan). Prenez plutôt chaque page en photo et envoyez les photos.",
      );
    }
    return { text: joined, pages: totalPages };
  }
  if (kind === "doc") {
    const mammoth = (await import("mammoth")).default;
    const { value } = await mammoth.extractRawText({ buffer });
    return { text: value.trim(), pages: 0 };
  }
  if (kind === "scan") {
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker(["fra", "ara"], 1, {
      langPath: path.join(process.cwd(), "ocr"),
      gzip: true,
      cachePath: path.join(DATA_DIR, "ocr-cache"),
    });
    try {
      const { data } = await worker.recognize(buffer);
      if (data.confidence < 45 || data.text.trim().length < 15) {
        throw new ReadError("Le texte de l'image est illisible. Reprenez la photo bien à plat, avec plus de lumière.");
      }
      return { text: data.text.trim(), pages: 1 };
    } finally {
      await worker.terminate();
    }
  }
  return { text: buffer.toString("utf8").trim(), pages: 0 };
}

/** Enregistre un fichier reçu et lit son texte (appelé en arrière-plan). */
export async function saveFile(id: number, filename: string, buffer: Buffer) {
  await mkdir(FILES_DIR, { recursive: true });
  const old = get<{ file: string | null }>("SELECT file FROM documents WHERE id = ?", id)?.file;
  if (old) await unlink(path.join(FILES_DIR, old)).catch(() => {});
  const stored = `${id}${path.extname(filename).toLowerCase()}`;
  await writeFile(path.join(FILES_DIR, stored), buffer);
  run("UPDATE documents SET file = ? WHERE id = ?", stored, id);
}

export async function processDocument(id: number, kind: Kind, buffer: Buffer) {
  try {
    const { text, pages } = await extract(kind, buffer);
    if (!text) throw new ReadError("Aucun texte trouvé dans ce document.");
    run("UPDATE documents SET status = 'ok', error = NULL, text = ?, pages = ? WHERE id = ?", text, pages, id);
  } catch (err) {
    const message = err instanceof ReadError
      ? err.message
      : "Impossible de lire ce document. Vérifiez qu'il s'ouvre bien sur votre ordinateur.";
    console.error("[documents]", id, err);
    run("UPDATE documents SET status = 'err', error = ? WHERE id = ?", message, id);
  }
}

export async function deleteDocument(id: number) {
  const row = get<{ file: string | null }>("SELECT file FROM documents WHERE id = ?", id);
  if (!row) return false;
  run("DELETE FROM documents WHERE id = ?", id);
  if (row.file) await unlink(path.join(FILES_DIR, row.file)).catch(() => {});
  return true;
}

/* ---------- Premiers documents ---------- */

const SEED_CATEGORY: Record<string, string> = {
  "01": "Présentation",
  "02": "Formations",
  "03": "Admission",
  "04": "Inscription",
  "05": "Frais",
  "06": "Campus",
  "07": "Contact",
  "08": "Vie étudiante",
};

/**
 * Au premier démarrage, les fichiers du dossier knowledge/ deviennent les premiers documents.
 * Ensuite, tout se gère depuis l'espace administration.
 */
export async function seedDocuments() {
  if (get("SELECT value FROM meta WHERE key = 'seeded'")) return;
  const dir = path.join(process.cwd(), "knowledge");
  const files = (await readdir(dir).catch(() => [] as string[]))
    .filter((f) => f.endsWith(".md") && f.toLowerCase() !== "readme.md")
    .sort();
  for (const f of files) {
    const text = (await readFile(path.join(dir, f), "utf8")).trim();
    const title = text.match(/^#\s+(.+)$/m)?.[1]?.trim() || f.replace(/^\d+-|\.md$/g, "");
    run(
      "INSERT INTO documents (name, category, kind, size, status, text, created_at) VALUES (?, ?, 'texte', ?, 'ok', ?, ?)",
      title,
      SEED_CATEGORY[f.slice(0, 2)] || "Autre",
      Buffer.byteLength(text),
      text,
      Date.now(),
    );
  }
  run("INSERT OR REPLACE INTO meta (key, value) VALUES ('seeded', '1')");
}

export function listDocuments(): DocRow[] {
  return all<DocRow>(
    "SELECT id, name, category, kind, file, size, pages, status, error, created_at FROM documents ORDER BY created_at DESC, id DESC",
  );
}
