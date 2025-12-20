-- Video contexts: store YouTube transcripts/metadata per chat session

create table if not exists public.video_contexts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references public.chat_sessions(id) on delete cascade,

  provider text not null default 'gemini', -- transcript/analysis provider

  video_id text not null,
  url text not null,
  title text,
  channel_title text,
  description text,

  transcript_language text,
  transcript_source text, -- gemini / timedtext / none
  transcript_text text,

  summary_md text,
  outline_md text,
  questions_md text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists video_contexts_user_id_idx on public.video_contexts (user_id);
create index if not exists video_contexts_session_id_idx on public.video_contexts (session_id);
create index if not exists video_contexts_video_id_idx on public.video_contexts (video_id);

create unique index if not exists video_contexts_session_video_unique
  on public.video_contexts (session_id, video_id);

drop trigger if exists set_updated_at on public.video_contexts;
create trigger set_updated_at
before update on public.video_contexts
for each row
execute function public.set_updated_at();

alter table public.video_contexts enable row level security;

create policy "video_contexts_select_own"
on public.video_contexts
for select
using (auth.uid() = user_id);

create policy "video_contexts_insert_own"
on public.video_contexts
for insert
with check (auth.uid() = user_id);

create policy "video_contexts_update_own"
on public.video_contexts
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "video_contexts_delete_own"
on public.video_contexts
for delete
using (auth.uid() = user_id);


