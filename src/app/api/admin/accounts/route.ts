import { hashPassword, MAX_ADMINS, passwordProblem, requireAdmin } from "@/lib/auth";
import { all, get, run } from "@/lib/db";

export async function GET(request: Request) {
  const admin = requireAdmin(request);
  if (admin instanceof Response) return admin;
  const accounts = all("SELECT id, email, name, created_at FROM admins ORDER BY id");
  return Response.json({ accounts, max: MAX_ADMINS, me: admin.id });
}

/** Ajoute le second compte, avec un mot de passe provisoire à transmettre à la personne. */
export async function POST(request: Request) {
  const admin = requireAdmin(request);
  if (admin instanceof Response) return admin;
  const { email, name, password } = ((await request.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return Response.json({ error: "Adresse e-mail invalide." }, { status: 400 });
  }
  if (typeof password !== "string" || passwordProblem(password)) {
    return Response.json({ error: passwordProblem(String(password ?? "")) }, { status: 400 });
  }
  if (get<{ n: number }>("SELECT COUNT(*) AS n FROM admins")!.n >= MAX_ADMINS) {
    return Response.json({ error: `${MAX_ADMINS} comptes au maximum. Retirez d'abord un compte.` }, { status: 400 });
  }
  const mail = email.trim().toLowerCase();
  if (get("SELECT 1 FROM admins WHERE email = ?", mail)) {
    return Response.json({ error: "Ce compte existe déjà." }, { status: 400 });
  }
  run(
    "INSERT INTO admins (email, name, pass_hash, created_at) VALUES (?, ?, ?, ?)",
    mail,
    (typeof name === "string" && name.trim()) || "Suppléant",
    hashPassword(password),
    Date.now(),
  );
  return new Response(null, { status: 201 });
}
