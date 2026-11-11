import { after } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { get, run } from "@/lib/db";
import { CATEGORIES, checkUpload, listDocuments, processDocument, saveFile, seedDocuments, KINDS, type Kind } from "@/lib/documents";

export async function GET(request: Request) {
  const admin = requireAdmin(request);
  if (admin instanceof Response) return admin;
  await seedDocuments();
  return Response.json({ documents: listDocuments(), categories: CATEGORIES });
}

/** Reçoit un fichier (PDF, Word ou photo), puis lit son texte en arrière-plan. */
export async function POST(request: Request) {
  const admin = requireAdmin(request);
  if (admin instanceof Response) return admin;

  const form = await request.formData().catch(() => null);
  const file = form?.get("fichier");
  if (!(file instanceof File) || file.size === 0) return Response.json({ error: "Aucun fichier reçu." }, { status: 400 });
  const checked = checkUpload(file);
  if (!KINDS.includes(checked)) return Response.json({ error: checked }, { status: 400 });

  const category = String(form?.get("categorie") || "Autre");
  const name = String(form?.get("nom") || "").trim() || file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ");
  const { lastInsertRowid } = run(
    "INSERT INTO documents (name, category, kind, size, status, created_at) VALUES (?, ?, ?, ?, 'wait', ?)",
    name.slice(0, 160),
    (CATEGORIES as readonly string[]).includes(category) ? category : "Autre",
    checked,
    file.size,
    Date.now(),
  );
  const id = Number(lastInsertRowid);
  const buffer = Buffer.from(await file.arrayBuffer());
  after(async () => {
    await saveFile(id, file.name, buffer);
    await processDocument(id, checked as Kind, buffer);
  });
  return Response.json(get("SELECT id, name, category, kind, size, pages, status, error, created_at FROM documents WHERE id = ?", id), {
    status: 201,
  });
}
