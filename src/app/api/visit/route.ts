import { randomUUID } from "node:crypto";
import { readCookie } from "@/lib/auth";
import { isMobile, logVisit, VISITOR_COOKIE } from "@/lib/stats";

/** Appelé une fois à l'ouverture de l'assistant, pour compter les visiteurs. */
export async function POST(request: Request) {
  let visitor = readCookie(request, VISITOR_COOKIE);
  const isNew = !visitor || !/^[\w-]{8,64}$/.test(visitor);
  if (isNew) visitor = randomUUID();
  try {
    logVisit(visitor!, isMobile(request.headers.get("user-agent")));
  } catch (err) {
    console.error("[visit]", err);
  }
  const headers = new Headers();
  if (isNew) headers.append("Set-Cookie", `${VISITOR_COOKIE}=${visitor}; Path=/; Max-Age=31536000; SameSite=Lax; HttpOnly`);
  return new Response(null, { status: 204, headers });
}
