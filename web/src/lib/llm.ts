import { decryptSecret } from "@/lib/crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type Provider = "openai" | "anthropic";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
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

export async function loadUserApiKey(userId: string, provider: Provider) {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("api_keys")
    .select("encrypted_key")
    .eq("user_id", userId)
    .eq("provider", provider)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data?.encrypted_key) throw new Error("API key not set for provider");

  return decryptSecret(data.encrypted_key);
}

export type ReasoningEffort = "none" | "low" | "medium" | "high" | "xhigh";
export type Verbosity = "low" | "medium" | "high";

function safeEnqueue(controller: ReadableStreamDefaultController<Uint8Array>, chunk: Uint8Array) {
  try {
    controller.enqueue(chunk);
  } catch {
    // ignore enqueue errors (e.g. if consumer disconnected)
  }
}

function normalizeSseLine(line: string): string {
  // Some providers use CRLF; keep parsing consistent.
  return line.endsWith("\r") ? line.slice(0, -1) : line;
}

// Non-streaming version (for compare endpoint)
export async function sendChat(params: {
  provider: Provider;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  userId: string;
  reasoningEffort?: ReasoningEffort;
  verbosity?: Verbosity;
}): Promise<ChatResponse> {
  const apiKey = await loadUserApiKey(params.userId, params.provider);

  switch (params.provider) {
    case "openai":
      return await callOpenAINonStream({
        apiKey,
        model: params.model,
        messages: params.messages,
        temperature: params.temperature,
        maxTokens: params.maxTokens,
        reasoningEffort: params.reasoningEffort,
        verbosity: params.verbosity,
      });

    case "anthropic":
      return await callAnthropicNonStream({
        apiKey,
        model: params.model,
        messages: params.messages,
        temperature: params.temperature,
        maxTokens: params.maxTokens,
      });

    default: {
      const _exhaustive: never = params.provider;
      return _exhaustive;
    }
  }
}

