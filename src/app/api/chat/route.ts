import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { streamAnswer, MissingKeyError, type ChatMessage } from "@/lib/ai";
import { readCookie } from "@/lib/auth";
import { contextFor } from "@/lib/knowledge";
import { buildSystemPrompt, NO_ANSWER } from "@/lib/prompt";
import { isMobile, logQuestion, VISITOR_COOKIE } from "@/lib/stats";
import type { Lang } from "@/lib/i18n";

const MAX_MESSAGES = 12; // historique envoyé à l'IA
const MAX_CHARS = 600; // longueur maximale d'un message
const RATE_LIMIT = 15; // questions par minute et par visiteur

const hits = new Map<string, number[]>();

function tooManyRequests(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > RATE_LIMIT;
}

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (tooManyRequests(ip)) return Response.json({ error: "rate_limited" }, { status: 429 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  const { messages, lang } = (body ?? {}) as { messages?: unknown; lang?: unknown };
  if (!Array.isArray(messages) || messages.length === 0) {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  const clean: ChatMessage[] = messages
    .slice(-MAX_MESSAGES)
    .filter(
      (m): m is ChatMessage =>
        !!m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim() !== "",
    )
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));

  // La conversation doit commencer et finir par un message de l'utilisateur.
  while (clean.length && clean[0].role !== "user") clean.shift();
  if (!clean.length || clean[clean.length - 1].role !== "user") {
    return Response.json({ error: "bad_request" }, { status: 400 });
  }

  const uiLang: Lang = lang === "ar" ? "ar" : "fr";
  const question = clean[clean.length - 1].content;
  // On cherche dans les documents avec la question et la précédente (pour « et pour le master ? »).
  const userTurns = clean.filter((m) => m.role === "user").slice(-2).map((m) => m.content);
  const system = buildSystemPrompt(await contextFor(userTurns.join("\n")), uiLang);
  const iterator = streamAnswer(system, clean);

  // On attend le premier morceau pour pouvoir renvoyer une vraie erreur si l'IA ne répond pas.
  let first: IteratorResult<string>;
  try {
    first = await iterator.next();
  } catch (err) {
    console.error("[chat]", err);
    const status = err instanceof MissingKeyError ? 503 : 502;
    return Response.json({ error: "ai_unavailable" }, { status });
  }

  let visitor = readCookie(request, VISITOR_COOKIE);
  const newVisitor = !visitor || !/^[\w-]{8,64}$/.test(visitor);
  if (newVisitor) visitor = randomUUID();
  const mobile = isMobile(request.headers.get("user-agent"));
  const answerLang: "fr" | "ar" = /[؀-ۿ]/.test(question) ? "ar" : "fr";

  const encoder = new TextEncoder();
  let full = "";
  let sent = 0;
  let finished: (answered: boolean | null) => void = () => {};
  const done = new Promise<boolean | null>((resolve) => (finished = resolve));

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // Le code « sans réponse » ne doit jamais apparaître à l'écran :
      // on garde toujours la fin du texte en réserve tant qu'elle pourrait en être le début.
      const flush = () => {
        let visible = full.replace(NO_ANSWER, "");
        for (let k = NO_ANSWER.length - 1; k > 0; k--) {
          if (visible.endsWith(NO_ANSWER.slice(0, k))) {
            visible = visible.slice(0, -k);
            break;
          }
        }
        // Les espaces de fin attendent le morceau suivant (ils peuvent précéder le code).
        visible = visible.trimEnd();
        if (visible.length > sent) {
          controller.enqueue(encoder.encode(visible.slice(sent)));
          sent = visible.length;
        }
      };
      let ok = true;
      try {
        if (!first.done) full += first.value;
        flush();
        for (;;) {
          const { value, done } = await iterator.next();
          if (done) break;
          full += value;
          flush();
        }
      } catch (err) {
        ok = false;
        console.error("[chat] stream", err);
      } finally {
        flush();
        controller.close();
        finished(ok && full.trim() ? !full.includes(NO_ANSWER) : null);
      }
    },
  });

  // Après la réponse : on note la question pour le tableau de bord.
  after(async () => {
    const answered = await done;
    if (answered === null) return;
    try {
      logQuestion({ visitor: visitor!, lang: answerLang, mobile, answered, text: question });
    } catch (err) {
      console.error("[chat] stats", err);
    }
  });

  const headers = new Headers({ "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
  if (newVisitor) {
    headers.append("Set-Cookie", `${VISITOR_COOKIE}=${visitor}; Path=/; Max-Age=31536000; SameSite=Lax; HttpOnly`);
  }
  return new Response(stream, { headers });
}
