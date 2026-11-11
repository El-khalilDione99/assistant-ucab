import { after } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { get, run } from "@/lib/db";
import { CATEGORIES, checkUpload, deleteDocument, processDocument, saveFile, KINDS, type Kind } from "@/lib/documents";

type Ctx = RouteContext<"/api/admin/documents/[id]">;

/** Texte lu dans le document, pour vérifier. */
export async function GET(request: Request, ctx: Ctx) {
  const admin = requireAdmin(request);
  if (admin instanceof Response) return admin;
  const row = get("SELECT id, name, text, status, error FROM documents WHERE id = ?", Number((await ctx.params).id));
  return row ? Response.json(row) : Response.json({ error: "introuvable" }, { status: 404 });
}

/** Change le nom ou la catégorie. */
export async function PATCH(request: Request, ctx: Ctx) {
  const admin = requireAdmin(request);
  if (admin instanceof Response) return admin;
  const id = Number((await ctx.params).id);
  const { name, category } = ((await request.json().catch(() => ({}))) ?? {}) as { name?: unknown; category?: unknown };
  if (typeof name === "string" && name.trim()) run("UPDATE documents SET name = ? WHERE id = ?", name.trim().slice(0, 160), id);
  if (typeof category === "string" && (CATEGORIES as readonly string[]).includes(category)) {
    run("UPDATE documents SET category = ? WHERE id = ?", category, id);
  }
  return new Response(null, { status: 204 });
}

/** Remplace le document par une nouvelle version. */
export async function PUT(request: Request, ctx: Ctx) {
  const admin = requireAdmin(request);
  if (admin instanceof Response) return admin;
  const id = Number((await ctx.params).id);
  if (!get("SELECT 1 FROM documents WHERE id = ?", id)) return Response.json({ error: "introuvable" }, { status: 404 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("fichier");
  if (!(file instanceof File) || file.size === 0) return Response.json({ error: "Aucun fichier reçu." }, { status: 400 });
  const kind = checkUpload(file);
  if (!KINDS.includes(kind)) return Response.json({ error: kind }, { status: 400 });

  run(
    "UPDATE documents SET kind = ?, size = ?, pages = 0, status = 'wait', error = NULL, created_at = ? WHERE id = ?",
    kind,
    file.size,
    Date.now(),
    id,
  );
  const buffer = Buffer.from(await file.arrayBuffer());
  after(async () => {
    await saveFile(id, file.name, buffer);
    await processDocument(id, kind as Kind, buffer);
  });
  return new Response(null, { status: 204 });
}

export async function DELETE(request: Request, ctx: Ctx) {
  const admin = requireAdmin(request);
  if (admin instanceof Response) return admin;
  const ok = await deleteDocument(Number((await ctx.params).id));
  return ok ? new Response(null, { status: 204 }) : Response.json({ error: "introuvable" }, { status: 404 });
}
