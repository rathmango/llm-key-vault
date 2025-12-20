-- Chat sessions and messages tables

create table if not exists public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default '새 대화',
  provider text not null,
  model text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists chat_sessions_user_id_idx on public.chat_sessions (user_id);
create index if not exists chat_sessions_updated_at_idx on public.chat_sessions (updated_at desc);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.chat_sessions(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  thinking text,
  usage_input_tokens integer,
  usage_output_tokens integer,
  usage_reasoning_tokens integer,
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_session_id_idx on public.chat_messages (session_id);
create index if not exists chat_messages_created_at_idx on public.chat_messages (created_at);

-- Triggers for updated_at
drop trigger if exists set_updated_at on public.chat_sessions;
create trigger set_updated_at
before update on public.chat_sessions
for each row
execute function public.set_updated_at();

-- RLS policies for chat_sessions
alter table public.chat_sessions enable row level security;

create policy "chat_sessions_select_own"
on public.chat_sessions
for select
using (auth.uid() = user_id);

create policy "chat_sessions_insert_own"
on public.chat_sessions
for insert
with check (auth.uid() = user_id);

create policy "chat_sessions_update_own"
on public.chat_sessions
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "chat_sessions_delete_own"
on public.chat_sessions
for delete
using (auth.uid() = user_id);

-- RLS policies for chat_messages (through session ownership)
alter table public.chat_messages enable row level security;

create policy "chat_messages_select_own"
on public.chat_messages
for select
using (
  exists (
    select 1 from public.chat_sessions s
    where s.id = chat_messages.session_id
    and s.user_id = auth.uid()
  )
);

create policy "chat_messages_insert_own"
on public.chat_messages
for insert
with check (
  exists (
    select 1 from public.chat_sessions s
    where s.id = chat_messages.session_id
    and s.user_id = auth.uid()
  )
);

create policy "chat_messages_delete_own"
on public.chat_messages
for delete
using (
  exists (
    select 1 from public.chat_sessions s
    where s.id = chat_messages.session_id
    and s.user_id = auth.uid()
  )
);
