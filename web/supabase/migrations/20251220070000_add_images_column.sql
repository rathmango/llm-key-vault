-- Add images column to chat_messages for storing Base64 encoded images
ALTER TABLE public.chat_messages 
ADD COLUMN IF NOT EXISTS images text[];

-- Add sources column for web search results
ALTER TABLE public.chat_messages 
ADD COLUMN IF NOT EXISTS sources jsonb;

COMMENT ON COLUMN public.chat_messages.images IS 'Array of Base64 encoded images (optimized, max 1024px)';
COMMENT ON COLUMN public.chat_messages.sources IS 'Web search sources [{title, url}]';

