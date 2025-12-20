import { z } from "zod";

import { requireUser } from "@/lib/api/auth";
import { sendChatStream } from "@/lib/llm";
import { searchWeb, type WebSearchSource } from "@/lib/webSearch";

export const runtime = "nodejs";
export const maxDuration = 300;

const ProviderSchema = z.enum(["openai", "anthropic"]);

const MessageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string().min(1),
});

const ReasoningEffortSchema = z.enum(["none", "low", "medium", "high", "xhigh"]);
const VerbositySchema = z.enum(["low", "medium", "high"]);

const WebSearchSchema = z
  .object({
    enabled: z.boolean(),
    maxResults: z.number().int().min(1).max(10).optional(),
  })
  .optional();

const BodySchema = z.object({
  provider: ProviderSchema,
  model: z.string().min(1),
  messages: z.array(MessageSchema).min(1),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).max(32000).optional(),
  // GPT-5.2 specific
  reasoningEffort: ReasoningEffortSchema.optional(),
  verbosity: VerbositySchema.optional(),
  webSearch: WebSearchSchema,
});

function formatWebSearchSystemPrompt(query: string, sources: WebSearchSource[]): string {
  const lines: string[] = [];
  lines.push("You have access to web search results provided by the system.");
  lines.push("Use them when relevant, and do not invent sources.");
  lines.push("When you use them, cite sources inline as [1], [2], ... and include a short 'Sources' section at the end with the URLs.");
  lines.push("");
  lines.push(`Query: ${query}`);
  lines.push("");
  lines.push("Search results:");
  for (let i = 0; i < sources.length; i++) {
    const s = sources[i];
    lines.push(`[${i + 1}] ${s.title}`);
    lines.push(`URL: ${s.url}`);
    if (s.snippet) lines.push(`Snippet: ${s.snippet}`);
    lines.push("");
  }
  return lines.join("\n");
}

function wrapSseStream(
  stream: ReadableStream<Uint8Array>,
  opts?: {
    prefaceEvents?: unknown[];
    heartbeatIntervalMs?: number;
  }
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const safeEnqueue = (text: string) => {
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          // ignore
        }
      };

      const heartbeatIntervalMs = opts?.heartbeatIntervalMs ?? 15_000;
      if (heartbeatIntervalMs > 0) {
        // Send an immediate comment line so intermediaries flush the stream early.
        safeEnqueue(": stream-start\n\n");
        heartbeat = setInterval(() => {
          safeEnqueue(": keep-alive\n\n");
        }, heartbeatIntervalMs);
      }

      for (const ev of opts?.prefaceEvents ?? []) {
        safeEnqueue(`data: ${JSON.stringify(ev)}\n\n`);
      }

      reader = stream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) controller.enqueue(value);
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : "Stream failed";
        safeEnqueue(`data: ${JSON.stringify({ type: "error", error: message })}\n\n`);
        safeEnqueue("data: [DONE]\n\n");
      } finally {
        if (heartbeat) clearInterval(heartbeat);
        reader.releaseLock();
        controller.close();
      }
    },
    async cancel(reason) {
      if (heartbeat) clearInterval(heartbeat);
      if (reader) await reader.cancel(reason);
    },
  });
}

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const body = BodySchema.parse(await request.json());

    let sourcesForUi: Array<{ title: string; url: string }> | null = null;
    let messages = body.messages;
    const openAiBuiltinWebSearchEnabled = body.provider === "openai" && body.webSearch?.enabled === true;

    if (body.webSearch?.enabled) {
      // For OpenAI, prefer the built-in `web_search` tool (Responses API).
      // For Anthropic, fall back to server-side search injection (requires TAVILY_API_KEY).
      if (openAiBuiltinWebSearchEnabled) {
        // No server-side search injection; tools are configured in the OpenAI request.
      } else {
      const query =
        [...body.messages].reverse().find((m) => m.role === "user")?.content?.trim() ||
        body.messages[body.messages.length - 1]?.content?.trim() ||
        "";

      if (query) {
        const sources = await searchWeb(query, { maxResults: body.webSearch.maxResults ?? 5 });
        sourcesForUi = sources.map((s) => ({ title: s.title, url: s.url }));

        const systemMsg = { role: "system" as const, content: formatWebSearchSystemPrompt(query, sources) };
        const systemMsgs = body.messages.filter((m) => m.role === "system");
        const rest = body.messages.filter((m) => m.role !== "system");
        messages = [...systemMsgs, systemMsg, ...rest];
      }
      }
    }

    let stream = await sendChatStream({
      provider: body.provider,
      model: body.model,
      messages,
      temperature: body.temperature,
      maxTokens: body.maxTokens,
      userId: user.id,
      reasoningEffort: body.reasoningEffort,
      verbosity: body.verbosity,
      webSearch: openAiBuiltinWebSearchEnabled ? { enabled: true, toolChoice: "required" } : undefined,
    });

    stream = wrapSseStream(stream, {
      prefaceEvents: sourcesForUi ? [{ type: "sources", sources: sourcesForUi }] : [],
      heartbeatIntervalMs: 15_000,
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        // Best-effort: disable buffering on some proxies (e.g. nginx).
        "X-Accel-Buffering": "no",
      },
    });
  } catch (e) {
    if (e instanceof Response) return e;

    if (e instanceof z.ZodError) {
      return Response.json({ error: e.message }, { status: 400 });
    }

    const message = e instanceof Error ? e.message : "Unexpected error";
    return Response.json({ error: message }, { status: 500 });
  }
}

