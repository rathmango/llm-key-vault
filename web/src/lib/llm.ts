import { decryptSecret } from "@/lib/crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>;
};

export type ChatResponse = {
  text: string;
  thinking?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    reasoningTokens?: number;
    totalTokens?: number;
  };
};

export async function loadUserApiKey(userId: string) {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("api_keys")
    .select("encrypted_key")
    .eq("user_id", userId)
    .eq("provider", "openai")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data?.encrypted_key) throw new Error("OpenAI API key not set");

  return decryptSecret(data.encrypted_key);
}

export type ReasoningEffort = "none" | "low" | "medium" | "high" | "xhigh";
export type Verbosity = "low" | "medium" | "high";

export type WebSearchConfig = {
  enabled: boolean;
  toolChoice?: "auto" | "required" | "none";
  externalWebAccess?: boolean;
};

function safeEnqueue(controller: ReadableStreamDefaultController<Uint8Array>, chunk: Uint8Array) {
  try {
    controller.enqueue(chunk);
  } catch {
    // ignore enqueue errors (e.g. if consumer disconnected)
  }
}

function normalizeSseLine(line: string): string {
  return line.endsWith("\r") ? line.slice(0, -1) : line;
}

// Streaming version - returns a ReadableStream
export async function sendChatStream(params: {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  userId: string;
  reasoningEffort?: ReasoningEffort;
  verbosity?: Verbosity;
  webSearch?: WebSearchConfig;
}): Promise<ReadableStream<Uint8Array>> {
  const apiKey = await loadUserApiKey(params.userId);

  return await callOpenAIStream({
    apiKey,
    model: params.model,
    messages: params.messages,
    temperature: params.temperature,
    maxTokens: params.maxTokens,
    reasoningEffort: params.reasoningEffort,
    verbosity: params.verbosity,
    webSearch: params.webSearch,
  });
}

// GPT-5.2 uses Responses API with streaming
async function callOpenAIStream(params: {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  reasoningEffort?: ReasoningEffort;
  verbosity?: Verbosity;
  webSearch?: WebSearchConfig;
}): Promise<ReadableStream<Uint8Array>> {
  const isReasoningModel = params.model.includes("gpt-5") || params.model.includes("o1") || params.model.includes("o3");
  const webSearchEnabled = params.webSearch?.enabled ?? false;
  
  // Web search tool is supported in the Responses API (Chat Completions requires specialized search models).
  // If web search is enabled, always use Responses API.
  if (isReasoningModel || webSearchEnabled) {
    return callOpenAIResponsesStream({
      apiKey: params.apiKey,
      model: params.model,
      messages: params.messages,
      temperature: params.temperature,
      maxTokens: params.maxTokens,
      reasoningEffort: params.reasoningEffort,
      verbosity: params.verbosity,
      webSearch: params.webSearch,
    });
  } else {
    return callOpenAIChatCompletionsStream(params);
  }
}

// Convert Chat Completions format to Responses API format
function convertToResponsesFormat(messages: ChatMessage[]): unknown[] {
  return messages.map((msg) => {
    if (typeof msg.content === "string") {
      return { role: msg.role, content: msg.content };
    }
    
    // Convert content parts to Responses API format
    const content = msg.content.map((part) => {
      if (part.type === "text") {
        return { type: "input_text", text: part.text };
      } else if (part.type === "image_url") {
        return { type: "input_image", image_url: part.image_url.url };
      }
      return part;
    });
    
    return { role: msg.role, content };
  });
}

