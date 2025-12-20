// Minimal Supabase DB types for this project.
// You can replace this with generated types from Supabase later.

export type Database = {
  public: {
    Tables: {
      api_keys: {
        Row: {
          id: string;
          user_id: string;
          provider: string;
          encrypted_key: string;
          key_hint: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          provider: string;
          encrypted_key: string;
          key_hint?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          provider?: string;
          encrypted_key?: string;
          key_hint?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
