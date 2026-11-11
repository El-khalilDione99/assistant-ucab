import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DATA_DIR, db, get, run } from "./db";

export const MAX_ADMINS = 2;
export const SESSION_COOKIE = "ucab-admin";
const SESSION_DAYS = 7;

export type Admin = { id: number; email: string; name: string };

/* ---------- Mots de passe ---------- */

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

function checkPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const hash = scryptSync(password, Buffer.from(saltHex, "hex"), 64);
  return timingSafeEqual(hash, Buffer.from(hashHex, "hex"));
}

export function passwordProblem(password: string): string | null {
  if (password.length < 8) return "Le mot de passe doit faire au moins 8 caractères.";
  return null;
}

/* ---------- Premier compte ---------- */

/**
 * S'il n'existe encore aucun compte, on crée le premier à partir des variables
 * ADMIN_EMAIL et ADMIN_PASSWORD. Le second compte s'ajoute ensuite depuis l'écran « Comptes ».
 */
function ensureFirstAdmin() {
  const count = get<{ n: number }>("SELECT COUNT(*) AS n FROM admins")!.n;
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (count === 0 && email && password) {
    run(
      "INSERT INTO admins (email, name, pass_hash, created_at) VALUES (?, ?, ?, ?)",
      email,
      process.env.ADMIN_NAME?.trim() || "Référent UCAB",
      hashPassword(password),
      Date.now(),
    );
  }
}

export function hasAnyAdmin(): boolean {
  ensureFirstAdmin();
  return get<{ n: number }>("SELECT COUNT(*) AS n FROM admins")!.n > 0;
}

/** Change le mot de passe d'un compte. Renvoie une nouvelle session, ou null si l'ancien est faux. */
export function changePassword(id: number, current: string, next: string) {
  const row = get<{ pass_hash: string }>("SELECT pass_hash FROM admins WHERE id = ?", id);
  if (!row || !checkPassword(current, row.pass_hash)) return null;
  const hash = hashPassword(next);
  run("UPDATE admins SET pass_hash = ? WHERE id = ?", hash, id);
  const maxAge = SESSION_DAYS * 24 * 3600;
  return { token: sessionToken(id, hash, Date.now() + maxAge * 1000), maxAge };
}

/* ---------- Session (cookie signé) ---------- */

function secret(): string {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  // Sans variable, on crée une clé aléatoire gardée dans le dossier des données.
  db();
  const file = path.join(DATA_DIR, "session-secret");
  if (!existsSync(file)) writeFileSync(file, randomBytes(32).toString("hex"), { mode: 0o600 });
  return readFileSync(file, "utf8").trim();
}

function sign(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

/** La signature dépend aussi du mot de passe : le changer déconnecte les anciennes sessions. */
function sessionToken(id: number, passHash: string, expires: number): string {
  const body = `${id}.${expires}`;
  return `${body}.${sign(`${body}.${passHash}`)}`;
}

export function login(email: string, password: string): { token: string; maxAge: number } | null {
  ensureFirstAdmin();
  const row = get<{ id: number; pass_hash: string }>(
    "SELECT id, pass_hash FROM admins WHERE email = ?",
    email.trim().toLowerCase(),
  );
  if (!row || !checkPassword(password, row.pass_hash)) return null;
  const maxAge = SESSION_DAYS * 24 * 3600;
  return { token: sessionToken(row.id, row.pass_hash, Date.now() + maxAge * 1000), maxAge };
}

export function adminFromToken(token: string | undefined): Admin | null {
  if (!token) return null;
  const [id, expires, sig] = token.split(".");
  if (!id || !expires || !sig || Number(expires) < Date.now()) return null;
  const row = get<Admin & { pass_hash: string }>(
    "SELECT id, email, name, pass_hash FROM admins WHERE id = ?",
    Number(id),
  );
  if (!row) return null;
  const expected = sessionToken(row.id, row.pass_hash, Number(expires)).split(".")[2];
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return { id: row.id, email: row.email, name: row.name };
}

function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get("cookie") || "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

export function adminFromRequest(request: Request): Admin | null {
  return adminFromToken(readCookie(request, SESSION_COOKIE));
}

export function sessionCookie(token: string, maxAge: number): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export { readCookie };

/** À appeler en tête de chaque route d'administration. */
export function requireAdmin(request: Request): Admin | Response {
  const admin = adminFromRequest(request);
  return admin ?? Response.json({ error: "non_connecte" }, { status: 401 });
}

/* ---------- Limite des essais de connexion ---------- */

const attempts = new Map<string, number[]>();

export function tooManyLogins(ip: string): boolean {
  const now = Date.now();
  const recent = (attempts.get(ip) || []).filter((t) => now - t < 15 * 60_000);
  attempts.set(ip, recent);
  return recent.length >= 10;
}

export function recordFailedLogin(ip: string) {
  attempts.set(ip, [...(attempts.get(ip) || []), Date.now()]);
}

export function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}
