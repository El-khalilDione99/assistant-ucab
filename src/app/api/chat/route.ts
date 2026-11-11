import { streamAnswer, MissingKeyError, type ChatMessage } from "@/lib/ai";
import { loadKnowledge } from "@/lib/knowledge";
import { buildSystemPrompt } from "@/lib/prompt";
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
  const system = buildSystemPrompt(await loadKnowledge(), uiLang);
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

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        if (!first.done) controller.enqueue(encoder.encode(first.value));
        for (;;) {
          const { value, done } = await iterator.next();
          if (done) break;
          controller.enqueue(encoder.encode(value));
        }
      } catch (err) {
        console.error("[chat] stream", err);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
