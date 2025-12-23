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
      chat_sessions: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          provider: string;
          model: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title?: string;
          provider: string;
          model: string;
        };
        Update: {
          title?: string;
          provider?: string;
          model?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      chat_messages: {
        Row: {
          id: string;
          session_id: string;
          role: string;
          content: string;
          images: string[] | null;
          thinking: string | null;
          sources: unknown | null;
          usage_input_tokens: number | null;
          usage_output_tokens: number | null;
          usage_reasoning_tokens: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          role: string;
          content: string;
          images?: string[] | null;
          thinking?: string | null;
          sources?: unknown | null;
          usage_input_tokens?: number | null;
          usage_output_tokens?: number | null;
          usage_reasoning_tokens?: number | null;
        };
        Update: {
          content?: string;
          images?: string[] | null;
          thinking?: string | null;
          sources?: unknown | null;
        };
        Relationships: [];
      };

      video_contexts: {
        Row: {
          id: string;
          user_id: string;
          session_id: string;
          provider: string;
          video_id: string;
          url: string;
          title: string | null;
          channel_title: string | null;
          description: string | null;
          transcript_language: string | null;
          transcript_source: string | null;
          transcript_text: string | null;
          summary_md: string | null;
          outline_md: string | null;
          questions_md: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          session_id: string;
          provider?: string;
          video_id: string;
          url: string;
          title?: string | null;
          channel_title?: string | null;
          description?: string | null;
          transcript_language?: string | null;
          transcript_source?: string | null;
          transcript_text?: string | null;
          summary_md?: string | null;
          outline_md?: string | null;
          questions_md?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          provider?: string;
          title?: string | null;
          channel_title?: string | null;
          description?: string | null;
          transcript_language?: string | null;
          transcript_source?: string | null;
          transcript_text?: string | null;
          summary_md?: string | null;
          outline_md?: string | null;
          questions_md?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };

      video_answer_jobs: {
        Row: {
          id: string;
          user_id: string;
          session_id: string;
          video_id: string;
          user_message_id: string | null;
          assistant_message_id: string;
          question_text: string;
          status: string;
          error: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          session_id: string;
          video_id: string;
          user_message_id?: string | null;
          assistant_message_id: string;
          question_text: string;
          status?: string;
          error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_message_id?: string | null;
          assistant_message_id?: string;
          question_text?: string;
          status?: string;
          error?: string | null;
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

