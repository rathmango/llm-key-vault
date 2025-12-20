import { z } from "zod";

import { requireUser } from "@/lib/api/auth";
import { sendChat } from "@/lib/llm";

export const runtime = "nodejs";

const ProviderSchema = z.enum(["openai", "anthropic"]);

const MessageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string().min(1),
});

const BodySchema = z.object({
  provider: ProviderSchema,
  model: z.string().min(1),
  messages: z.array(MessageSchema).min(1),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).max(8192).optional(),
});

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const body = BodySchema.parse(await request.json());

    const result = await sendChat({
      provider: body.provider,
      model: body.model,
      messages: body.messages,
      temperature: body.temperature,
      maxTokens: body.maxTokens,
      userId: user.id,
    });

    return Response.json({ result });
  } catch (e) {
    if (e instanceof Response) return e;

    if (e instanceof z.ZodError) {
      return Response.json({ error: e.message }, { status: 400 });
    }

    const message = e instanceof Error ? e.message : "Unexpected error";
    return Response.json({ error: message }, { status: 500 });
  }
}
