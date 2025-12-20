import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // NOTE: During `next build`, env may not be present in this workspace.
  // Return null so the UI can show a setup hint instead of crashing prerender.
  if (!url || !anonKey) return null;

  return createClient<Database>(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}