// GPT-5.2 Responses API with streaming
async function callOpenAIResponsesStream(params: {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  reasoningEffort?: ReasoningEffort;
  verbosity?: Verbosity;
  webSearch?: WebSearchConfig;
}): Promise<ReadableStream<Uint8Array>> {
  // Build request body for Responses API
  const body: Record<string, unknown> = {
    model: params.model,
    input: convertToResponsesFormat(params.messages),
    stream: true,
  };

  const webSearchEnabled = params.webSearch?.enabled ?? false;
  if (webSearchEnabled) {
    // OpenAI built-in web search tool (Responses API)
    // Docs: tools: [{ type: "web_search" }], include: ["web_search_call.action.sources"]
    const tool: Record<string, unknown> = { type: "web_search" };
    if (typeof params.webSearch?.externalWebAccess === "boolean") {
      tool.external_web_access = params.webSearch.externalWebAccess;
    }
    body.tools = [tool];
    body.tool_choice = params.webSearch?.toolChoice ?? "required";
    body.include = ["web_search_call.action.sources"];
  }

  // Reasoning config
  if (params.reasoningEffort) {
    body.reasoning = {
      effort: params.reasoningEffort,
      summary: "auto", // Get reasoning summaries
    };
  }

  // Verbosity config
  if (params.verbosity) {
    body.text = {
      verbosity: params.verbosity,
    };
  }

  if (params.maxTokens) {
    body.max_output_tokens = params.maxTokens;
  }

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    const message = data?.error?.message ?? `OpenAI request failed (${res.status})`;
    throw new Error(message);
  }

  // Transform SSE to our format
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  
  return new ReadableStream({
    async start(controller) {
      const reader = res.body?.getReader();
      if (!reader) {
        controller.close();
        return;
      }

      let buffer = "";
      let usage = { inputTokens: 0, outputTokens: 0, reasoningTokens: 0 };
      let sourcesSent = false;

      const maybeEmitSources = (sources: unknown) => {
        if (sourcesSent) return;
        if (!Array.isArray(sources)) return;
        const normalized = sources
          .map((s) => ({
            title: typeof (s as { title?: unknown }).title === "string" ? (s as { title: string }).title : "",
            url: typeof (s as { url?: unknown }).url === "string" ? (s as { url: string }).url : "",
          }))
          .filter((s) => s.url.length > 0);
        if (normalized.length === 0) return;
        sourcesSent = true;
        safeEnqueue(controller, encoder.encode(`data: ${JSON.stringify({ type: "sources", sources: normalized })}\n\n`));
      };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const normalized = normalizeSseLine(line);
            if (!normalized.startsWith("data: ")) continue;
            const data = normalized.slice(6);
            if (data === "[DONE]") continue;

            try {
              const event = JSON.parse(data);
              
              // Handle different event types
              if (event.type === "response.output_text.delta") {
                // Text delta
                safeEnqueue(controller, encoder.encode(`data: ${JSON.stringify({ type: "text", delta: event.delta })}\n\n`));
              } else if (event.type === "response.reasoning_summary_text.delta") {
                // Reasoning summary delta
                safeEnqueue(controller, encoder.encode(`data: ${JSON.stringify({ type: "thinking", delta: event.delta })}\n\n`));
              } else if (webSearchEnabled && (event.type === "response.output_item.added" || event.type === "response.output_item.done")) {
                // Web search call output item
                const item = event.item;
                if (item?.type === "web_search_call") {
                  maybeEmitSources(item?.action?.sources);
                }
              } else if (event.type === "response.completed") {
                // Final response with usage
                if (event.response?.usage) {
                  usage = {
                    inputTokens: event.response.usage.input_tokens,
                    outputTokens: event.response.usage.output_tokens,
                    reasoningTokens: event.response.usage.output_tokens_details?.reasoning_tokens || 0,
                  };
                }
                // Fallback: sometimes sources only appear in the final response object
                if (webSearchEnabled && !sourcesSent) {
                  const output = event.response?.output;
                  if (Array.isArray(output)) {
                    const ws = output.find((o: { type?: unknown }) => (o as { type?: string })?.type === "web_search_call");
                    maybeEmitSources((ws as { action?: { sources?: unknown } })?.action?.sources);
                  }
                }
              }
            } catch {
              // Skip invalid JSON
            }
          }
        }

        // Send final usage
        safeEnqueue(controller, encoder.encode(`data: ${JSON.stringify({ type: "usage", usage })}\n\n`));
        safeEnqueue(controller, encoder.encode("data: [DONE]\n\n"));
      } catch (e) {
        const message = e instanceof Error ? e.message : "OpenAI stream failed";
        safeEnqueue(controller, encoder.encode(`data: ${JSON.stringify({ type: "error", error: message })}\n\n`));
        safeEnqueue(controller, encoder.encode(`data: ${JSON.stringify({ type: "usage", usage })}\n\n`));
        safeEnqueue(controller, encoder.encode("data: [DONE]\n\n"));
      } finally {
        controller.close();
        reader.releaseLock();
      }
    },
  });
}

// Chat Completions API streaming for non-reasoning models
async function callOpenAIChatCompletionsStream(params: {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  reasoningEffort?: ReasoningEffort;
  verbosity?: Verbosity;
}): Promise<ReadableStream<Uint8Array>> {
  const body: Record<string, unknown> = {
    model: params.model,
    messages: params.messages,
    stream: true,
    stream_options: { include_usage: true },
  };

  if (params.temperature !== undefined) {
    body.temperature = params.temperature;
  }
  if (params.maxTokens !== undefined) {
    body.max_tokens = params.maxTokens;
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    const message = data?.error?.message ?? `OpenAI request failed (${res.status})`;
    throw new Error(message);
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  return new ReadableStream({
    async start(controller) {
      const reader = res.body?.getReader();
      if (!reader) {
        controller.close();
        return;
      }

      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const normalized = normalizeSseLine(line);
            if (!normalized.startsWith("data: ")) continue;
            const data = normalized.slice(6);
            if (data === "[DONE]") {
              safeEnqueue(controller, encoder.encode("data: [DONE]\n\n"));
              continue;
            }

            try {
              const event = JSON.parse(data);
              const delta = event.choices?.[0]?.delta?.content;
              if (delta) {
                safeEnqueue(controller, encoder.encode(`data: ${JSON.stringify({ type: "text", delta })}\n\n`));
              }
              
              // Usage in final chunk
              if (event.usage) {
                safeEnqueue(controller, encoder.encode(`data: ${JSON.stringify({
                  type: "usage",
                  usage: {
                    inputTokens: event.usage.prompt_tokens,
                    outputTokens: event.usage.completion_tokens,
                    reasoningTokens: event.usage.completion_tokens_details?.reasoning_tokens || 0,
                  }
                })}\n\n`));
              }
            } catch {
              // Skip invalid JSON
            }
          }
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : "OpenAI stream failed";
        safeEnqueue(controller, encoder.encode(`data: ${JSON.stringify({ type: "error", error: message })}\n\n`));
        safeEnqueue(controller, encoder.encode("data: [DONE]\n\n"));
      } finally {
        controller.close();
        reader.releaseLock();
      }
    },
  });
}

