import { requireAdmin } from "@/lib/auth";
import { run } from "@/lib/db";

/** Retire l'autre compte (on ne peut pas retirer son propre compte). */
export async function DELETE(request: Request, ctx: RouteContext<"/api/admin/accounts/[id]">) {
  const admin = requireAdmin(request);
  if (admin instanceof Response) return admin;
  const id = Number((await ctx.params).id);
  if (id === admin.id) return Response.json({ error: "Vous ne pouvez pas retirer votre propre compte." }, { status: 400 });
  run("DELETE FROM admins WHERE id = ?", id);
  return new Response(null, { status: 204 });
}
