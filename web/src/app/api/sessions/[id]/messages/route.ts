import { z } from "zod";
import { requireUser } from "@/lib/api/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function extractYouTubeId(input: string): string | null {
  const text = input.trim();
  // watch?v=
  const m1 = text.match(/(?:youtube\.com\/watch\?[^#\s]*\bv=)([a-zA-Z0-9_-]{6,})/i);
  if (m1?.[1]) return m1[1];
  // youtu.be/
  const m2 = text.match(/youtu\.be\/([a-zA-Z0-9_-]{6,})/i);
  if (m2?.[1]) return m2[1];
  // shorts/
  const m3 = text.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{6,})/i);
  if (m3?.[1]) return m3[1];
  return null;
}

const AddMessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
  images: z.array(z.string()).optional(), // Base64 data URLs
  thinking: z.string().optional(),
  usage_input_tokens: z.number().optional(),
  usage_output_tokens: z.number().optional(),
  usage_reasoning_tokens: z.number().optional(),
  sources: z
    .array(
      z.object({
        title: z.string(),
        url: z.string(),
      })
    )
    .optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

// POST: Add message to session
export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireUser(request);
    const { id: sessionId } = await context.params;
    const body = AddMessageSchema.parse(await request.json());
    const supabase = getSupabaseAdmin();

    // Verify session ownership
    const { data: session } = await supabase
      .from("chat_sessions")
      .select("id")
      .eq("id", sessionId)
      .eq("user_id", user.id)
      .single();

    if (!session) {
      return Response.json({ error: "Session not found" }, { status: 404 });
    }

    // Add message
    const { data: message, error } = await supabase
      .from("chat_messages")
      .insert({
        session_id: sessionId,
        role: body.role,
        content: body.content,
        images: body.images,
        thinking: body.thinking,
        usage_input_tokens: body.usage_input_tokens,
        usage_output_tokens: body.usage_output_tokens,
        usage_reasoning_tokens: body.usage_reasoning_tokens,
        sources: body.sources,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);

    // Update session title if it's the first user message
    if (body.role === "user") {
      const { count } = await supabase
        .from("chat_messages")
        .select("*", { count: "exact", head: true })
        .eq("session_id", sessionId)
        .eq("role", "user");

      if (count === 1) {
        const yt = extractYouTubeId(body.content);
        const title = yt
          ? `📺 YouTube · ${yt}`
          : body.content.slice(0, 50) + (body.content.length > 50 ? "…" : "");
        await supabase
          .from("chat_sessions")
          .update({ title })
          .eq("id", sessionId);
      }
    }

    // Touch session updated_at
    await supabase
      .from("chat_sessions")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", sessionId);

    return Response.json({ message });
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) {
      return Response.json({ error: e.message }, { status: 400 });
    }
    const message = e instanceof Error ? e.message : "Unexpected error";
    return Response.json({ error: message }, { status: 500 });
  }
}

