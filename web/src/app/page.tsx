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
    .replace(/\[\s*([^[\]]*(?:\\(?:frac|sqrt|sum|int|lim|prod|cdot|times|div|pm|mp|leq|geq|neq|approx|equiv|propto|infty|partial|nabla|alpha|beta|gamma|delta|theta|pi|sigma|omega|phi|psi|lambda|mu|nu|rho|tau|epsilon|zeta|eta|kappa|xi|chi|text|mathrm|mathbf|mathit|left|right|big|Big|bigg|Bigg)[^[\]]*)+)\s*\]/g, (_, content) => `$$${content.trim()}$$`)
    // Fix common patterns where ** bold ** breaks in math context
    .replace(/\*\*([^*]+)\*\*/g, '**$1**');
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

const IconSettings = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"></circle>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
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

function generateId(): string {
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
  const [activeTab, setActiveTab] = useState<"chat" | "keys">("chat");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
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

  // Load messages for current session
  useEffect(() => {
    if (!accessToken || !currentSessionId) return;
    
    const loadMessages = async () => {
      try {
        const res = await fetch(`/api/sessions/${currentSessionId}`, {
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
        setSessions((prev) =>
          prev.map((s) => (s.id === currentSessionId ? { ...s, messages: msgs } : s))
        );
      } catch { /* ignore */ }
    };
    
    loadMessages();
  }, [accessToken, currentSessionId]);

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
        const firstUserMsg = messages.find((m) => m.role === "user");
        const title = firstUserMsg 
          ? firstUserMsg.content.slice(0, 30) + (firstUserMsg.content.length > 30 ? "…" : "")
          : "새 대화";
        return { ...s, messages, title, updatedAt: new Date() };
      })
    );
  }

  // Content based on login state
  if (!supabase) {
    return (
      <div className="flex h-screen items-center justify-center">
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
      <div className="flex h-screen items-center justify-center bg-[#0f0f10]">
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
    <div className="flex h-screen overflow-hidden bg-[var(--background)]">
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
        {activeTab === "chat" && sessions.length > 0 && (
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
            onMessagesChange={(messages) => {
              if (currentSessionId) {
                updateSessionMessages(currentSessionId, messages);
              }
            }}
            onCreateSession={createNewSession}
            onOpenSidebar={() => setSidebarOpen(true)}
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

function ChatView(props: {
  session: ChatSession | null;
  model: string;
  reasoningEffort: ReasoningEffort;
  verbosity: Verbosity;
  setModel: (m: string) => void;
  setReasoningEffort: (r: ReasoningEffort) => void;
  setVerbosity: (v: Verbosity) => void;
  authedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  onMessagesChange: (messages: Message[]) => void;
  onCreateSession: () => Promise<string | null>;
  onOpenSidebar: () => void;
}) {
  const [thinkingExpanded, setThinkingExpanded] = useState<Record<string, boolean>>({});
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [webSearchEnabled, setWebSearchEnabled] = useState(true);
  const [webSearchMaxResults, setWebSearchMaxResults] = useState(10);
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Persist web search settings
  useEffect(() => {
    try {
      const savedEnabled = localStorage.getItem("llmkv:webSearchEnabled");
      if (savedEnabled === "0") setWebSearchEnabled(false);
      if (savedEnabled === "1") setWebSearchEnabled(true);

      const savedMax = localStorage.getItem("llmkv:webSearchMaxResults");
      const n = savedMax ? Number(savedMax) : NaN;
      if ([5, 10, 15, 20].includes(n)) setWebSearchMaxResults(n);
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("llmkv:webSearchEnabled", webSearchEnabled ? "1" : "0");
    } catch {
      // ignore
    }
  }, [webSearchEnabled]);

  useEffect(() => {
    try {
      localStorage.setItem("llmkv:webSearchMaxResults", String(webSearchMaxResults));
    } catch {
      // ignore
    }
  }, [webSearchMaxResults]);

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

  const messages = props.session?.messages ?? [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + "px";
    }
  }, [input]);

  async function send() {
    if ((!input.trim() && pendingImages.length === 0) || loading) return;

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

    const userContent = input.trim();
    const userImages = [...pendingImages];
    setInput("");
    setPendingImages([]);
    setLoading(true);
    setError("");

    try {
      const userMsgRes = await props.authedFetch(`/api/sessions/${sessionId}/messages`, {
        method: "POST",
        body: JSON.stringify({ 
          role: "user", 
          content: userContent,
          images: userImages.length > 0 ? userImages : undefined,
        }),
      });
      const userMsgJson = await userMsgRes.json();
      
      const userMessage: Message = {
        id: userMsgJson.message?.id ?? generateId(),
        role: "user",
        content: userContent,
        images: userImages.length > 0 ? userImages : undefined,
        timestamp: new Date(),
      };

      const newMessages = [...messages, userMessage];
      props.onMessagesChange(newMessages);

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
      props.onMessagesChange([...newMessages, assistantMessage]);

      // Build messages for API - include images as content parts
      const apiMessages = newMessages.map((m) => {
        if (m.images && m.images.length > 0) {
          const contentParts: Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }> = [];
          if (m.content) {
            contentParts.push({ type: "text", text: m.content });
          }
          for (const img of m.images) {
            contentParts.push({ type: "image_url", image_url: { url: img } });
          }
          return { role: m.role, content: contentParts };
        }
        return { role: m.role, content: m.content };
      });

      const requestBody: Record<string, unknown> = {
        model: props.model,
        messages: apiMessages,
        reasoningEffort: props.reasoningEffort,
        verbosity: props.verbosity,
      };

      if (webSearchEnabled) {
        requestBody.webSearch = { enabled: true, maxResults: webSearchMaxResults };
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
              props.onMessagesChange([
                ...newMessages,
                { ...assistantMessage, content: assistantContent, thinking: assistantThinking || undefined, sources: assistantSources },
              ]);
            } else if (event.type === "thinking") {
              assistantThinking += event.delta;
              props.onMessagesChange([
                ...newMessages,
                { ...assistantMessage, content: assistantContent, thinking: assistantThinking, sources: assistantSources },
              ]);
            } else if (event.type === "sources") {
              assistantSources = normalizeSources(event.sources);
              props.onMessagesChange([
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
      
      // Save final assistant message to DB
      await props.authedFetch(`/api/sessions/${sessionId}/messages`, {
        method: "POST",
        body: JSON.stringify({
          role: "assistant",
          content: assistantContent,
          thinking: assistantThinking || undefined,
          sources: assistantSources,
          usage_input_tokens: assistantUsage?.inputTokens,
          usage_output_tokens: assistantUsage?.outputTokens,
          usage_reasoning_tokens: assistantUsage?.reasoningTokens,
        }),
      });

      // Final update with usage
      props.onMessagesChange([
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
          </div>

          {/* Web search toggle */}
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-2 text-xs text-[var(--muted)] transition hover:border-[var(--border-hover)] sm:px-3 sm:py-1.5">
              <input
                type="checkbox"
                checked={webSearchEnabled}
                onChange={(e) => setWebSearchEnabled(e.target.checked)}
                className="accent-[var(--accent)]"
              />
              웹검색
            </label>
            {webSearchEnabled && (
              <select
                value={webSearchMaxResults}
                onChange={(e) => setWebSearchMaxResults(Number(e.target.value))}
                className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-2 py-2 text-xs outline-none transition hover:border-[var(--border-hover)] sm:px-3 sm:py-1.5"
                title="검색 결과 개수"
              >
                {[5, 10, 15, 20].map((n) => (
                  <option key={n} value={n}>
                    {n}개
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
        <div className="hidden text-xs text-[var(--muted)] sm:block">
          Ctrl+V로 이미지 붙여넣기
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 sm:px-6 sm:py-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center animate-fade-in px-4">
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
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-3 sm:space-y-4">
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
                        remarkPlugins={[remarkGfm, remarkMath, remarkBreaks]}
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
                onClick={send}
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
  const [keyInfo, setKeyInfo] = useState<KeyItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [keyInput, setKeyInput] = useState("");

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const res = await props.authedFetch("/api/keys", { method: "GET" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed to load keys");
      const openaiKey = (json.items ?? []).find((x: { provider: string }) => x.provider === "openai");
      setKeyInfo(openaiKey ? { key_hint: openaiKey.key_hint, updated_at: openaiKey.updated_at } : null);
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

  async function save() {
    setLoading(true);
    setError("");
    try {
      const apiKey = keyInput.trim();
      const res = await props.authedFetch("/api/keys", {
        method: "POST",
        body: JSON.stringify({ provider: "openai", apiKey }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed to save key");
      setKeyInput("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function del() {
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
            <h1 className="text-xl font-semibold">OpenAI API Key</h1>
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
                  {keyInfo?.key_hint ? `저장됨 (${keyInfo.key_hint})` : "미설정"}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={del}
                  className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm transition hover:border-red-500/50 hover:text-red-400 disabled:opacity-50"
                  disabled={loading}
                >
                  삭제
                </button>
                <button
                  onClick={save}
                  className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white transition hover:bg-[var(--accent-hover)] disabled:opacity-50"
                  disabled={loading || keyInput.trim().length < 10}
                >
                  저장
                </button>
              </div>
            </div>
            <input
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="sk-... 형태의 API Key 입력"
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
