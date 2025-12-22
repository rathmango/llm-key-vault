"use client";

import { useEffect, useMemo, useState, useRef, useCallback, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkBreaks from "remark-breaks";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import "katex/dist/katex.min.css";
import "highlight.js/styles/github-dark.css";

type ReasoningEffort = "none" | "low" | "medium" | "high" | "xhigh";
type Verbosity = "low" | "medium" | "high";

const DEFAULT_MODEL = "gpt-5.2-2025-12-11";

type Draft = {
  text: string;
  autoSend?: boolean;
  forceNewSession?: boolean;
};

const REASONING_EFFORTS: Array<{ value: ReasoningEffort; label: string }> = [
  { value: "none", label: "None" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "xhigh", label: "Extra High" },
];

const VERBOSITIES: Array<{ value: Verbosity; label: string }> = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

// Convert various LaTeX delimiters to standard $...$ and $$...$$ format
function normalizeLatex(text: string): string {
  return text
    // Block math: \[...\] or [ ... ] (with math content) → $$...$$
    .replace(/\\\[([\s\S]*?)\\\]/g, (_, content) => `$$${content.trim()}$$`)
    // Inline math: \(...\) → $...$
    .replace(/\\\(([\s\S]*?)\\\)/g, (_, content) => `$${content.trim()}$`)
    // Handle [ ... ] with common LaTeX commands (heuristic)
    .replace(/\[\s*([^[\]]*(?:\\(?:frac|sqrt|sum|int|lim|prod|cdot|times|div|pm|mp|leq|geq|neq|approx|equiv|propto|infty|partial|nabla|alpha|beta|gamma|delta|theta|pi|sigma|omega|phi|psi|lambda|mu|nu|rho|tau|epsilon|zeta|eta|kappa|xi|chi|text|mathrm|mathbf|mathit|left|right|big|Big|bigg|Bigg)[^[\]]*)+)\s*\]/g, (_, content) => `$$${content.trim()}$$`);
}

type Source = {
  title: string;
  url: string;
};

function normalizeSources(value: unknown): Source[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: Source[] = [];
  for (const item of value) {
    const title = (item as { title?: unknown })?.title;
    const url = (item as { url?: unknown })?.url;
    if (typeof title === "string" && typeof url === "string") {
      out.push({ title, url });
    }
  }
  return out.length ? out : undefined;
}

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  images?: string[]; // Base64 data URLs
  thinking?: string;
  sources?: Source[];
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    reasoningTokens?: number;
  };
  timestamp: Date;
};

type ChatSession = {
  id: string;
  title: string;
  messages: Message[];
  model: string;
  reasoningEffort?: ReasoningEffort;
  verbosity?: Verbosity;
  createdAt: Date;
  updatedAt: Date;
  // Pagination
  hasMore?: boolean;
  oldestId?: string | null;
  isLoadingMore?: boolean;
};

type KeyItem = {
  key_hint: string | null;
  updated_at: string | null;
};

// Icons
const IconPlus = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19"></line>
    <line x1="5" y1="12" x2="19" y2="12"></line>
  </svg>
);

const IconChat = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
  </svg>
);

const IconHome = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9.5 12 3l9 6.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1V9.5z"></path>
  </svg>
);

const IconKey = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m21 2-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4"></path>
  </svg>
);

const IconImage = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
    <circle cx="8.5" cy="8.5" r="1.5"></circle>
    <polyline points="21 15 16 10 5 21"></polyline>
  </svg>
);

const IconSend = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13"></line>
    <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
  </svg>
);

const IconTrash = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"></polyline>
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
  </svg>
);

const IconLogout = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
    <polyline points="16 17 21 12 16 7"></polyline>
    <line x1="21" y1="12" x2="9" y2="12"></line>
  </svg>
);

const IconMenu = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="3" y1="12" x2="21" y2="12"></line>
    <line x1="3" y1="6" x2="21" y2="6"></line>
    <line x1="3" y1="18" x2="21" y2="18"></line>
  </svg>
);

const IconClose = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"></line>
    <line x1="6" y1="6" x2="18" y2="18"></line>
  </svg>
);

function extractYouTubeUrls(text: string): string[] {
  if (!text) return [];
  const out: string[] = [];
  // Basic patterns: youtube.com/watch?v=, youtu.be/, youtube.com/shorts/
  const patterns = [
    /\bhttps?:\/\/(?:www\.)?youtube\.com\/watch\?[^ \n\r\t]*\bv=[a-zA-Z0-9_-]{6,}\b[^ \n\r\t]*/g,
    /\bhttps?:\/\/(?:www\.)?youtu\.be\/[a-zA-Z0-9_-]{6,}\b[^ \n\r\t]*/g,
    /\bhttps?:\/\/(?:www\.)?youtube\.com\/shorts\/[a-zA-Z0-9_-]{6,}\b[^ \n\r\t]*/g,
  ];
  for (const re of patterns) {
    const matches = text.match(re) ?? [];
    for (const m of matches) out.push(m);
  }
  // De-dupe while preserving order
  return Array.from(new Set(out));
}

type YouTubeContext = {
  video?: {
    videoId: string;
    url: string;
    title: string | null;
    channelTitle: string | null;
    description: string | null;
    publishedAt: string | null;
    thumbnail: string | null;
    viewCount: number | null;
    duration: string | null;
  };
  transcript?: {
    language: string;
    isAutoGenerated: boolean;
    isTruncated: boolean;
    segmentsCount: number;
    textWithTimestamps: string;
  } | null;
};

function buildYouTubeAnalyzePrompt(url: string, userText: string, ctx?: YouTubeContext): string {
  const original = userText.trim();
  const isOnlyUrl = original === url;

  const title = ctx?.video?.title;
  const channel = ctx?.video?.channelTitle;
  const publishedAt = ctx?.video?.publishedAt;
  const duration = ctx?.video?.duration;
  const viewCount = ctx?.video?.viewCount;
  const description = ctx?.video?.description;
  const transcript = ctx?.transcript;

  const metaLines: string[] = [];
  if (title) metaLines.push(`- Title: ${title}`);
  if (channel) metaLines.push(`- Channel: ${channel}`);
  if (publishedAt) metaLines.push(`- PublishedAt: ${publishedAt}`);
  if (duration) metaLines.push(`- Duration(ISO8601): ${duration}`);
  if (typeof viewCount === "number") metaLines.push(`- Views: ${viewCount.toLocaleString()}`);

  const descPreview =
    typeof description === "string" && description.trim()
      ? description.trim().slice(0, 1200) + (description.trim().length > 1200 ? "\n…(truncated)" : "")
      : "";

  const transcriptBlock =
    transcript?.textWithTimestamps?.trim()
      ? [
          "Transcript (timestamped):",
          transcript.isAutoGenerated ? "(auto-generated captions)" : "(captions)",
          transcript.isTruncated ? "(transcript truncated)" : "",
          "",
          transcript.textWithTimestamps,
        ]
          .filter(Boolean)
          .join("\n")
      : "Transcript: (not available via timedtext endpoint)";

  return [
    "You are a helpful assistant.",
    "",
    "We are discussing a YouTube video.",
    "Prefer the provided metadata/transcript. Do NOT rely on third-party summary sites.",
    "",
    `YouTube URL: ${url}`,
    metaLines.length ? "" : "",
    metaLines.length ? "Video metadata:" : "",
    metaLines.length ? metaLines.join("\n") : "",
    descPreview ? "" : "",
    descPreview ? "Description (preview):" : "",
    descPreview ? descPreview : "",
    "",
    transcriptBlock,
    "",
    "Deliverables:",
    "1) Identify the video's title and channel (if available).",
    "2) Summarize the video in 8–12 bullet points (Korean).",
    "3) Create a timestamped outline (MM:SS) of key moments. Use transcript timestamps when present.",
    "4) Suggest 5 follow-up questions the user might ask (Korean).",
    "",
    "Do NOT print the full transcript. The full transcript is stored separately and will be used as hidden context for follow-up Q&A.",
    "",
    isOnlyUrl
      ? "After that, ask: '어떤 관점(요약/비판/투자/실생활)에 집중할까요?'"
      : `User request/context (Korean):\n${original}\n\nFinish by asking a single clarifying question about what to focus on.`,
  ].join("\n");
}

