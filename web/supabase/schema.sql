-- Supabase schema for LLM Key Vault (web)
-- Run this in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  encrypted_key text not null,
  key_hint text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists api_keys_user_provider_unique
  on public.api_keys (user_id, provider);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_updated_at on public.api_keys;
create trigger set_updated_at
before update on public.api_keys
for each row
execute function public.set_updated_at();

alter table public.api_keys enable row level security;

-- Users can manage only their rows.
create policy "api_keys_select_own"
on public.api_keys
for select
using (auth.uid() = user_id);

create policy "api_keys_insert_own"
on public.api_keys
for insert
with check (auth.uid() = user_id);

create policy "api_keys_update_own"
on public.api_keys
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "api_keys_delete_own"
on public.api_keys
for delete
using (auth.uid() = user_id);
