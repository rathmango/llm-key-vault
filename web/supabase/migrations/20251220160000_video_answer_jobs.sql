-- Queue user questions about a video while transcript is still being prepared.
-- Once transcript is ready, the server fills the assistant message with a data-based answer.

create table if not exists public.video_answer_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null references public.chat_sessions(id) on delete cascade,
  video_id text not null,

  user_message_id uuid,
  assistant_message_id uuid not null,
  question_text text not null,

  status text not null default 'pending' check (status in ('pending', 'completed', 'failed', 'cancelled')),
  error text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists video_answer_jobs_user_id_idx on public.video_answer_jobs (user_id);
create index if not exists video_answer_jobs_session_id_idx on public.video_answer_jobs (session_id);
create index if not exists video_answer_jobs_video_id_idx on public.video_answer_jobs (video_id);
create index if not exists video_answer_jobs_status_idx on public.video_answer_jobs (status);

create unique index if not exists video_answer_jobs_assistant_message_unique
  on public.video_answer_jobs (assistant_message_id);

drop trigger if exists set_updated_at on public.video_answer_jobs;
create trigger set_updated_at
before update on public.video_answer_jobs
for each row
execute function public.set_updated_at();

alter table public.video_answer_jobs enable row level security;

create policy "video_answer_jobs_select_own"
on public.video_answer_jobs
for select
using (auth.uid() = user_id);

create policy "video_answer_jobs_insert_own"
on public.video_answer_jobs
for insert
with check (auth.uid() = user_id);

create policy "video_answer_jobs_update_own"
on public.video_answer_jobs
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "video_answer_jobs_delete_own"
on public.video_answer_jobs
for delete
using (auth.uid() = user_id);


