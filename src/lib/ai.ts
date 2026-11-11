import Anthropic from "@anthropic-ai/sdk";
import Groq from "groq-sdk";

export type ChatMessage = { role: "user" | "assistant"; content: string };

const MAX_TOKENS = 800;

/**
 * Fournisseur d'IA choisi par la variable AI_PROVIDER :
 * - "groq" (par défaut) : offre gratuite de Groq, clé GROQ_API_KEY
 * - "anthropic" : Claude, clé ANTHROPIC_API_KEY (payant à l'usage)
 * Renvoie le texte de la réponse morceau par morceau.
 */
export async function* streamAnswer(system: string, messages: ChatMessage[]): AsyncGenerator<string> {
  const provider = (process.env.AI_PROVIDER || "groq").toLowerCase();

  if (provider === "anthropic") {
    yield* streamAnthropic(system, messages);
  } else if (provider === "groq") {
    yield* streamGroq(system, messages);
  } else {
    throw new Error(`AI_PROVIDER inconnu : ${provider}`);
  }
}

async function* streamGroq(system: string, messages: ChatMessage[]): AsyncGenerator<string> {
  if (!process.env.GROQ_API_KEY) throw new MissingKeyError("GROQ_API_KEY");
  const client = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const stream = await client.chat.completions.create({
    model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
    max_tokens: MAX_TOKENS,
    temperature: 0.2,
    stream: true,
    messages: [{ role: "system", content: system }, ...messages],
  });
  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content;
    if (text) yield text;
  }
}

async function* streamAnthropic(system: string, messages: ChatMessage[]): AsyncGenerator<string> {
  if (!process.env.ANTHROPIC_API_KEY) throw new MissingKeyError("ANTHROPIC_API_KEY");
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const stream = client.messages.stream({
    model: process.env.ANTHROPIC_MODEL || "claude-haiku-5-5",
    max_tokens: MAX_TOKENS,
    // La base de connaissances est identique d'une question à l'autre : on la met en cache pour payer moins.
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages,
  });
  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      yield event.delta.text;
    }
  }
}

export class MissingKeyError extends Error {
  constructor(public keyName: string) {
    super(`La clé ${keyName} n'est pas configurée.`);
  }
}
