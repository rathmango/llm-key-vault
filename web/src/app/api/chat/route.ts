import { z } from "zod";

import { requireUser } from "@/lib/api/auth";
import { sendChatStream, loadUserApiKey } from "@/lib/llm";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
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
  content: z.union([z.string(), z.array(ContentPartSchema).min(1)]),
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
  sessionId: z.string().min(1).optional(),
  assistantMessageId: z.string().uuid().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).max(32000).optional(),
  reasoningEffort: ReasoningEffortSchema.optional(),
  verbosity: VerbositySchema.optional(),
  webSearch: WebSearchSchema,
});

function extractKeywords(text: string): string[] {
  const raw = text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);

  const stop = new Set([
    "the",
    "a",
    "an",
    "and",
    "or",
    "to",
    "of",
    "in",
    "on",
    "for",
    "with",
    "is",
    "are",
    "was",
    "were",
    "이",
    "그",
    "저",
    "것",
    "수",
    "좀",
    "왜",
    "뭐",
    "뭔",
    "어떤",
    "어떻게",
    "그리고",
    "하지만",
    "또",
    "내",
    "나",
    "너",
    "우리",
    "지금",
    "영상",
    "유튜브",
    "youtube",
  ]);

  const uniq: string[] = [];
  for (const t of raw) {
    if (t.length < 2) continue;
    if (stop.has(t)) continue;
    if (!uniq.includes(t)) uniq.push(t);
    if (uniq.length >= 10) break;
  }
  return uniq;
}

