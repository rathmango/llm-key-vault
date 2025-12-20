import { z } from "zod";

import { requireUser } from "@/lib/api/auth";
import { sendChat } from "@/lib/llm";

export const runtime = "nodejs";

const ProviderSchema = z.enum(["openai", "anthropic"]);

const TargetSchema = z.object({
  provider: ProviderSchema,
  model: z.string().min(1),
});

const BodySchema = z.object({
  prompt: z.string().min(1),
  targets: z.array(TargetSchema).min(1).max(6),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).max(8192).optional(),
});

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const body = BodySchema.parse(await request.json());

    const jobs = body.targets.map(async (t) => {
      try {
        const resp = await sendChat({
          provider: t.provider,
          model: t.model,
          messages: [{ role: "user", content: body.prompt }],
          temperature: body.temperature,
          maxTokens: body.maxTokens,
          userId: user.id,
        });

        return { provider: t.provider, model: t.model, ok: true as const, result: resp };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        return { provider: t.provider, model: t.model, ok: false as const, error: message };
      }
    });

    const results = await Promise.all(jobs);

    return Response.json({ results });
  } catch (e) {
    if (e instanceof Response) return e;

    if (e instanceof z.ZodError) {
      return Response.json({ error: e.message }, { status: 400 });
    }

    const message = e instanceof Error ? e.message : "Unexpected error";
    return Response.json({ error: message }, { status: 500 });
  }
}
