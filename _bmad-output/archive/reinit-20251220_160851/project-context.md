---
project_name: "251220_bmad"
user_name: "Mingyu"
date: "2025-12-20"
sections_completed:
  - technology_stack
  - language_rules
  - framework_rules
  - testing_rules
  - quality_rules
  - workflow_rules
  - anti_patterns
status: "complete"
optimized_for_llm: true
---

# Project Context for AI Agents

_This file contains critical rules and patterns that AI agents must follow when implementing code in this project._

---

## Technology Stack & Versions

- Next.js 16.1.0 (App Router, Route Handlers)
- React 19.2.3
- TypeScript ^5 (strict)
- pnpm 9.15.0
- Supabase JS ^2.89.0 (Auth + Postgres)
- zod ^4.2.1 (API boundary validation)
- Tailwind CSS ^4, ESLint ^9 (`eslint-config-next` 16.1.0)
- Markdown UI: `react-markdown` ^10.1.0 + KaTeX + highlight.js

### Environment Variables

- Public (browser): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Server-only: `SUPABASE_SERVICE_ROLE_KEY`, `LLMKV_ENCRYPTION_KEY`
- Optional server-only: `TAVILY_API_KEY` (fallback web search injection for non-OpenAI providers)

## Critical Implementation Rules

### Language-Specific Rules (TypeScript)

- Keep `strict: true`. At API boundaries, validate inputs with Zod; treat unknown data as `unknown` until parsed.
- Prefer the `@/*` import alias (maps to `web/src/*`).
- In route handlers, use Web `Request`/`Response` and `Response.json(...)` (no Express).

### Framework-Specific Rules (Next.js App Router)

- API routes live in `web/src/app/api/**/route.ts`.
- If using Node-only APIs (e.g. `crypto`, service-role Supabase), set `export const runtime = "nodejs";`.
- Dynamic route handlers follow this repo pattern:
  - `type RouteContext = { params: Promise<{ id: string }> }`
  - `const { id } = await context.params`
- Browser Supabase client is created via `createSupabaseBrowserClient()`; it returns `null` if `NEXT_PUBLIC_SUPABASE_*` envs are missing (UI should render a setup hint, not crash).

### Auth & Supabase Access Pattern

- Client gets session via Supabase and sends API calls with `Authorization: Bearer <access_token>`.
- Server authenticates via `requireUser()` which calls `supabaseAdmin.auth.getUser(token)`.
- Server DB access uses `getSupabaseAdmin()` (service role). Even though service role bypasses RLS, **always** filter by `user.id` / verify ownership in queries.

### Secrets / Encryption (MUST)

- Never log API keys or Authorization headers. Redact secrets in errors/logs.
- `LLMKV_ENCRYPTION_KEY` must be **base64 of 32 random bytes** (AES-256-GCM key).
- Encrypted key envelope format is **stable**: `v1:<iv_b64>:<tag_b64>:<ciphertext_b64>` (see `web/src/lib/crypto.ts`).
- `SUPABASE_SERVICE_ROLE_KEY` is server-only (never expose to client; never prefix with `NEXT_PUBLIC_`).

### Database Schema Expectations (Supabase)

- Tables: `public.api_keys`, `public.chat_sessions`, `public.chat_messages`.
- `chat_messages.sources` is `jsonb` and expected to be an array of `{ title, url }` objects.

### Streaming/SSE Contract

- `/api/chat` returns SSE (`text/event-stream`) with `data: <json>\n\n` lines; UI expects event types: `text`, `thinking`, `sources`, `usage`, `error`, and end marker `data: [DONE]`.
- Keep heartbeat comments (e.g. `: keep-alive`) and `X-Accel-Buffering: no` header to avoid proxy buffering.

### Development Workflow

- Use pnpm in `web/`: `pnpm dev`, `pnpm build`, `pnpm lint`.
- Keep `eslint-config-next` defaults unless there is a clear reason.

## Usage Guidelines

- Read this file before implementing changes.
- If you introduce a new pattern (API shape, DB schema, env var, streaming contract), update this file.


