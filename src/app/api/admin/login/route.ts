import { clientIp, hasAnyAdmin, login, recordFailedLogin, sessionCookie, tooManyLogins } from "@/lib/auth";

export async function POST(request: Request) {
  const ip = clientIp(request);
  if (tooManyLogins(ip)) {
    return Response.json({ error: "Trop d'essais. Réessayez dans 15 minutes." }, { status: 429 });
  }
  const { email, password } = ((await request.json().catch(() => ({}))) ?? {}) as { email?: unknown; password?: unknown };
  if (typeof email !== "string" || typeof password !== "string") {
    return Response.json({ error: "Saisissez votre e-mail et votre mot de passe." }, { status: 400 });
  }
  if (!hasAnyAdmin()) {
    return Response.json(
      { error: "Aucun compte n'existe encore. Renseignez ADMIN_EMAIL et ADMIN_PASSWORD dans la configuration du site." },
      { status: 503 },
    );
  }
  const session = login(email, password);
  if (!session) {
    recordFailedLogin(ip);
    return Response.json({ error: "E-mail ou mot de passe incorrect." }, { status: 401 });
  }
  return new Response(null, { status: 204, headers: { "Set-Cookie": sessionCookie(session.token, session.maxAge) } });
}
