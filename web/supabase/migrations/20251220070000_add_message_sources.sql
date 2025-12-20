-- Add web search sources to chat_messages

alter table if exists public.chat_messages
add column if not exists sources jsonb;


