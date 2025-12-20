import { z } from "zod";
import { requireUser } from "@/lib/api/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const CreateSessionSchema = z.object({
  title: z.string().optional(),
  model: z.string().min(1),
});

// GET: List all sessions for user
export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("chat_sessions")
      .select("*")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });

    if (error) throw new Error(error.message);

    return Response.json({ sessions: data ?? [] });
  } catch (e) {
    if (e instanceof Response) return e;
    const message = e instanceof Error ? e.message : "Unexpected error";
    return Response.json({ error: message }, { status: 500 });
  }
}

// POST: Create new session
export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const body = CreateSessionSchema.parse(await request.json());
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("chat_sessions")
      .insert({
        user_id: user.id,
        title: body.title ?? "새 대화",
        provider: "openai",
        model: body.model,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);

    return Response.json({ session: data });
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) {
      return Response.json({ error: e.message }, { status: 400 });
    }
    const message = e instanceof Error ? e.message : "Unexpected error";
    return Response.json({ error: message }, { status: 500 });
  }
}