// Streaming version - returns a ReadableStream
export async function sendChatStream(params: {
  provider: Provider;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  userId: string;
  reasoningEffort?: ReasoningEffort;
  verbosity?: Verbosity;
}): Promise<ReadableStream<Uint8Array>> {
  const apiKey = await loadUserApiKey(params.userId, params.provider);

  switch (params.provider) {
    case "openai":
      return await callOpenAIStream({
        apiKey,
        model: params.model,
        messages: params.messages,
        temperature: params.temperature,
        maxTokens: params.maxTokens,
        reasoningEffort: params.reasoningEffort,
        verbosity: params.verbosity,
      });

    case "anthropic":
      return await callAnthropicStream({
        apiKey,
        model: params.model,
        messages: params.messages,
        temperature: params.temperature,
        maxTokens: params.maxTokens,
      });

    default: {
      const _exhaustive: never = params.provider;
      return _exhaustive;
    }
  }
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
}): Promise<ReadableStream<Uint8Array>> {
  const isReasoningModel = params.model.includes("gpt-5") || params.model.includes("o1") || params.model.includes("o3");
  
  // Use Responses API for GPT-5 models, Chat Completions for others
  if (isReasoningModel) {
    return callOpenAIResponsesStream(params);
  } else {
    return callOpenAIChatCompletionsStream(params);
  }
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
}): Promise<ReadableStream<Uint8Array>> {
  // Build request body for Responses API
  const body: Record<string, unknown> = {
    model: params.model,
    input: params.messages,
    stream: true,
  };

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
              } else if (event.type === "response.completed") {
                // Final response with usage
                if (event.response?.usage) {
                  usage = {
                    inputTokens: event.response.usage.input_tokens,
                    outputTokens: event.response.usage.output_tokens,
                    reasoningTokens: event.response.usage.output_tokens_details?.reasoning_tokens || 0,
                  };
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

// Anthropic streaming
async function callAnthropicStream(params: {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
}): Promise<ReadableStream<Uint8Array>> {
  const { system, messages } = splitSystem(params.messages);

  // Check if this is Claude Sonnet 4 (supports extended thinking)
  const supportsThinking = params.model.includes("claude-sonnet-4") || params.model.includes("claude-opus-4");

  const body: Record<string, unknown> = {
    model: params.model,
    max_tokens: params.maxTokens ?? 16000,
    system,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    stream: true,
  };

  if (params.temperature !== undefined && !supportsThinking) {
    body.temperature = params.temperature;
  }

  // Enable extended thinking for Claude Sonnet 4
  if (supportsThinking) {
    body.thinking = {
      type: "enabled",
      budget_tokens: 10000,
    };
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": params.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    const message = data?.error?.message ?? `Anthropic request failed (${res.status})`;
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
      let usage = { inputTokens: 0, outputTokens: 0 };

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

            try {
              const event = JSON.parse(data);
              
              // Text delta
              if (event.type === "content_block_delta") {
                if (event.delta?.type === "text_delta") {
                  safeEnqueue(controller, encoder.encode(`data: ${JSON.stringify({ type: "text", delta: event.delta.text })}\n\n`));
                } else if (event.delta?.type === "thinking_delta") {
                  // Extended thinking delta
                  safeEnqueue(controller, encoder.encode(`data: ${JSON.stringify({ type: "thinking", delta: event.delta.thinking })}\n\n`));
                }
              }
              
              // Usage
              if (event.type === "message_delta" && event.usage) {
                usage.outputTokens = event.usage.output_tokens;
              }
              if (event.type === "message_start" && event.message?.usage) {
                usage.inputTokens = event.message.usage.input_tokens;
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
        const message = e instanceof Error ? e.message : "Anthropic stream failed";
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

function splitSystem(messages: ChatMessage[]): {
  system?: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
} {
  const systemParts = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .filter(Boolean);

  const rest = messages.filter((m) => m.role !== "system");

  return {
    system: systemParts.length ? systemParts.join("\n\n") : undefined,
    messages: rest.map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    })),
  };
}

// Non-streaming OpenAI (for compare)
async function callOpenAINonStream(params: {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  reasoningEffort?: ReasoningEffort;
  verbosity?: Verbosity;
}): Promise<ChatResponse> {
  const isReasoningModel = params.model.includes("gpt-5") || params.model.includes("o1") || params.model.includes("o3");
  
  const body: Record<string, unknown> = {
    model: params.model,
    messages: params.messages,
  };

  if (isReasoningModel && params.reasoningEffort) {
    body.reasoning_effort = params.reasoningEffort;
  }
  if (params.verbosity) {
    body.verbosity = params.verbosity;
  }
  if (!isReasoningModel || !params.reasoningEffort || params.reasoningEffort === "none") {
    if (params.temperature !== undefined) {
      body.temperature = params.temperature;
    }
  }
  if (params.maxTokens) {
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

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(data?.error?.message ?? `OpenAI request failed (${res.status})`);
  }

  const choice = data?.choices?.[0];
  return {
    text: choice?.message?.content ?? "",
    usage: data?.usage ? {
      inputTokens: data.usage.prompt_tokens,
      outputTokens: data.usage.completion_tokens,
      reasoningTokens: data.usage.completion_tokens_details?.reasoning_tokens,
    } : undefined,
  };
}

// Non-streaming Anthropic (for compare)
async function callAnthropicNonStream(params: {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
}): Promise<ChatResponse> {
  const { system, messages } = splitSystem(params.messages);

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": params.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: params.model,
      max_tokens: params.maxTokens ?? 4096,
      system,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      temperature: params.temperature,
    }),
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(data?.error?.message ?? `Anthropic request failed (${res.status})`);
  }

  const blocks = data?.content ?? [];
  return {
    text: blocks.find((c: { type?: string; text?: string }) => c?.type === "text")?.text ?? "",
    usage: data?.usage ? {
      inputTokens: data.usage.input_tokens,
      outputTokens: data.usage.output_tokens,
    } : undefined,
  };
}

