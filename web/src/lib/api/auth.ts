import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type AuthedUser = {
  id: string;
  email?: string;
};

export async function requireUser(request: Request): Promise<AuthedUser> {
  const auth = request.headers.get("authorization") || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    throw new Response("Missing Authorization header", { status: 401 });
  }

  const token = match[1];
  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) {
    throw new Response("Invalid session", { status: 401 });
  }

  return { id: data.user.id, email: data.user.email ?? undefined };
}
