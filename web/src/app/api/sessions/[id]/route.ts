import { z } from "zod";
import { requireUser } from "@/lib/api/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const UpdateSessionSchema = z.object({
  title: z.string().optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

// GET: Get session with messages
export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await requireUser(request);
    const { id } = await context.params;
    const supabase = getSupabaseAdmin();

    // Get session
    const { data: session, error: sessionError } = await supabase
      .from("chat_sessions")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (sessionError || !session) {
      return Response.json({ error: "Session not found" }, { status: 404 });
    }

    // Get messages
    const { data: messages, error: messagesError } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("session_id", id)
      .order("created_at", { ascending: true });

    if (messagesError) throw new Error(messagesError.message);

    return Response.json({ session, messages: messages ?? [] });
  } catch (e) {
    if (e instanceof Response) return e;
    const message = e instanceof Error ? e.message : "Unexpected error";
    return Response.json({ error: message }, { status: 500 });
  }
}

// PATCH: Update session (title)
export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireUser(request);
    const { id } = await context.params;
    const body = UpdateSessionSchema.parse(await request.json());
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("chat_sessions")
      .update({ title: body.title })
      .eq("id", id)
      .eq("user_id", user.id)
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

// DELETE: Delete session
export async function DELETE(request: Request, context: RouteContext) {
  try {
    const user = await requireUser(request);
    const { id } = await context.params;
    const supabase = getSupabaseAdmin();

    const { error } = await supabase
      .from("chat_sessions")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) throw new Error(error.message);

    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) return e;
    const message = e instanceof Error ? e.message : "Unexpected error";
    return Response.json({ error: message }, { status: 500 });
  }
}
