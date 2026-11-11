import { requireAdmin } from "@/lib/auth";
import { markHandled } from "@/lib/stats";

/** Marque une question comme traitée. */
export async function PATCH(request: Request, ctx: RouteContext<"/api/admin/questions/[id]">) {
  const admin = requireAdmin(request);
  if (admin instanceof Response) return admin;
  const { id } = await ctx.params;
  return markHandled(Number(id)) ? new Response(null, { status: 204 }) : Response.json({ error: "introuvable" }, { status: 404 });
}
