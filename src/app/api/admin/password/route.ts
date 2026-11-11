import { changePassword, passwordProblem, requireAdmin, sessionCookie } from "@/lib/auth";

export async function POST(request: Request) {
  const admin = requireAdmin(request);
  if (admin instanceof Response) return admin;
  const { current, next } = ((await request.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
  if (typeof current !== "string" || typeof next !== "string") {
    return Response.json({ error: "Remplissez les deux champs." }, { status: 400 });
  }
  const problem = passwordProblem(next);
  if (problem) return Response.json({ error: problem }, { status: 400 });
  const session = changePassword(admin.id, current, next);
  if (!session) return Response.json({ error: "Le mot de passe actuel est incorrect." }, { status: 400 });
  return new Response(null, { status: 204, headers: { "Set-Cookie": sessionCookie(session.token, session.maxAge) } });
}
