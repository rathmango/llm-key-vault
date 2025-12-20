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

export async function sendChat(params: {
  provider: Provider;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  userId: string;
  // GPT-5.2 specific
  reasoningEffort?: ReasoningEffort;
  verbosity?: Verbosity;
}): Promise<ChatResponse> {
  const apiKey = await loadUserApiKey(params.userId, params.provider);

  switch (params.provider) {
    case "openai":
      return await callOpenAI({
        apiKey,
        model: params.model,
        messages: params.messages,
        temperature: params.temperature,
        maxTokens: params.maxTokens,
        reasoningEffort: params.reasoningEffort,
        verbosity: params.verbosity,
      });

    case "anthropic":
      return await callAnthropic({
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

async function callOpenAI(params: {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  reasoningEffort?: ReasoningEffort;
  verbosity?: Verbosity;
}): Promise<ChatResponse> {
  // Build request body
  const body: Record<string, unknown> = {
    model: params.model,
    messages: params.messages,
  };

  // GPT-5.2 specific parameters - use proper nested structure
  const isReasoningModel = params.model.includes("gpt-5") || params.model.includes("o1") || params.model.includes("o3");
  
  if (isReasoningModel && params.reasoningEffort && params.reasoningEffort !== "none") {
    body.reasoning = {
      effort: params.reasoningEffort,
      summary: "auto", // Request reasoning summary
    };
  }
  
  if (params.verbosity !== undefined) {
    body.text = {
      verbosity: params.verbosity,
    };
  }

  // temperature/top_p only supported when NOT using reasoning
  if (!isReasoningModel || !params.reasoningEffort || params.reasoningEffort === "none") {
    if (params.temperature !== undefined) {
      body.temperature = params.temperature;
    }
  }
  if (params.maxTokens !== undefined) {
    body.max_tokens = params.maxTokens;
  }

  console.log("OpenAI request body:", JSON.stringify(body, null, 2));

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => null);
  
  // Debug log
  console.log("OpenAI response:", JSON.stringify(data, null, 2));

  if (!res.ok) {
    const message =
      data?.error?.message ??
      (typeof data === "string" ? data : null) ??
      `OpenAI request failed (${res.status})`;
    throw new Error(message);
  }

  const choice = data?.choices?.[0];
  const text: string = choice?.message?.content ?? "";
  
  // GPT-5.2 reasoning summary locations:
  // 1. message.reasoning_content (most common)
  // 2. message.reasoning (alternative)
  // 3. reasoning array with summary items
  let thinking: string | undefined = 
    choice?.message?.reasoning_content ?? 
    choice?.message?.reasoning ?? 
    undefined;
  
  // Check for reasoning array with summaries
  if (!thinking && Array.isArray(data?.reasoning)) {
    const summaries = data.reasoning
      .filter((r: { type?: string; summary?: string }) => r.type === "summary" && r.summary)
      .map((r: { summary: string }) => r.summary);
    if (summaries.length > 0) {
      thinking = summaries.join("\n\n");
    }
  }
  
  console.log("Parsed thinking:", thinking);

  const usage = data?.usage
    ? {
        inputTokens: data.usage.prompt_tokens,
        outputTokens: data.usage.completion_tokens,
        reasoningTokens: data.usage.completion_tokens_details?.reasoning_tokens,
        totalTokens: data.usage.total_tokens,
      }
    : undefined;

  return { text, thinking, usage };
}

async function callAnthropic(params: {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
}): Promise<ChatResponse> {
  type AnthropicResponse = {
    content?: Array<{ type?: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
    error?: { message?: string };
    message?: string;
  };

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
      max_tokens: params.maxTokens ?? 1024,
      system,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      temperature: params.temperature,
    }),
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const message =
      data?.error?.message ??
      data?.message ??
      (typeof data === "string" ? data : null) ??
      `Anthropic request failed (${res.status})`;
    throw new Error(message);
  }

  const payload = data as AnthropicResponse | null;
  const blocks = payload?.content ?? [];
  const text: string =
    blocks.find((c) => c?.type === "text")?.text ??
    blocks[0]?.text ??
    "";

  const usage = data?.usage
    ? {
        inputTokens: data.usage.input_tokens,
        outputTokens: data.usage.output_tokens,
      }
    : undefined;

  return { text, usage };
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