function generateId(): string {
  // Prefer UUID so IDs can safely be used as DB primary keys when needed.
  try {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    // ignore
  }
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "방금";
  if (minutes < 60) return `${minutes}분 전`;
  if (hours < 24) return `${hours}시간 전`;
  if (days < 7) return `${days}일 전`;
  return date.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

export default function Home() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [activeTab, setActiveTab] = useState<"home" | "chat" | "keys">("chat");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  
  // Chat state
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [model, setModel] = useState<string>(DEFAULT_MODEL);
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>("xhigh");
  const [verbosity, setVerbosity] = useState<Verbosity>("medium");

  useEffect(() => {
    if (!supabase) return;
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setSession(data.session);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, [supabase]);

  const user = session?.user ?? null;
  const accessToken = session?.access_token ?? null;

  // Load sessions from DB (only metadata, not messages - for memory optimization)
  useEffect(() => {
    if (!accessToken) return;
    
    const loadSessions = async () => {
      try {
        const res = await fetch("/api/sessions", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) {
          console.error("Failed to load sessions:", res.status);
          return;
        }
        const json = await res.json();
        const dbSessions = (json.sessions ?? []).map((s: { id: string; title: string; model: string; created_at: string; updated_at: string }) => ({
          id: s.id,
          title: s.title,
          messages: [] as Message[], // Empty - loaded on demand
          model: s.model,
          createdAt: new Date(s.created_at),
          updatedAt: new Date(s.updated_at),
        }));
        setSessions(dbSessions);
        if (dbSessions.length > 0) {
          setCurrentSessionId((prev) => prev ?? dbSessions[0].id);
          setModel(dbSessions[0].model);
        }
      } catch (e) {
        console.error("Error loading sessions:", e);
      }
    };
    
    loadSessions();
  }, [accessToken]);

  // Load messages for current session (paginated - most recent first)
  useEffect(() => {
    if (!accessToken || !currentSessionId) return;
    
    const loadMessages = async () => {
      try {
        const res = await fetch(`/api/sessions/${currentSessionId}?limit=10`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) return;
        const json = await res.json();
        const msgs = (json.messages ?? []).map((m: { id: string; role: string; content: string; images?: string[]; thinking?: string; sources?: unknown; usage_input_tokens?: number; usage_output_tokens?: number; usage_reasoning_tokens?: number; created_at: string }) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          content: m.content,
          images: m.images,
          thinking: m.thinking,
          sources: normalizeSources(m.sources),
          usage: m.usage_input_tokens ? {
            inputTokens: m.usage_input_tokens,
            outputTokens: m.usage_output_tokens,
            reasoningTokens: m.usage_reasoning_tokens,
          } : undefined,
          timestamp: new Date(m.created_at),
        }));
        const pagination = json.pagination ?? {};
        setSessions((prev) =>
          prev.map((s) => (s.id === currentSessionId ? { 
            ...s, 
            messages: msgs,
            hasMore: pagination.hasMore ?? false,
            oldestId: pagination.oldestId ?? null,
          } : s))
        );
      } catch { /* ignore */ }
    };
    
    loadMessages();
  }, [accessToken, currentSessionId]);

  // Load more messages (older) for current session
  const loadMoreMessages = useCallback(async () => {
    if (!accessToken || !currentSessionId) return;
    
    const session = sessions.find(s => s.id === currentSessionId);
    if (!session?.hasMore || !session?.oldestId || session?.isLoadingMore) return;
    
    setSessions((prev) =>
      prev.map((s) => (s.id === currentSessionId ? { ...s, isLoadingMore: true } : s))
    );
    
    try {
      const res = await fetch(`/api/sessions/${currentSessionId}?limit=10&before=${session.oldestId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) return;
      const json = await res.json();
      const olderMsgs = (json.messages ?? []).map((m: { id: string; role: string; content: string; images?: string[]; thinking?: string; sources?: unknown; usage_input_tokens?: number; usage_output_tokens?: number; usage_reasoning_tokens?: number; created_at: string }) => ({
        id: m.id,
        role: m.role as "user" | "assistant",
        content: m.content,
        images: m.images,
        thinking: m.thinking,
        sources: normalizeSources(m.sources),
        usage: m.usage_input_tokens ? {
          inputTokens: m.usage_input_tokens,
          outputTokens: m.usage_output_tokens,
          reasoningTokens: m.usage_reasoning_tokens,
        } : undefined,
        timestamp: new Date(m.created_at),
      }));
      const pagination = json.pagination ?? {};
      setSessions((prev) =>
        prev.map((s) => (s.id === currentSessionId ? { 
          ...s, 
          messages: [...olderMsgs, ...s.messages], // Prepend older messages
          hasMore: pagination.hasMore ?? false,
          oldestId: pagination.oldestId ?? null,
          isLoadingMore: false,
        } : s))
      );
    } catch {
      setSessions((prev) =>
        prev.map((s) => (s.id === currentSessionId ? { ...s, isLoadingMore: false } : s))
      );
    }
  }, [accessToken, currentSessionId, sessions]);

  async function signInWithGoogle() {
    if (!supabase) return;
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
  }

  const authedFetch = useCallback(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!accessToken) throw new Error("Not authenticated");

    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${accessToken}`);
    if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");

    return fetch(input, { ...init, headers });
  }, [accessToken]);

  const currentSession = sessions.find((s) => s.id === currentSessionId) ?? null;

  async function createNewSession(): Promise<string | null> {
    if (!accessToken) return null;
    
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model }),
      });
      if (!res.ok) return null;
      const json = await res.json();
      const newSession: ChatSession = {
        id: json.session.id,
        title: json.session.title,
        messages: [],
        model: json.session.model,
        createdAt: new Date(json.session.created_at),
        updatedAt: new Date(json.session.updated_at),
      };
      setSessions((prev) => [newSession, ...prev]);
      setCurrentSessionId(newSession.id);
      return newSession.id;
    } catch {
      return null;
    }
  }

  async function deleteSession(id: string) {
    if (!accessToken) return;
    
    try {
      await fetch(`/api/sessions/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    } catch { /* ignore */ }
    
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (currentSessionId === id) {
      const remaining = sessions.filter((s) => s.id !== id);
      setCurrentSessionId(remaining.length > 0 ? remaining[0].id : null);
    }
  }

  function updateSessionMessages(sessionId: string, messages: Message[]) {
    setSessions((prev) =>
      prev.map((s) => {
        if (s.id !== sessionId) return s;

        // Merge by id so background updates (e.g. YouTube ingest progress) don't overwrite
        // messages appended after this call started.
        const map = new Map<string, Message>();
        for (const m of s.messages ?? []) map.set(m.id, m);
        for (const m of messages) map.set(m.id, m);
        const merged = Array.from(map.values()).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

        const firstUserMsg = merged.find((m) => m.role === "user");
        const title = firstUserMsg
          ? firstUserMsg.content.slice(0, 30) + (firstUserMsg.content.length > 30 ? "…" : "")
          : "새 대화";

        return { ...s, messages: merged, title, updatedAt: new Date() };
      })
    );
  }

  // Content based on login state
  if (!supabase) {
    return (
      <div className="flex h-[100dvh] items-center justify-center">
        <div className="max-w-md rounded-2xl border border-[var(--border)] bg-[var(--card)] p-8 text-center">
          <h1 className="text-xl font-semibold">환경변수 설정 필요</h1>
          <p className="mt-3 text-sm text-[var(--muted)]">
            <code className="rounded bg-black/30 px-1.5 py-0.5">NEXT_PUBLIC_SUPABASE_URL</code> 과{" "}
            <code className="rounded bg-black/30 px-1.5 py-0.5">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>를 설정한 뒤 다시 실행해주세요.
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-[#0f0f10]">
        <div className="max-w-sm rounded-2xl border border-[#27272a] bg-[#18181b] p-8 text-center animate-fade-in">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#7c3aed]/20">
            <IconKey />
          </div>
          <h1 className="text-xl font-semibold text-[#e4e4e7]">LLM Key Vault</h1>
          <p className="mt-2 text-sm text-[#71717a]">
            내 API Key로 여러 LLM을 한 곳에서 관리하고 채팅하세요
          </p>
          <button
            onClick={signInWithGoogle}
            className="mt-6 w-full rounded-xl bg-white px-4 py-3 text-sm font-medium text-black transition hover:bg-zinc-100"
          >
            Google로 시작하기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] overflow-hidden bg-[var(--background)]">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-[var(--border)] bg-[var(--sidebar)]
        transform transition-transform duration-300 ease-in-out
        lg:relative lg:translate-x-0 lg:w-64
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {/* Mobile close button */}
        <div className="flex items-center justify-between p-3 lg:hidden">
          <span className="text-sm font-medium">메뉴</span>
          <button
            onClick={() => setSidebarOpen(false)}
            className="rounded-lg p-2 hover:bg-[var(--sidebar-hover)]"
          >
            <IconClose />
          </button>
        </div>

        {/* New Chat Button */}
        <div className="p-3">
          <button
            onClick={() => {
              createNewSession();
              setSidebarOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-3 text-sm font-medium transition hover:border-[var(--border-hover)] hover:bg-[var(--card-hover)] active:scale-[0.98]"
          >
            <IconPlus />
            새 대화
          </button>
        </div>

        {/* Navigation */}
        <nav className="px-3">
          <NavButton 
            active={activeTab === "home"} 
            onClick={() => {
              setActiveTab("home");
              setSidebarOpen(false);
            }}
            icon={<IconHome />}
          >
            Home
          </NavButton>
          <NavButton 
            active={activeTab === "chat"} 
            onClick={() => {
              setActiveTab("chat");
              setSidebarOpen(false);
            }}
            icon={<IconChat />}
          >
            Chat
          </NavButton>
          <NavButton 
            active={activeTab === "keys"} 
            onClick={() => {
              setActiveTab("keys");
              setSidebarOpen(false);
            }}
            icon={<IconKey />}
          >
            API Key
          </NavButton>
        </nav>

        {/* Chat History */}
        {activeTab !== "keys" && sessions.length > 0 && (
          <div className="mt-4 flex-1 overflow-y-auto px-3">
            <div className="mb-2 px-2 text-xs font-medium text-[var(--muted)]">
              최근 대화
            </div>
            <div className="space-y-1">
              {sessions.map((s, i) => (
                <div
                  key={s.id}
                  className={`group relative animate-slide-in`}
                  style={{ animationDelay: `${i * 30}ms` }}
                >
                  <button
                    onClick={() => {
                      // Clear previous session messages from memory (optimization)
                      if (currentSessionId && currentSessionId !== s.id) {
                        setSessions((prev) =>
                          prev.map((sess) =>
                            sess.id === currentSessionId ? { ...sess, messages: [] } : sess
                          )
                        );
                      }
                      setCurrentSessionId(s.id);
                      setModel(s.model);
                      setActiveTab("chat");
                      setSidebarOpen(false);
                    }}
                    className={`w-full rounded-lg px-3 py-3 text-left text-sm transition active:scale-[0.98] ${
                      currentSessionId === s.id
                        ? "bg-[var(--accent)]/20 text-[var(--accent-hover)]"
                        : "hover:bg-[var(--sidebar-hover)]"
                    }`}
                  >
                    <div className="truncate font-medium">{s.title}</div>
                    <div className="mt-0.5 text-xs text-[var(--muted)]">
                      {formatRelativeTime(s.updatedAt)}
                    </div>
                  </button>
                  <button
                    onClick={() => deleteSession(s.id)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-2 opacity-0 transition hover:bg-red-500/20 hover:text-red-400 group-hover:opacity-100"
                  >
                    <IconTrash />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* User info */}
        <div className="mt-auto border-t border-[var(--border)] p-3">
          <div className="flex items-center justify-between rounded-lg px-2 py-2">
            <div className="truncate text-sm text-[var(--muted)]">
              {user.email?.split("@")[0]}
            </div>
            <button
              onClick={signOut}
              className="rounded p-2 text-[var(--muted)] transition hover:bg-[var(--sidebar-hover)] hover:text-white"
              title="로그아웃"
            >
              <IconLogout />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex flex-1 flex-col overflow-hidden">
        {activeTab === "home" && (
          <HomeView
            authedFetch={authedFetch}
            onOpenSidebar={() => setSidebarOpen(true)}
            onStartDraft={(d) => {
              if (d.forceNewSession) {
                setCurrentSessionId(null);
              }
              setDraft(d);
              setActiveTab("chat");
              setSidebarOpen(false);
            }}
          />
        )}
        {activeTab === "chat" && (
          <ChatView
            session={currentSession}
            model={model}
            reasoningEffort={reasoningEffort}
            verbosity={verbosity}
            setModel={setModel}
            setReasoningEffort={setReasoningEffort}
            setVerbosity={setVerbosity}
            authedFetch={authedFetch}
            draft={draft}
            onDraftConsumed={() => setDraft(null)}
            onMessagesChange={(sessionId, messages) => {
              updateSessionMessages(sessionId, messages);
            }}
            onCreateSession={createNewSession}
            onOpenSidebar={() => setSidebarOpen(true)}
            onLoadMore={loadMoreMessages}
          />
        )}
        {activeTab === "keys" && <KeysPanel authedFetch={authedFetch} onOpenSidebar={() => setSidebarOpen(true)} />}
      </main>
    </div>
  );
}

function NavButton(props: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <button
      onClick={props.onClick}
      className={`mb-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
        props.active
          ? "bg-[var(--accent)]/20 text-[var(--accent-hover)]"
          : "text-[var(--muted)] hover:bg-[var(--sidebar-hover)] hover:text-white"
      }`}
    >
      {props.icon}
      {props.children}
    </button>
  );
}

// Image optimization utility
async function optimizeImage(file: File): Promise<string> {
  const maxSize = 1024;
  const quality = 0.8;
  
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxSize || height > maxSize) {
        const ratio = Math.min(maxSize / width, maxSize / height);
        width *= ratio;
        height *= ratio;
      }
      
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      const base64 = canvas.toDataURL('image/jpeg', quality);
      URL.revokeObjectURL(img.src);
      resolve(base64);
    };
    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      reject(new Error('Failed to load image'));
    };
    img.src = URL.createObjectURL(file);
  });
}

function HomeView(props: {
  authedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  onOpenSidebar: () => void;
  onStartDraft: (draft: Draft) => void;
}) {
  type Category = "finance" | "parenting" | "creator" | "it";

  const CATEGORIES: Array<{ id: Category; label: string }> = [
    { id: "finance", label: "경제/투자" },
    { id: "parenting", label: "출산/육아" },
    { id: "creator", label: "크리에이터" },
    { id: "it", label: "IT/개발" },
  ];

  const STARTERS: Record<Category, Array<{ label: string; prompt: string }>> = {
    finance: [
      { label: "금리/환율 브리핑", prompt: "오늘 한국 기준으로 금리/환율/부동산 흐름을 빠르게 브리핑해줘. 핵심만 10줄 이내로." },
      { label: "뉴스 읽는 법", prompt: "경제 뉴스를 볼 때 체크해야 할 관점(금리, 인플레, 실적, 정책)을 프레임워크로 만들어줘." },
      { label: "영상 보고 질문 만들기", prompt: "내가 경제 유튜브를 볼 때 바로 써먹을 질문 템플릿 10개를 만들어줘." },
    ],
    parenting: [
      { label: "D-14 준비 체크", prompt: "2주 뒤에 출산 예정이야. 출산 준비 체크리스트를 '오늘/이번 주/출산 직전'으로 나눠서 만들어줘." },
      { label: "산모 컨디션 Q&A", prompt: "산모의 컨디션을 매일 점검할 수 있는 질문 리스트(간단 체크)와 위험 신호 기준을 정리해줘." },
      { label: "신생아 2주 로드맵", prompt: "신생아 첫 2주를 버티기 위한 로드맵을 하루 단위로 제안해줘. (수면/수유/회복 중심)" },
    ],
    creator: [
      { label: "릴스 아이디어 10개", prompt: "예비 부모/일상 주제로 인스타 릴스 아이디어 10개를 제안해줘. (훅/구성/촬영 컷/자막 톤)" },
      { label: "릴스 스크립트", prompt: "릴스 30초짜리 스크립트를 3개 만들어줘. (감성/유머/정보형)" },
      { label: "편집 가이드", prompt: "릴스 편집을 처음 하는 사람 기준으로, 컷 편집/자막/음악 선택의 규칙을 체크리스트로 알려줘." },
    ],
    it: [
      { label: "이 앱 개선 아이디어", prompt: "이 채팅 앱을 더 쓰기 좋게 만들 UX 개선 아이디어 10개를 제안해줘. (모바일 중심)" },
      { label: "성능 점검", prompt: "Next.js + Supabase 앱에서 모바일 성능을 떨어뜨리는 원인 Top 10과 점검 순서를 알려줘." },
      { label: "보안 점검", prompt: "사용자 API 키를 저장하는 앱의 보안 체크리스트를 만들어줘. (클라이언트/서버/DB/RLS)" },
    ],
  };

  const [topic, setTopic] = useState("");
  const [category, setCategory] = useState<Category>("finance");

  type YouTubeRecItem = {
    videoId: string;
    url: string;
    title: string;
    channelTitle: string;
    publishedAt: string | null;
    thumbnail: string | null;
    viewCount: number | null;
    duration: string | null;
  };

  const [ytItems, setYtItems] = useState<YouTubeRecItem[]>([]);
  const [ytLoading, setYtLoading] = useState(false);
  const [ytError, setYtError] = useState<string>("");
  const [ytReloadNonce, setYtReloadNonce] = useState(0);

  const reloadYouTube = () => setYtReloadNonce((n) => n + 1);
  const { authedFetch } = props;

  const starters = STARTERS[category] ?? STARTERS.finance;

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setYtLoading(true);
      setYtError("");
      try {
        const refresh = ytReloadNonce > 0 ? `&refresh=${encodeURIComponent(String(ytReloadNonce))}` : "";
        const res = await authedFetch(
          `/api/youtube/recommendations?category=${encodeURIComponent(category)}&maxResults=12${refresh}`,
          { method: "GET" }
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error ?? "Failed to load YouTube recommendations");
        const items = Array.isArray(json?.items) ? (json.items as YouTubeRecItem[]) : [];
        if (!cancelled) setYtItems(items);
      } catch (e) {
        const message = e instanceof Error ? e.message : "Unexpected error";
        if (!cancelled) setYtError(message);
      } finally {
        if (!cancelled) setYtLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [category, ytReloadNonce, authedFetch]);

  const startTopicOrUrl = () => {
    const q = topic.trim();
    if (!q) return;
    const urls = extractYouTubeUrls(q);
    const first = urls[0] ?? null;
    if (first && q === first) {
      props.onStartDraft({ text: first, autoSend: true, forceNewSession: true });
      setTopic("");
      return;
    }
    const prompt = `다음 주제로 대화를 시작하고 싶어: "${q}"\n\n1) 먼저 내가 고르기 쉬운 질문 5개를 제안해줘.\n2) 내가 선택하면 그 질문부터 대화를 시작해줘.`;
    props.onStartDraft({ text: prompt, autoSend: true, forceNewSession: true });
    setTopic("");
  };

  const topicTrimmed = topic.trim();
  const topicFirstUrl = extractYouTubeUrls(topicTrimmed)[0] ?? null;
  const isUrlOnly = Boolean(topicFirstUrl) && topicTrimmed === topicFirstUrl;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Mobile header */}
      <header className="flex items-center gap-3 border-b border-[var(--border)] px-3 py-2 sm:px-6 sm:py-3 lg:hidden">
        <button
          onClick={props.onOpenSidebar}
          className="rounded-lg p-2 hover:bg-[var(--card)]"
          aria-label="메뉴 열기"
        >
          <IconMenu />
        </button>
        <h1 className="text-lg font-semibold">Home</h1>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-3xl">
          <div className="text-center">
            <h1 className="text-2xl font-semibold sm:text-3xl">Understand vast knowledge like a genius</h1>
            <p className="mt-2 text-sm text-[var(--muted)]">
              주제 입력 또는 <span className="font-medium">YouTube 링크</span>로 바로 시작할 수 있어요.
            </p>
          </div>

          {/* Categories + YouTube */}
          <div className="mt-6">
            <div className="flex flex-wrap justify-center gap-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setCategory(c.id);
                    setYtReloadNonce(0);
                  }}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    category === c.id
                      ? "border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--foreground)]"
                      : "border-[var(--border)] bg-[var(--card)] text-[var(--muted)] hover:text-[var(--foreground)]"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>

            {/* YouTube recommendations */}
            <div className="mt-6">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">YouTube 추천</div>
                  <div className="mt-1 text-xs text-[var(--muted)]">한국 인기 영상 기반 · 카테고리 필터</div>
                </div>
                <button
                  onClick={reloadYouTube}
                  disabled={ytLoading}
                  className="rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] transition hover:border-[var(--border-hover)] hover:text-[var(--foreground)] disabled:opacity-50"
                >
                  새로고침
                </button>
              </div>

              {ytError && (
                <div className="mt-3 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-300">
                  {ytError}
                  <div className="mt-1 text-[11px] text-red-300/80">
                    (서버에 <code className="rounded bg-black/30 px-1 py-0.5">YOUTUBE_DATA_API_KEY</code> 설정이 필요할 수 있어요)
                  </div>
                </div>
              )}

              {!ytError && ytLoading && ytItems.length === 0 && (
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div
                      key={i}
                      className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 animate-pulse"
                    >
                      <div className="flex gap-3">
                        <div className="h-20 w-36 flex-none rounded-xl bg-[var(--border)]/40" />
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="h-4 w-5/6 rounded bg-[var(--border)]/40" />
                          <div className="h-3 w-2/5 rounded bg-[var(--border)]/40" />
                          <div className="h-3 w-1/3 rounded bg-[var(--border)]/40" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {!ytError && ytItems.length > 0 && (
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {ytItems.map((v) => (
                    <button
                      key={v.videoId}
                      onClick={() => props.onStartDraft({ text: v.url, autoSend: true, forceNewSession: true })}
                      className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 text-left transition hover:border-[var(--border-hover)] hover:bg-[var(--card-hover)]"
                    >
                      <div className="flex gap-3">
                        <div className="relative h-20 w-36 flex-none overflow-hidden rounded-xl bg-black/20">
                          {v.thumbnail ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={v.thumbnail} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <div className="h-full w-full bg-black/20" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="line-clamp-2 text-sm font-medium">{v.title}</div>
                          <div className="mt-1 line-clamp-1 text-xs text-[var(--muted)]">{v.channelTitle}</div>
                          {v.publishedAt && (
                            <div className="mt-1 text-xs text-[var(--muted)]">
                              {formatRelativeTime(new Date(v.publishedAt))}
                            </div>
                          )}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {!ytError && !ytLoading && ytItems.length === 0 && (
                <div className="mt-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-xs text-[var(--muted)]">
                  추천 영상을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.
                </div>
              )}
            </div>
          </div>

          {/* Unified input + starters (moved under input) */}
          <div className="mt-8">
            <div className="relative">
              <input
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    startTopicOrUrl();
                  }
                }}
                placeholder="주제 입력 또는 YouTube URL 붙여넣기…"
                className="w-full rounded-full border border-[var(--border)] bg-[var(--card)] px-5 py-3 text-sm outline-none transition focus:border-[var(--accent)]"
              />
              <button
                onClick={startTopicOrUrl}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-medium text-white transition hover:bg-[var(--accent-hover)] disabled:opacity-40"
                disabled={!topicTrimmed}
              >
                {isUrlOnly ? "분석" : "시작"}
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {starters.map((s) => (
                <button
                  key={s.label}
                  onClick={() => props.onStartDraft({ text: s.prompt, autoSend: true, forceNewSession: true })}
                  className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 text-left transition hover:border-[var(--border-hover)] hover:bg-[var(--card-hover)]"
                >
                  <div className="text-sm font-medium">{s.label}</div>
                  <div className="mt-1 line-clamp-2 text-xs text-[var(--muted)]">{s.prompt}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChatView(props: {
  session: ChatSession | null;
  model: string;
  reasoningEffort: ReasoningEffort;
  verbosity: Verbosity;
  setModel: (m: string) => void;
  setReasoningEffort: (r: ReasoningEffort) => void;
  setVerbosity: (v: Verbosity) => void;
  authedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  draft?: Draft | null;
  onDraftConsumed?: () => void;
  onMessagesChange: (sessionId: string, messages: Message[]) => void;
  onCreateSession: () => Promise<string | null>;
  onOpenSidebar: () => void;
  onLoadMore: () => void;
}) {
  const [thinkingExpanded, setThinkingExpanded] = useState<Record<string, boolean>>({});
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [mobileSettingsOpen, setMobileSettingsOpen] = useState(false);
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const [collapsedMessages, setCollapsedMessages] = useState(true); // Collapse old messages by default
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const WEB_SEARCH_MAX_RESULTS = 10;
  
  // Scroll handler for loading more messages
  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    
    // Load more when scrolled near top (within 100px)
    if (container.scrollTop < 100 && props.session?.hasMore && !props.session?.isLoadingMore) {
      const prevScrollHeight = container.scrollHeight;
      props.onLoadMore();
      // Restore scroll position after loading (prevents jump)
      requestAnimationFrame(() => {
        const newScrollHeight = container.scrollHeight;
        container.scrollTop = newScrollHeight - prevScrollHeight;
      });
    }
  }, [props]);

  // Handle image paste
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) {
            try {
              const optimized = await optimizeImage(file);
              setPendingImages((prev) => [...prev, optimized]);
            } catch {
              setError('이미지 처리 실패');
            }
          }
          break;
        }
      }
    };
    
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, []);

  // Handle file input
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    
    for (const file of files) {
      if (file.type.startsWith('image/')) {
        try {
          const optimized = await optimizeImage(file);
          setPendingImages((prev) => [...prev, optimized]);
        } catch {
          setError('이미지 처리 실패');
        }
      }
    }
    e.target.value = '';
  };

  const removeImage = (index: number) => {
    setPendingImages((prev) => prev.filter((_, i) => i !== index));
  };

  const allMessages = props.session?.messages ?? [];
  const VISIBLE_COUNT = 4; // Show last 4 messages initially
  const hasCollapsedMessages = collapsedMessages && allMessages.length > VISIBLE_COUNT;
  const collapsedCount = hasCollapsedMessages ? allMessages.length - VISIBLE_COUNT : 0;
  const messages = hasCollapsedMessages ? allMessages.slice(-VISIBLE_COUNT) : allMessages;

  // Reset collapsed state when switching sessions
  useEffect(() => {
    setCollapsedMessages(true);
  }, [props.session?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [allMessages.length]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + "px";
    }
  }, [input]);

  async function send(override?: { content?: string; images?: string[] }) {
    const userContentOriginal = (override?.content ?? input).trim();
    const userImages = override?.images ?? [...pendingImages];
    if ((!userContentOriginal && userImages.length === 0) || loading) return;

    let sessionId: string | null = props.session?.id ?? null;
    
    // Create session if none exists
    if (!sessionId) {
      sessionId = await props.onCreateSession();
      if (!sessionId) {
        setError("Failed to create session");
        return;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    const sessionIdFinal = sessionId as string;
    setInput("");
    setPendingImages([]);
    setError("");

    try {
      const userMsgRes = await props.authedFetch(`/api/sessions/${sessionId}/messages`, {
        method: "POST",
        body: JSON.stringify({ 
          role: "user", 
          content: userContentOriginal,
          images: userImages.length > 0 ? userImages : undefined,
        }),
      });
      const userMsgJson = await userMsgRes.json();
      
      const userMessage: Message = {
        id: userMsgJson.message?.id ?? generateId(),
        role: "user",
        content: userContentOriginal,
        images: userImages.length > 0 ? userImages : undefined,
        timestamp: new Date(),
      };

      // Use allMessages (not collapsed view) to preserve full history
      const newMessages = [...allMessages, userMessage];
      props.onMessagesChange(sessionIdFinal, newMessages);

      // Build messages for API - include images as content parts
      const youtubeUrls = extractYouTubeUrls(userMessage.content);
      const youtubeUrl = youtubeUrls[0] ?? null;

      if (youtubeUrl) {
        // UX-first: show a quick metadata-based prompt immediately, while running deep analysis in the background.
        const metaId = generateId();
        const analysisId = generateId();

        const metaMessage: Message = {
          id: metaId,
          role: "assistant",
          content: "🎬 영상 정보를 불러오는 중…",
          timestamp: new Date(),
        };

        const analysisMessage: Message = {
          id: analysisId,
          role: "assistant",
          content:
            "⏳ 영상 전문 분석을 백그라운드에서 준비 중이에요.\n\n준비되는 동안에도 궁금한 점을 물어보면, 가능한 범위(제목/설명 기준)로 먼저 답해드릴게요.",
          timestamp: new Date(),
        };

        props.onMessagesChange(sessionIdFinal, [...newMessages, metaMessage, analysisMessage]);

        // Fire-and-forget ingest stream (don't block input)
        void (async () => {
          let metaContent = metaMessage.content;
          let analysisContent = analysisMessage.content;
          let videoTitle = "";

          const applyUpdate = () => {
            props.onMessagesChange(sessionIdFinal, [
              ...newMessages,
              { ...metaMessage, content: metaContent },
              { ...analysisMessage, content: analysisContent },
            ]);
          };

          try {
            const ingestRes = await props.authedFetch("/api/youtube/ingest", {
              method: "POST",
              body: JSON.stringify({ sessionId: sessionIdFinal, url: youtubeUrl, lang: "ko", assistantMessageId: analysisId }),
            });

            if (!ingestRes.ok) {
              const errJson = await ingestRes.json().catch(() => ({}));
              throw new Error(errJson?.error ?? "YouTube ingest failed");
            }

            const reader = ingestRes.body?.getReader();
            if (!reader) throw new Error("No response body");

            const decoder = new TextDecoder();
            let buffer = "";
            let finalMarkdown = "";

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split("\n");
              buffer = lines.pop() || "";

              for (const line of lines) {
                if (!line.startsWith("data: ")) continue;
                const data = line.slice(6).trim();
                if (!data || data === "[DONE]") continue;

                try {
                  const event = JSON.parse(data);

                  if (event.type === "metadata" && event.video) {
                    videoTitle = event.video?.title ?? "";
                    const title = event.video?.title ?? "YouTube 영상";
                    const channel = event.video?.channelTitle ?? "";
                    const descRaw = (event.video?.description ?? "").replace(/\s+/g, " ").trim();
                    const desc = descRaw.length > 260 ? `${descRaw.slice(0, 260)}…` : descRaw;
                    const hint = desc
                      ? `> ${desc}`
                      : "> (설명이 길지 않아서 제목/채널 기준으로만 안내할게요.)";

                    metaContent = [
                      `## 📺 ${title}`,
                      channel ? `- 채널: **${channel}**` : null,
                      `- 링크: ${event.video?.url ?? youtubeUrl}`,
                      "",
                      "이 영상에 대해 대화하고 싶으신가요?",
                      "지금은 메타데이터(제목/설명) 기준으로 먼저 안내하고, **뒤에서 전문 분석을 계속 준비**하고 있어요.",
                      "",
                      "이 영상은(제목/설명 기준) 대략 이런 내용을 담고 있어요:",
                      hint,
                      "",
                      "어떤 게 궁금하신가요?",
                      "- 핵심 요약 / 결론",
                      "- 주장 근거/논리 점검",
                      "- 투자/실생활 관점 적용",
                      "- 내가 바로 던질 질문 5개",
                    ]
                      .filter(Boolean)
                      .join("\n");
                    applyUpdate();
                  } else if (event.type === "progress") {
                    const progressBar = "●".repeat(event.step) + "○".repeat(event.total - event.step);
                    analysisContent = videoTitle
                      ? `## ⏳ 분석 준비 중 · ${videoTitle}\n\n${progressBar} (${event.step}/${event.total})\n\n${event.message}`
                      : `${progressBar} (${event.step}/${event.total})\n\n${event.message}`;
                    applyUpdate();
                  } else if (event.type === "complete") {
                    finalMarkdown = event.analysis?.markdown ?? "YouTube 분석 완료";
                  } else if (event.type === "error") {
                    throw new Error(event.error ?? "YouTube ingest failed");
                  }
                } catch {
                  // ignore invalid JSON
                }
              }
            }

            if (finalMarkdown) {
              analysisContent = finalMarkdown;
              applyUpdate();
            }
          } catch (e) {
            const msg = e instanceof Error ? e.message : "Unknown error";
            analysisContent = `⚠️ 영상 분석 실패: ${msg}`;
            applyUpdate();
          }
        })();

        return;
      }

      // Non-YouTube: normal chat streaming
      setLoading(true);

      const assistantId = generateId();
      let assistantContent = "";
      let assistantThinking = "";
      let assistantUsage: Message["usage"] = undefined;
      let assistantSources: Source[] | undefined = undefined;

      const assistantMessage: Message = {
        id: assistantId,
        role: "assistant",
        content: "",
        timestamp: new Date(),
      };
      props.onMessagesChange(sessionIdFinal, [...newMessages, assistantMessage]);

      const modelUserContent = userMessage.content;

      const apiMessages = newMessages.map((m) => {
        if (m.images && m.images.length > 0) {
          const contentParts: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> = [];
          const text = m.id === userMessage.id ? modelUserContent : m.content;
          if (text) {
            contentParts.push({ type: "text", text });
          }
          for (const img of m.images) {
            contentParts.push({ type: "image_url", image_url: { url: img } });
          }
          return { role: m.role, content: contentParts };
        }
        return { role: m.role, content: m.id === userMessage.id ? modelUserContent : m.content };
      });

      const requestBody: Record<string, unknown> = {
        model: props.model,
        messages: apiMessages,
        reasoningEffort: props.reasoningEffort,
        verbosity: props.verbosity,
        sessionId: sessionIdFinal,
        assistantMessageId: assistantId,
      };

      // Web search: auto-detect if query needs real-time info, or use manual toggle
      const needsWebSearch = (() => {
        if (youtubeUrl) return false; // YouTube has its own context pipeline
        
        // Auto-detect: keywords that typically need current/real-time info or explicit search requests
        const q = userContentOriginal.toLowerCase();
        const realtimeKeywords = [
          // 명시적 검색 요청
          "검색", "찾아", "서치", "search", "look up", "google",
          // 시간 관련
          "오늘", "현재", "지금", "최근", "최신", "요즘",
          // 뉴스
          "뉴스", "속보", "이슈",
          // 금융
          "주가", "환율", "금리", "시세", "코스피", "코스닥", "나스닥", "비트코인",
          // 기타 실시간
          "날씨", "기온",
          "경기", "스코어", "순위",
          // 영어
          "today", "current", "latest", "recent", "news",
          "stock", "price", "rate", "weather",
        ];
        return realtimeKeywords.some((kw) => q.includes(kw));
      })();
      
      if (needsWebSearch) {
        requestBody.webSearch = { enabled: true, maxResults: WEB_SEARCH_MAX_RESULTS };
      }
      
      const res = await props.authedFetch("/api/chat", {
        method: "POST",
        body: JSON.stringify(requestBody),
      });
      
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json?.error ?? "Chat failed");
      }

      // Read streaming response
      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") continue;

          try {
            const event = JSON.parse(data);
            
            if (event.type === "text") {
              assistantContent += event.delta;
              props.onMessagesChange(sessionIdFinal, [
                ...newMessages,
                { ...assistantMessage, content: assistantContent, thinking: assistantThinking || undefined, sources: assistantSources },
              ]);
            } else if (event.type === "thinking") {
              assistantThinking += event.delta;
              props.onMessagesChange(sessionIdFinal, [
                ...newMessages,
                { ...assistantMessage, content: assistantContent, thinking: assistantThinking, sources: assistantSources },
              ]);
            } else if (event.type === "sources") {
              assistantSources = normalizeSources(event.sources);
              props.onMessagesChange(sessionIdFinal, [
                ...newMessages,
                { ...assistantMessage, content: assistantContent, thinking: assistantThinking || undefined, sources: assistantSources },
              ]);
            } else if (event.type === "error") {
              try { await reader.cancel(); } catch { /* ignore */ }
              throw new Error(typeof event.error === "string" ? event.error : "Stream failed");
            } else if (event.type === "usage") {
              assistantUsage = event.usage;
            }
          } catch {
            // Skip invalid JSON
          }
        }
      }
      
      // Final update with usage
      props.onMessagesChange(sessionIdFinal, [
        ...newMessages,
        {
          ...assistantMessage,
          content: assistantContent,
          thinking: assistantThinking || undefined,
          sources: assistantSources,
          usage: assistantUsage,
        },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  // Draft injection from HomeView (topic/search/YouTube URL)
  useEffect(() => {
    const d = props.draft;
    if (!d) return;
    if (loading) return;
    const text = d.text?.trim?.() ? d.text : "";
    if (!text) {
      props.onDraftConsumed?.();
      return;
    }

    if (d.autoSend) {
      props.onDraftConsumed?.();
      void send({ content: text });
      return;
    }

    setInput(text);
    props.onDraftConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.draft, loading]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-2 sm:px-6 sm:py-3 sm:gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Mobile menu button */}
          <button
            onClick={props.onOpenSidebar}
            className="rounded-lg p-2 hover:bg-[var(--card)] lg:hidden"
          >
            <IconMenu />
          </button>
          <span className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--muted)]">
            GPT-5.2
          </span>

          {/* Mobile: show settings button */}
          <button
            onClick={() => setMobileSettingsOpen((v) => !v)}
            className="sm:hidden rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs font-medium text-[var(--muted)] transition hover:border-[var(--border-hover)]"
            aria-label="설정"
          >
            {mobileSettingsOpen ? "설정 닫기" : "설정"}
          </button>
          
          {/* Parameters - hide on mobile */}
          <div className="hidden sm:flex sm:items-center sm:gap-2">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-[var(--muted)]">추론:</span>
              <select
                value={props.reasoningEffort}
                onChange={(e) => props.setReasoningEffort(e.target.value as ReasoningEffort)}
                className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-xs outline-none transition hover:border-[var(--border-hover)]"
              >
                {REASONING_EFFORTS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-[var(--muted)]">상세:</span>
              <select
                value={props.verbosity}
                onChange={(e) => props.setVerbosity(e.target.value as Verbosity)}
                className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-1.5 text-xs outline-none transition hover:border-[var(--border-hover)]"
              >
                {VERBOSITIES.map((v) => (
                  <option key={v.value} value={v.value}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Mobile settings panel */}
          {mobileSettingsOpen && (
            <div className="w-full sm:hidden mt-2 grid grid-cols-1 gap-2">
              <div className="flex items-center gap-2">
                <span className="w-10 text-xs text-[var(--muted)]">추론</span>
                <select
                  value={props.reasoningEffort}
                  onChange={(e) => props.setReasoningEffort(e.target.value as ReasoningEffort)}
                  className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs outline-none transition hover:border-[var(--border-hover)]"
                >
                  {REASONING_EFFORTS.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-10 text-xs text-[var(--muted)]">상세</span>
                <select
                  value={props.verbosity}
                  onChange={(e) => props.setVerbosity(e.target.value as Verbosity)}
                  className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs outline-none transition hover:border-[var(--border-hover)]"
                >
                  {VERBOSITIES.map((v) => (
                    <option key={v.value} value={v.value}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="text-[11px] text-[var(--muted)]">
                웹검색은 질문 내용(예: 오늘/최근/검색해줘)에 따라 자동으로만 사용돼요.
              </div>
            </div>
          )}
        </div>
        <div className="hidden text-xs text-[var(--muted)] sm:block">
          Ctrl+V로 이미지 붙여넣기
        </div>
      </header>

      {/* Messages */}
      <div 
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-3 py-3 sm:px-6 sm:py-4"
      >
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-start text-center animate-fade-in px-4 pt-8 pb-6">
            <div className="mx-auto mb-4 flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-2xl bg-[var(--accent)]/20">
              <IconChat />
            </div>
            <h2 className="text-base sm:text-lg font-semibold">대화를 시작하세요</h2>
            <p className="mt-2 max-w-sm text-sm text-[var(--muted)]">
              {props.model} 모델로 대화합니다
            </p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              이미지를 붙여넣거나 첨부할 수 있어요
            </p>

            {/* Quick starters (for users who struggle to ask the first question) */}
            <div className="mt-5 flex w-full max-w-md gap-2 overflow-x-auto pb-1">
              {[
                { label: "주제 추천", prompt: "내가 대화 주제를 잘 못 정해. 오늘 이야기할 주제 5개만 추천해줘. (경제/출산/육아/릴스/일상 중에서)" },
                { label: "경제 브리핑", prompt: "오늘 한국 경제/정책에서 중요한 이슈 5개를 3줄 요약으로 알려주고, 각각 '왜 중요한지'도 1줄씩 설명해줘." },
                { label: "출산 준비", prompt: "2주 뒤에 출산 예정이야. 출산 준비 체크리스트를 '오늘/이번 주/출산 직전'으로 나눠서 만들어줘." },
                { label: "릴스 아이디어", prompt: "예비 부모/일상 주제로 인스타 릴스 아이디어 10개를 제안해줘. (훅/구성/촬영 컷/자막 톤)" },
              ].map((x) => (
                <button
                  key={x.label}
                  onClick={() => void send({ content: x.prompt })}
                  className="flex-none rounded-full border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-xs font-medium text-[var(--muted)] transition hover:border-[var(--border-hover)] hover:text-[var(--foreground)]"
                >
                  {x.label}
                </button>
              ))}
            </div>

            <div className="mt-3 text-xs text-[var(--muted)]">
              YouTube 링크는 <span className="font-medium">Home</span>에서 붙여넣거나, 여기서 바로 보내도 돼요.
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-3 sm:space-y-4">
            {/* Load more from DB indicator */}
            {props.session?.hasMore && !hasCollapsedMessages && (
              <div className="flex justify-center py-2">
                {props.session?.isLoadingMore ? (
                  <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
                    <div className="h-3 w-3 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent"></div>
                    이전 메시지 불러오는 중...
                  </div>
                ) : (
                  <button
                    onClick={props.onLoadMore}
                    className="text-xs text-[var(--muted)] hover:text-[var(--foreground)] transition"
                  >
                    ↑ 이전 메시지 더 보기
                  </button>
                )}
              </div>
            )}
            {/* Show collapsed messages button */}
            {hasCollapsedMessages && (
              <div className="flex justify-center py-2">
                <button
                  onClick={() => setCollapsedMessages(false)}
                  className="rounded-full bg-[var(--sidebar-hover)] px-4 py-1.5 text-xs text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-[var(--accent)]/20 transition"
                >
                  ↑ 접힌 메시지 {collapsedCount}개 펼치기
                </button>
              </div>
            )}
            {messages.map((msg, i) => (
              <div
                key={msg.id}
                className={`message-enter flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
                style={{ animationDelay: `${i * 50}ms` }}
              >
                {/* Thinking Section (for assistant messages) */}
                {msg.role === "assistant" && msg.thinking && (
                  <div className="mb-2 w-full max-w-[80%]">
                    <button
                      onClick={() => setThinkingExpanded((prev) => ({ ...prev, [msg.id]: !prev[msg.id] }))}
                      className="flex items-center gap-2 text-xs text-[var(--muted)] hover:text-[var(--foreground)] transition"
                    >
                      <svg 
                        xmlns="http://www.w3.org/2000/svg" 
                        width="14" 
                        height="14" 
                        viewBox="0 0 24 24" 
                        fill="none" 
                        stroke="currentColor" 
                        strokeWidth="2"
                        className={`transition-transform ${thinkingExpanded[msg.id] ? "rotate-90" : ""}`}
                      >
                        <polyline points="9 18 15 12 9 6"></polyline>
                      </svg>
                      <span className="font-medium">Thinking</span>
                      {msg.usage?.reasoningTokens && (
                        <span className="text-[10px] opacity-70">
                          ({msg.usage.reasoningTokens.toLocaleString()} tokens)
                        </span>
                      )}
                    </button>
                    {thinkingExpanded[msg.id] && (
                      <div className="mt-2 rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 text-xs text-[var(--muted)] whitespace-pre-wrap max-h-64 overflow-y-auto">
                        {msg.thinking}
                      </div>
                    )}
                  </div>
                )}

                {/* Message Content */}
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                    msg.role === "user"
                      ? "bg-[var(--accent)] text-white"
                      : "bg-[var(--ai-bubble)] text-[var(--foreground)]"
                  }`}
                >
                  {msg.role === "user" ? (
                    <div className="text-sm leading-relaxed">
                      {msg.images && msg.images.length > 0 && (
                        <div className="mb-2 flex flex-wrap gap-2">
                          {msg.images.map((img, idx) => (
                            <img
                              key={idx}
                              src={img}
                              alt={`첨부 이미지 ${idx + 1}`}
                              className="max-w-[200px] max-h-[200px] rounded-lg object-cover"
                            />
                          ))}
                        </div>
                      )}
                      <div className="whitespace-pre-wrap">{msg.content}</div>
                    </div>
                  ) : (
                    <div className="text-sm leading-relaxed prose prose-sm prose-invert max-w-none [&_pre]:bg-[#1e1e1e] [&_pre]:rounded-lg [&_pre]:p-4 [&_code]:text-[13px] [&_.katex]:text-[1em] [&_.katex-display]:my-4 [&_.katex-display]:overflow-x-auto [&_p]:my-2 [&_ul]:my-2 [&_ol]:my-2 [&_li]:my-0.5 [&_br]:block [&_p]:text-sm [&_li]:text-sm">
                      <ReactMarkdown 
                        remarkPlugins={[
                          [remarkGfm, { singleTilde: false }],
                          remarkMath,
                          remarkBreaks
                        ]}
                        rehypePlugins={[rehypeKatex, rehypeHighlight]}
                      >
                        {normalizeLatex(msg.content)}
                      </ReactMarkdown>
                    </div>
                  )}
                </div>

                {/* Usage Info (for assistant messages) */}
                {msg.role === "assistant" && msg.sources && msg.sources.length > 0 && (
                  <div className="mt-2 w-full max-w-[80%]">
                    <div className="text-xs font-medium text-[var(--muted)]">Sources</div>
                    <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-[var(--muted)]">
                      {msg.sources.map((s, idx) => (
                        <li key={`${msg.id}:src:${idx}`} className="truncate">
                          <a
                            href={s.url}
                            target="_blank"
                            rel="noreferrer"
                            className="underline underline-offset-2 hover:text-[var(--foreground)]"
                          >
                            {s.title || s.url}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {msg.role === "assistant" && msg.usage && (
                  <div className="mt-1 flex gap-3 text-[10px] text-[var(--muted)]">
                    {msg.usage.inputTokens !== undefined && (
                      <span>입력: {msg.usage.inputTokens.toLocaleString()}</span>
                    )}
                    {msg.usage.outputTokens !== undefined && (
                      <span>출력: {msg.usage.outputTokens.toLocaleString()}</span>
                    )}
                    {msg.usage.reasoningTokens !== undefined && (
                      <span>추론: {msg.usage.reasoningTokens.toLocaleString()}</span>
                    )}
                  </div>
                )}
              </div>
            ))}
            {loading && (
              <div className="flex justify-start message-enter">
                <div className="flex items-center gap-1.5 rounded-2xl bg-[var(--ai-bubble)] px-4 py-3">
                  <div className="typing-dot"></div>
                  <div className="typing-dot"></div>
                  <div className="typing-dot"></div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mx-6 mb-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400 animate-fade-in">
          {error}
        </div>
      )}

      {/* Input */}
      <div className="border-t border-[var(--border)] px-3 py-3 sm:px-6 sm:py-4">
        <div className="mx-auto max-w-3xl">
          {/* Pending images preview */}
          {pendingImages.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {pendingImages.map((img, idx) => (
                <div key={idx} className="relative group">
                  <img
                    src={img}
                    alt={`첨부 예정 ${idx + 1}`}
                    className="h-16 w-16 rounded-lg object-cover border border-[var(--border)]"
                  />
                  <button
                    onClick={() => removeImage(idx)}
                    className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          
          <div className="relative rounded-2xl border border-[var(--border)] bg-[var(--card)] transition focus-within:border-[var(--accent)]">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="메시지를 입력하세요..."
              rows={1}
              className="w-full resize-none bg-transparent px-4 py-3 pr-24 text-sm outline-none placeholder:text-[var(--muted)]"
              disabled={loading}
            />
            <div className="absolute bottom-2 right-2 flex items-center gap-1">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleFileSelect}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
                className="rounded-lg p-2 text-[var(--muted)] transition hover:bg-[var(--sidebar-hover)] hover:text-white disabled:opacity-40"
                title="이미지 첨부"
              >
                <IconImage />
              </button>
              <button
                onClick={() => void send()}
                disabled={loading || (!input.trim() && pendingImages.length === 0)}
                className="rounded-lg bg-[var(--accent)] p-2 text-white transition hover:bg-[var(--accent-hover)] disabled:opacity-40 disabled:hover:bg-[var(--accent)]"
              >
                <IconSend />
              </button>
            </div>
          </div>
          <div className="mt-2 text-center text-xs text-[var(--muted)]">
            OpenAI · {props.model}
          </div>
        </div>
      </div>
    </div>
  );
}

function KeysPanel(props: {
  authedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  onOpenSidebar: () => void;
}) {
  const [openaiInfo, setOpenaiInfo] = useState<KeyItem | null>(null);
  const [geminiInfo, setGeminiInfo] = useState<KeyItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [openaiInput, setOpenaiInput] = useState("");
  const [geminiInput, setGeminiInput] = useState("");

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const res = await props.authedFetch("/api/keys", { method: "GET" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed to load keys");
      const openaiKey = (json.items ?? []).find((x: { provider: string }) => x.provider === "openai");
      const geminiKey = (json.items ?? []).find((x: { provider: string }) => x.provider === "gemini");
      setOpenaiInfo(openaiKey ? { key_hint: openaiKey.key_hint, updated_at: openaiKey.updated_at } : null);
      setGeminiInfo(geminiKey ? { key_hint: geminiKey.key_hint, updated_at: geminiKey.updated_at } : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveOpenAI() {
    setLoading(true);
    setError("");
    try {
      const apiKey = openaiInput.trim();
      const res = await props.authedFetch("/api/keys", {
        method: "POST",
        body: JSON.stringify({ provider: "openai", apiKey }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed to save key");
      setOpenaiInput("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function deleteOpenAI() {
    setLoading(true);
    setError("");
    try {
      const res = await props.authedFetch(`/api/keys?provider=openai`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed to delete key");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function saveGemini() {
    setLoading(true);
    setError("");
    try {
      const apiKey = geminiInput.trim();
      const res = await props.authedFetch("/api/keys", {
        method: "POST",
        body: JSON.stringify({ provider: "gemini", apiKey }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed to save key");
      setGeminiInput("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function deleteGemini() {
    setLoading(true);
    setError("");
    try {
      const res = await props.authedFetch(`/api/keys?provider=gemini`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed to delete key");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Mobile header */}
      <header className="flex items-center gap-3 border-b border-[var(--border)] px-3 py-2 sm:px-6 sm:py-3 lg:hidden">
        <button
          onClick={props.onOpenSidebar}
          className="rounded-lg p-2 hover:bg-[var(--card)]"
        >
          <IconMenu />
        </button>
        <h1 className="text-lg font-semibold">API Key</h1>
      </header>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto max-w-2xl space-y-4">
          <div className="animate-fade-in hidden lg:block">
            <h1 className="text-xl font-semibold">API Keys</h1>
            <p className="mt-1 text-sm text-[var(--muted)]">
              키는 AES-GCM으로 암호화되어 저장됩니다
            </p>
          </div>
          <p className="text-sm text-[var(--muted)] lg:hidden">
            키는 AES-GCM으로 암호화되어 저장됩니다
          </p>

          <div className="animate-fade-in rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium">OpenAI</h3>
                <p className="text-xs text-[var(--muted)]">
                  {openaiInfo?.key_hint ? `저장됨 (${openaiInfo.key_hint})` : "미설정"}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={deleteOpenAI}
                  className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm transition hover:border-red-500/50 hover:text-red-400 disabled:opacity-50"
                  disabled={loading}
                >
                  삭제
                </button>
                <button
                  onClick={saveOpenAI}
                  className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white transition hover:bg-[var(--accent-hover)] disabled:opacity-50"
                  disabled={loading || openaiInput.trim().length < 10}
                >
                  저장
                </button>
              </div>
            </div>
            <input
              type="password"
              value={openaiInput}
              onChange={(e) => setOpenaiInput(e.target.value)}
              placeholder="sk-... 형태의 API Key 입력"
              className="mt-3 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none transition focus:border-[var(--accent)]"
            />
          </div>

          <div className="animate-fade-in rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium">Gemini</h3>
                <p className="text-xs text-[var(--muted)]">
                  {geminiInfo?.key_hint ? `저장됨 (${geminiInfo.key_hint})` : "미설정"}
                </p>
                <p className="mt-1 text-[11px] text-[var(--muted)]">
                  (자막 없는 YouTube 영상도 전문/타임스탬프 생성하기 위한 폴백 전사용)
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={deleteGemini}
                  className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm transition hover:border-red-500/50 hover:text-red-400 disabled:opacity-50"
                  disabled={loading}
                >
                  삭제
                </button>
                <button
                  onClick={saveGemini}
                  className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white transition hover:bg-[var(--accent-hover)] disabled:opacity-50"
                  disabled={loading || geminiInput.trim().length < 10}
                >
                  저장
                </button>
              </div>
            </div>
            <input
              type="password"
              value={geminiInput}
              onChange={(e) => setGeminiInput(e.target.value)}
              placeholder="Google AI Studio에서 발급한 API Key (예: AIza...)"
              className="mt-3 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none transition focus:border-[var(--accent)]"
            />
          </div>

          <button
            onClick={refresh}
            disabled={loading}
            className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm transition hover:border-[var(--border-hover)] disabled:opacity-50"
          >
            {loading ? "로딩 중…" : "새로고침"}
          </button>

          {error && (
            <div className="animate-fade-in rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
