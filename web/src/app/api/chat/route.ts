import { z } from "zod";

import { requireUser } from "@/lib/api/auth";
import { sendChatStream, loadUserApiKey } from "@/lib/llm";
import {
  needsSummarization,
  splitForSummarization,
  createSummarizationPrompt,
  buildMessagesWithSummary,
  type MessageForContext,
} from "@/lib/context";

export const runtime = "nodejs";
export const maxDuration = 300;

// Support both text and image content
const ContentPartSchema = z.union([
  z.object({ type: z.literal("text"), text: z.string() }),
  z.object({ type: z.literal("image_url"), image_url: z.object({ url: z.string() }) }),
]);

const MessageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.union([z.string().min(1), z.array(ContentPartSchema).min(1)]),
});

const ReasoningEffortSchema = z.enum(["none", "low", "medium", "high", "xhigh"]);
const VerbositySchema = z.enum(["low", "medium", "high"]);

const WebSearchSchema = z
  .object({
    enabled: z.boolean(),
    maxResults: z.number().int().min(1).max(20).optional(),
  })
  .optional();

const BodySchema = z.object({
  model: z.string().min(1),
  messages: z.array(MessageSchema).min(1),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).max(32000).optional(),
  reasoningEffort: ReasoningEffortSchema.optional(),
  verbosity: VerbositySchema.optional(),
  webSearch: WebSearchSchema,
});

// Quick summarization call (same model, reasoning=none, verbosity=high)
async function summarizeMessages(
  apiKey: string,
  messages: MessageForContext[]
): Promise<string> {
  const prompt = createSummarizationPrompt(messages);
  
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-5.2-2025-12-11",
      input: [{ role: "user", content: prompt }],
      reasoning: { effort: "none" },
      text: { verbosity: "high" },
      max_output_tokens: 1000,
    }),
  });

  if (!res.ok) {
    throw new Error("Summarization failed");
  }

  const data = await res.json();
  // Responses API 응답에서 텍스트 추출
  const output = data.output ?? [];
  const textItem = output.find((item: { type: string }) => item.type === "message");
  return textItem?.content?.[0]?.text ?? "";
}

// Convert API messages to context format
function toContextMessages(messages: Array<{ role: string; content: unknown }>): MessageForContext[] {
  return messages.map((m) => {
    let content = "";
    let images: string[] | undefined;
    
    if (typeof m.content === "string") {
      content = m.content;
    } else if (Array.isArray(m.content)) {
      const parts = m.content as Array<{ type: string; text?: string; image_url?: { url: string } }>;
      content = parts
        .filter((p) => p.type === "text")
        .map((p) => p.text ?? "")
        .join("\n");
      images = parts
        .filter((p) => p.type === "image_url")
        .map((p) => p.image_url?.url ?? "")
        .filter(Boolean);
    }
    
    return {
      role: m.role as "user" | "assistant" | "system",
      content,
      images: images?.length ? images : undefined,
    };
  });
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

    const webSearchEnabled = body.webSearch?.enabled === true;
    
    // Check if context needs summarization
    let messages = body.messages;
    const contextMessages = toContextMessages(messages);
    
    if (needsSummarization(contextMessages, body.model)) {
      try {
        const apiKey = await loadUserApiKey(user.id);
        const { toSummarize, toKeep } = splitForSummarization(contextMessages, 3);
        
        if (toSummarize.length > 0) {
          const summary = await summarizeMessages(apiKey, toSummarize);
          const summarizedContext = buildMessagesWithSummary(summary, toKeep);
          
          // Convert back to API message format
          messages = summarizedContext.map((m) => ({
            role: m.role,
            content: m.content,
          }));
        }
      } catch {
        // If summarization fails, proceed with original messages
        // (may fail later due to context limit, but better than blocking)
      }
    }

    let stream = await sendChatStream({
      model: body.model,
      messages,
      temperature: body.temperature,
      maxTokens: body.maxTokens,
      userId: user.id,
      reasoningEffort: body.reasoningEffort,
      verbosity: body.verbosity,
      webSearch: webSearchEnabled ? { enabled: true, toolChoice: "required" } : undefined,
    });

    stream = wrapSseStream(stream, {
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