function buildTranscriptSnippets(transcript: string, userText: string): string {
  const lines = transcript.split("\n");
  const keywords = extractKeywords(userText);
  if (keywords.length === 0) return "";

  const matches: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].toLowerCase();
    if (keywords.some((k) => l.includes(k))) {
      matches.push(i);
      if (matches.length >= 40) break;
    }
  }

  if (matches.length === 0) return "";

  const picked: string[] = [];
  const seen = new Set<number>();
  for (const idx of matches) {
    for (const j of [idx - 1, idx, idx + 1]) {
      if (j < 0 || j >= lines.length) continue;
      if (seen.has(j)) continue;
      seen.add(j);
      picked.push(lines[j]);
      if (picked.join("\n").length > 12_000) break;
    }
    if (picked.join("\n").length > 12_000) break;
  }

  return picked.join("\n").trim();
}

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

    const supabase = getSupabaseAdmin();
    const sessionId = body.sessionId ?? null;
    const assistantMessageId = body.assistantMessageId ?? null;

    // Best-effort: create/attach assistant message row up front so results persist
    if (sessionId && assistantMessageId) {
      try {
        const { data: session } = await supabase
          .from("chat_sessions")
          .select("id")
          .eq("id", sessionId)
          .eq("user_id", user.id)
          .single();
        if (session) {
          await supabase
            .from("chat_messages")
            .upsert(
              {
                id: assistantMessageId,
                session_id: sessionId,
                role: "assistant",
                content: "",
              },
              { onConflict: "id" }
            );
          await supabase
            .from("chat_sessions")
            .update({ updated_at: new Date().toISOString() })
            .eq("id", sessionId);
        }
      } catch {
        // ignore
      }
    }
    
    // Attach stored video transcript context (if available) WITHOUT printing it.
    // This enables Lilys-style “always transcript” behind the scenes.
    let messages = body.messages;
    if (body.sessionId) {
      try {
        const supabase = getSupabaseAdmin();
        const { data: vc } = await supabase
          .from("video_contexts")
          .select("title,channel_title,url,description,summary_md,outline_md,transcript_text,transcript_source,transcript_language")
          .eq("session_id", body.sessionId)
          .eq("user_id", user.id)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const lastUser = [...messages].reverse().find((m) => m.role === "user");
        const lastUserText =
          typeof lastUser?.content === "string"
            ? lastUser.content
            : Array.isArray(lastUser?.content)
              ? (lastUser.content as Array<{ type: string; text?: string }>).filter((p) => p.type === "text").map((p) => p.text ?? "").join("\n")
              : "";

        if (vc) {
          const systemLines: string[] = [];
          systemLines.push("[Video context for this chat session]");
          if (typeof vc.title === "string" && vc.title.trim()) systemLines.push(`Title: ${vc.title}`);
          if (typeof vc.channel_title === "string" && vc.channel_title.trim()) systemLines.push(`Channel: ${vc.channel_title}`);
          if (typeof vc.url === "string" && vc.url.trim()) systemLines.push(`URL: ${vc.url}`);
          if (typeof vc.transcript_language === "string" && vc.transcript_language.trim()) systemLines.push(`Transcript language: ${vc.transcript_language}`);
          if (typeof vc.transcript_source === "string" && vc.transcript_source.trim()) systemLines.push(`Transcript source: ${vc.transcript_source}`);

          const transcriptText = typeof vc.transcript_text === "string" ? vc.transcript_text : "";
          const hasTranscript = transcriptText.trim().length > 0;

          const hasSummary = typeof vc.summary_md === "string" && vc.summary_md.trim().length > 0;
          if (!hasSummary && typeof vc.description === "string" && vc.description.trim()) {
            systemLines.push("");
            systemLines.push("Description (metadata, do NOT quote verbatim; use it only to infer high-level topics):");
            systemLines.push(vc.description.trim().slice(0, 1200));
          }

          if (hasSummary) {
            systemLines.push("");
            systemLines.push("Summary (md):");
            systemLines.push((vc.summary_md ?? "").trim());
          }

          if (typeof vc.outline_md === "string" && vc.outline_md.trim()) {
            systemLines.push("");
            systemLines.push("Timestamp outline (md):");
            systemLines.push(vc.outline_md.trim());
          }

          if (hasTranscript) {
            const snippets = buildTranscriptSnippets(transcriptText, lastUserText);
            if (snippets) {
              systemLines.push("");
              systemLines.push(
                "Relevant transcript snippets (timestamped). Use these for factual answers; do not quote the entire transcript unless asked:"
              );
              systemLines.push(snippets);
            }
          } else {
            systemLines.push("");
            systemLines.push("Behavior when transcript is not ready:");
            systemLines.push(
              "- You CAN and SHOULD talk about what the video is likely about, based on the title/description/summary. Do not say 'there is no way to know the video content'."
            );
            systemLines.push(
              "- Be proactive: start with a short inferred summary (paraphrase, do not quote the description verbatim), then answer the user's question with reasonable high-level inference grounded in metadata."
            );
            systemLines.push(
              "- Do NOT invent precise quotes, numbers, or claims that would require the actual transcript."
            );
            systemLines.push(
              "- If the user asks for an exact quote or a very specific claim, say you can't confirm that exact detail yet, but offer the most helpful answer you can from metadata and ask a clarifying question."
            );
          }

          const systemMsg: z.infer<typeof MessageSchema> = { role: "system", content: systemLines.join("\n") };
          messages = [systemMsg, ...messages];
        }
      } catch {
        // ignore context attach errors
      }
    }

    // Check if context needs summarization
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

    const upstream = await sendChatStream({
      model: body.model,
      messages,
      temperature: body.temperature,
      maxTokens: body.maxTokens,
      userId: user.id,
      reasoningEffort: body.reasoningEffort,
      verbosity: body.verbosity,
      // Allow (not force) the model to use web_search. Forcing tool usage can cause throttling on some sources.
      webSearch: webSearchEnabled ? { enabled: true, toolChoice: "auto" } : undefined,
    });

    // Wrap stream:
    // - add keep-alives
    // - persist assistant output to DB even if client navigates away
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    let clientClosed = false;
    let assistantText = "";
    let assistantThinking = "";
    let assistantSources: unknown | null = null;
    let assistantUsage:
      | { inputTokens?: number; outputTokens?: number; reasoningTokens?: number }
      | null = null;
    let lastPersistAt = 0;

    const persist = async (force: boolean = false) => {
      if (!sessionId || !assistantMessageId) return;
      const now = Date.now();
      if (!force && now - lastPersistAt < 1200) return;
      lastPersistAt = now;
      try {
        await supabase
          .from("chat_messages")
          .update({
            content: assistantText,
            thinking: assistantThinking || null,
            sources: assistantSources,
            usage_input_tokens: assistantUsage?.inputTokens ?? null,
            usage_output_tokens: assistantUsage?.outputTokens ?? null,
            usage_reasoning_tokens: assistantUsage?.reasoningTokens ?? null,
          })
          .eq("id", assistantMessageId)
          .eq("session_id", sessionId);
        await supabase
          .from("chat_sessions")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", sessionId);
      } catch {
        // ignore persistence failures
      }
    };

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const safeEnqueue = (text: string) => {
          if (clientClosed) return;
          try {
            controller.enqueue(encoder.encode(text));
          } catch {
            clientClosed = true;
          }
        };

        // Flush early
        safeEnqueue(": stream-start\n\n");

        const heartbeat = setInterval(() => {
          safeEnqueue(": keep-alive\n\n");
        }, 15_000);

        const reader = upstream.getReader();
        let buffer = "";
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            if (value) {
              // Forward as-is (already in SSE format)
              if (!clientClosed) {
                try {
                  controller.enqueue(value);
                } catch {
                  clientClosed = true;
                }
              }

              // Parse events for persistence
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split("\n");
              buffer = lines.pop() || "";
              for (const line of lines) {
                const normalized = line.endsWith("\r") ? line.slice(0, -1) : line;
                if (!normalized.startsWith("data: ")) continue;
                const data = normalized.slice(6);
                if (!data || data === "[DONE]") continue;
                try {
                  const ev = JSON.parse(data) as { type?: string; delta?: string; sources?: unknown; usage?: unknown; error?: unknown };
                  if (ev.type === "text" && typeof ev.delta === "string") {
                    assistantText += ev.delta;
                    await persist(false);
                  } else if (ev.type === "thinking" && typeof ev.delta === "string") {
                    assistantThinking += ev.delta;
                    await persist(false);
                  } else if (ev.type === "sources") {
                    assistantSources = (ev as { sources?: unknown }).sources ?? null;
                    await persist(false);
                  } else if (ev.type === "usage") {
                    assistantUsage = (ev as { usage?: { inputTokens?: number; outputTokens?: number; reasoningTokens?: number } }).usage ?? null;
                    await persist(false);
                  } else if (ev.type === "error") {
                    // Persist whatever we have (best-effort)
                    await persist(true);
                  }
                } catch {
                  // ignore
                }
              }
            }
          }

          // Final persist
          await persist(true);
        } finally {
          clearInterval(heartbeat);
          try {
            reader.releaseLock();
          } catch {
            // ignore
          }
          try {
            controller.close();
          } catch {
            // ignore
          }
        }
      },
      async cancel() {
        // If client disconnects, we keep consuming upstream to persist to DB (best-effort).
        clientClosed = true;
      },
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

