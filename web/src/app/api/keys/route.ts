import { z } from "zod";

import { encryptSecret } from "@/lib/crypto";
import { requireUser } from "@/lib/api/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const ProviderSchema = z.enum(["openai", "anthropic", "gemini", "openrouter", "ollama"]);

type Provider = z.infer<typeof ProviderSchema>;

const UpsertBodySchema = z.object({
  provider: ProviderSchema,
  apiKey: z.string().min(10),
});

function keyHint(apiKey: string) {
  const trimmed = apiKey.trim();
  if (trimmed.length <= 4) return "****";
  return `****${trimmed.slice(-4)}`;
}

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("api_keys")
      .select("provider,key_hint,updated_at")
      .eq("user_id", user.id)
      .order("provider", { ascending: true });

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ items: data ?? [] });
  } catch (e) {
    if (e instanceof Response) return e;
    return Response.json({ error: "Unexpected error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);

    const body = UpsertBodySchema.parse(await request.json());
    const provider: Provider = body.provider;
    const apiKey = body.apiKey.trim();

    const supabase = getSupabaseAdmin();

    const encrypted = encryptSecret(apiKey);
    const hint = keyHint(apiKey);

    const { data, error } = await supabase
      .from("api_keys")
      .upsert(
        {
          user_id: user.id,
          provider,
          encrypted_key: encrypted,
          key_hint: hint,
        },
        { onConflict: "user_id,provider" }
      )
      .select("provider,key_hint,updated_at")
      .single();

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ item: data });
  } catch (e) {
    if (e instanceof Response) return e;

    if (e instanceof z.ZodError) {
      return Response.json({ error: e.message }, { status: 400 });
    }

    return Response.json({ error: "Unexpected error" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireUser(request);
    const url = new URL(request.url);

    const provider = ProviderSchema.parse(url.searchParams.get("provider"));

    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from("api_keys")
      .delete()
      .eq("user_id", user.id)
      .eq("provider", provider);

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;

    if (e instanceof z.ZodError) {
      return Response.json({ error: e.message }, { status: 400 });
    }

    return Response.json({ error: "Unexpected error" }, { status: 500 });
  }
}
