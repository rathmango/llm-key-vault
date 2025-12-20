"use client";

import { useEffect, useMemo, useState, useRef, useCallback, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Provider = "openai" | "anthropic";
type ReasoningEffort = "none" | "low" | "medium" | "high" | "xhigh";
type Verbosity = "low" | "medium" | "high";

const PROVIDERS: Array<{ id: Provider; name: string; defaultModel: string }> = [
  { id: "openai", name: "OpenAI", defaultModel: "gpt-5.2-2025-12-11" },
  { id: "anthropic", name: "Anthropic", defaultModel: "claude-sonnet-4-20250514" },
];

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

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  thinking?: string;
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
  provider: Provider;
  model: string;
  reasoningEffort?: ReasoningEffort;
  verbosity?: Verbosity;
  createdAt: Date;
  updatedAt: Date;
};

type KeyItem = {
  provider: string;
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

const IconCompare = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="9"></rect>
    <rect x="14" y="3" width="7" height="9"></rect>
    <path d="M3 16h7v2H3zM14 16h7v2h-7z"></path>
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
  const [activeTab, setActiveTab] = useState<"chat" | "keys" | "compare">("chat");
  
  // Chat state
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [provider, setProvider] = useState<Provider>("openai");
  const [model, setModel] = useState<string>("gpt-5.2-2025-12-11");
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>("xhigh");
  const [verbosity, setVerbosity] = useState<Verbosity>("high");

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

  // Load sessions from DB
  const loadSessions = useCallback(async () => {
    if (!accessToken) return;
    try {
      const res = await fetch("/api/sessions", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) return;
      const json = await res.json();
      const dbSessions = (json.sessions ?? []).map((s: { id: string; title: string; provider: string; model: string; created_at: string; updated_at: string }) => ({
        id: s.id,
        title: s.title,
        messages: [] as Message[],
        provider: s.provider as Provider,
        model: s.model,
        createdAt: new Date(s.created_at),
        updatedAt: new Date(s.updated_at),
      }));
      setSessions(dbSessions);
      if (dbSessions.length > 0 && !currentSessionId) {
        setCurrentSessionId(dbSessions[0].id);
        setProvider(dbSessions[0].provider);
        setModel(dbSessions[0].model);
      }
    } catch { /* ignore */ }
  }, [accessToken, currentSessionId]);

  useEffect(() => {
    if (accessToken) {
      loadSessions();
    }
  }, [accessToken, loadSessions]);

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
        const msgs = (json.messages ?? []).map((m: { id: string; role: string; content: string; thinking?: string; usage_input_tokens?: number; usage_output_tokens?: number; usage_reasoning_tokens?: number; created_at: string }) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          content: m.content,
          thinking: m.thinking,
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
        body: JSON.stringify({ provider, model }),
      });
      if (!res.ok) return null;
      const json = await res.json();
      const newSession: ChatSession = {
        id: json.session.id,
        title: json.session.title,
        messages: [],
        provider: json.session.provider as Provider,
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
      {/* Sidebar */}
      <aside className="flex w-64 flex-col border-r border-[var(--border)] bg-[var(--sidebar)]">
        {/* New Chat Button */}
        <div className="p-3">
          <button
            onClick={createNewSession}
            className="flex w-full items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 text-sm font-medium transition hover:border-[var(--border-hover)] hover:bg-[var(--card-hover)]"
          >
            <IconPlus />
            새 대화
          </button>
        </div>

        {/* Navigation */}
        <nav className="px-3">
          <NavButton 
            active={activeTab === "chat"} 
            onClick={() => setActiveTab("chat")}
            icon={<IconChat />}
          >
            Chat
          </NavButton>
          <NavButton 
            active={activeTab === "keys"} 
            onClick={() => setActiveTab("keys")}
            icon={<IconKey />}
          >
            API Keys
          </NavButton>
          <NavButton 
            active={activeTab === "compare"} 
            onClick={() => setActiveTab("compare")}
            icon={<IconCompare />}
          >
            Compare
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
                      setCurrentSessionId(s.id);
                      setProvider(s.provider);
                      setModel(s.model);
                    }}
                    className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
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
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 opacity-0 transition hover:bg-red-500/20 hover:text-red-400 group-hover:opacity-100"
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
          <div className="flex items-center justify-between rounded-lg px-2 py-1.5">
            <div className="truncate text-sm text-[var(--muted)]">
              {user.email?.split("@")[0]}
            </div>
            <button
              onClick={signOut}
              className="rounded p-1.5 text-[var(--muted)] transition hover:bg-[var(--sidebar-hover)] hover:text-white"
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
            provider={provider}
            model={model}
            reasoningEffort={reasoningEffort}
            verbosity={verbosity}
            setProvider={setProvider}
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
          />
        )}
        {activeTab === "keys" && <KeysPanel authedFetch={authedFetch} />}
        {activeTab === "compare" && <ComparePanel authedFetch={authedFetch} />}
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

function ChatView(props: {
  session: ChatSession | null;
  provider: Provider;
  model: string;
  reasoningEffort: ReasoningEffort;
  verbosity: Verbosity;
  setProvider: (p: Provider) => void;
  setModel: (m: string) => void;
  setReasoningEffort: (r: ReasoningEffort) => void;
  setVerbosity: (v: Verbosity) => void;
  authedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  onMessagesChange: (messages: Message[]) => void;
  onCreateSession: () => Promise<string | null>;
}) {
  const [thinkingExpanded, setThinkingExpanded] = useState<Record<string, boolean>>({});
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
    if (!input.trim() || loading) return;

    let sessionId: string | null = props.session?.id ?? null;
    
    // Create session if none exists
    if (!sessionId) {
      sessionId = await props.onCreateSession();
      if (!sessionId) {
        setError("Failed to create session");
        return;
      }
      // Wait for state update
      await new Promise((r) => setTimeout(r, 100));
    }

    const userContent = input.trim();
    setInput("");
    setLoading(true);
    setError("");

    // Save user message to DB
    try {
      const userMsgRes = await props.authedFetch(`/api/sessions/${sessionId}/messages`, {
        method: "POST",
        body: JSON.stringify({ role: "user", content: userContent }),
      });
      const userMsgJson = await userMsgRes.json();
      
      const userMessage: Message = {
        id: userMsgJson.message?.id ?? generateId(),
        role: "user",
        content: userContent,
        timestamp: new Date(),
      };

      const newMessages = [...messages, userMessage];
      props.onMessagesChange(newMessages);

      // Call LLM
      const requestBody: Record<string, unknown> = {
        provider: props.provider,
        model: props.model,
        messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
      };
      
      // GPT-5.2 specific parameters (OpenAI only)
      if (props.provider === "openai") {
        requestBody.reasoningEffort = props.reasoningEffort;
        requestBody.verbosity = props.verbosity;
      }
      
      const res = await props.authedFetch("/api/chat", {
        method: "POST",
        body: JSON.stringify(requestBody),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Chat failed");

      const result = json.result ?? {};
      
      // Save assistant message to DB
      await props.authedFetch(`/api/sessions/${sessionId}/messages`, {
        method: "POST",
        body: JSON.stringify({
          role: "assistant",
          content: result.text ?? "",
          thinking: result.thinking,
          usage_input_tokens: result.usage?.inputTokens,
          usage_output_tokens: result.usage?.outputTokens,
          usage_reasoning_tokens: result.usage?.reasoningTokens,
        }),
      });

      const assistantMessage: Message = {
        id: generateId(),
        role: "assistant",
        content: result.text ?? "",
        thinking: result.thinking,
        usage: result.usage,
        timestamp: new Date(),
      };
      props.onMessagesChange([...newMessages, assistantMessage]);
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

  const providerInfo = PROVIDERS.find((p) => p.id === props.provider);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-6 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={props.provider}
            onChange={(e) => {
              const newProvider = e.target.value as Provider;
              props.setProvider(newProvider);
              const p = PROVIDERS.find((x) => x.id === newProvider);
              if (p) props.setModel(p.defaultModel);
            }}
            className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-sm outline-none transition hover:border-[var(--border-hover)]"
          >
            {PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <input
            value={props.model}
            onChange={(e) => props.setModel(e.target.value)}
            className="w-44 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-1.5 text-sm outline-none transition hover:border-[var(--border-hover)] focus:border-[var(--accent)]"
            placeholder="Model"
          />
          {/* GPT-5.2 Parameters (OpenAI only) */}
          {props.provider === "openai" && (
            <>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-[var(--muted)]">Reasoning:</span>
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
                <span className="text-xs text-[var(--muted)]">Verbosity:</span>
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
            </>
          )}
        </div>
        <div className="text-xs text-[var(--muted)]">
          shift + return으로 줄바꿈
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center animate-fade-in">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--accent)]/20">
              <IconChat />
            </div>
            <h2 className="text-lg font-semibold">대화를 시작하세요</h2>
            <p className="mt-2 max-w-sm text-sm text-[var(--muted)]">
              {providerInfo?.name ?? "OpenAI"}의 {props.model} 모델로 대화합니다
            </p>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-4">
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
                    <div className="text-sm leading-relaxed whitespace-pre-wrap">
                      {msg.content}
                    </div>
                  ) : (
                    <div className="prose prose-sm prose-invert max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {msg.content}
                      </ReactMarkdown>
                    </div>
                  )}
                </div>

                {/* Usage Info (for assistant messages) */}
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
      <div className="border-t border-[var(--border)] px-6 py-4">
        <div className="mx-auto max-w-3xl">
          <div className="relative rounded-2xl border border-[var(--border)] bg-[var(--card)] transition focus-within:border-[var(--accent)]">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="메시지를 입력하세요..."
              rows={1}
              className="w-full resize-none bg-transparent px-4 py-3 pr-12 text-sm outline-none placeholder:text-[var(--muted)]"
              disabled={loading}
            />
            <button
              onClick={send}
              disabled={loading || !input.trim()}
              className="absolute bottom-2 right-2 rounded-lg bg-[var(--accent)] p-2 text-white transition hover:bg-[var(--accent-hover)] disabled:opacity-40 disabled:hover:bg-[var(--accent)]"
            >
              <IconSend />
            </button>
          </div>
          <div className="mt-2 text-center text-xs text-[var(--muted)]">
            {providerInfo?.name} · {props.model}
          </div>
        </div>
      </div>
    </div>
  );
}

function KeysPanel(props: {
  authedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}) {
  const [items, setItems] = useState<KeyItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [inputs, setInputs] = useState<Record<Provider, string>>({
    openai: "",
    anthropic: "",
  });

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const res = await props.authedFetch("/api/keys", { method: "GET" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed to load keys");
      setItems(json.items ?? []);
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

  function getStatus(provider: Provider) {
    return items.find((x) => x.provider === provider) ?? null;
  }

  async function save(provider: Provider) {
    setLoading(true);
    setError("");
    try {
      const apiKey = inputs[provider].trim();
      const res = await props.authedFetch("/api/keys", {
        method: "POST",
        body: JSON.stringify({ provider, apiKey }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed to save key");
      setInputs((prev) => ({ ...prev, [provider]: "" }));
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function del(provider: Provider) {
    setLoading(true);
    setError("");
    try {
      const res = await props.authedFetch(`/api/keys?provider=${provider}`, {
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
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="animate-fade-in">
          <h1 className="text-xl font-semibold">API Keys</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            키는 AES-GCM으로 암호화되어 저장됩니다
          </p>
        </div>

        {PROVIDERS.map((p, i) => {
          const s = getStatus(p.id);
          return (
            <div
              key={p.id}
              className="animate-fade-in rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5"
              style={{ animationDelay: `${(i + 1) * 80}ms` }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium">{p.name}</h3>
                  <p className="text-xs text-[var(--muted)]">
                    {s?.key_hint ? `저장됨 (${s.key_hint})` : "미설정"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => del(p.id)}
                    className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm transition hover:border-red-500/50 hover:text-red-400 disabled:opacity-50"
                    disabled={loading}
                  >
                    삭제
                  </button>
                  <button
                    onClick={() => save(p.id)}
                    className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white transition hover:bg-[var(--accent-hover)] disabled:opacity-50"
                    disabled={loading || inputs[p.id].trim().length < 10}
                  >
                    저장
                  </button>
                </div>
              </div>
              <input
                type="password"
                value={inputs[p.id]}
                onChange={(e) => setInputs((prev) => ({ ...prev, [p.id]: e.target.value }))}
                placeholder="API Key 입력"
                className="mt-3 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none transition focus:border-[var(--accent)]"
              />
            </div>
          );
        })}

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
  );
}

function ComparePanel(props: {
  authedFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}) {
  const [prompt, setPrompt] = useState<string>("");
  const [targets, setTargets] = useState<Record<Provider, { enabled: boolean; model: string }>>({
    openai: { enabled: true, model: "gpt-5.2-2025-12-11" },
    anthropic: { enabled: true, model: "claude-sonnet-4-20250514" },
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [results, setResults] = useState<
    Array<
      | { provider: Provider; model: string; ok: true; result: { text: string } }
      | { provider: Provider; model: string; ok: false; error: string }
    >
  >([]);

  async function run() {
    setLoading(true);
    setError("");
    setResults([]);
    try {
      const enabledTargets = (Object.keys(targets) as Provider[])
        .filter((p) => targets[p].enabled)
        .map((p) => ({ provider: p, model: targets[p].model }));

      const res = await props.authedFetch("/api/compare", {
        method: "POST",
        body: JSON.stringify({ prompt, targets: enabledTargets }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Compare failed");
      setResults(json.results ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="animate-fade-in">
          <h1 className="text-xl font-semibold">Compare</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            동일한 프롬프트로 여러 모델의 응답을 비교하세요
          </p>
        </div>

        <div className="animate-fade-in rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5" style={{ animationDelay: "80ms" }}>
          <div className="grid gap-3 sm:grid-cols-2">
            {PROVIDERS.map((p) => (
              <label
                key={p.id}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${
                  targets[p.id].enabled
                    ? "border-[var(--accent)] bg-[var(--accent)]/10"
                    : "border-[var(--border)] hover:border-[var(--border-hover)]"
                }`}
              >
                <input
                  type="checkbox"
                  checked={targets[p.id].enabled}
                  onChange={(e) =>
                    setTargets((prev) => ({
                      ...prev,
                      [p.id]: { ...prev[p.id], enabled: e.target.checked },
                    }))
                  }
                  className="mt-1 accent-[var(--accent)]"
                />
                <div className="flex-1">
                  <div className="text-sm font-medium">{p.name}</div>
                  <input
                    value={targets[p.id].model}
                    onChange={(e) =>
                      setTargets((prev) => ({
                        ...prev,
                        [p.id]: { ...prev[p.id], model: e.target.value },
                      }))
                    }
                    className="mt-2 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-xs outline-none focus:border-[var(--accent)]"
                  />
                </div>
              </label>
            ))}
          </div>

          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="비교할 프롬프트를 입력하세요..."
            className="mt-4 min-h-28 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-3 text-sm outline-none transition focus:border-[var(--accent)]"
          />

          <button
            onClick={run}
            disabled={loading || prompt.trim().length === 0}
            className="mt-4 rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition hover:bg-[var(--accent-hover)] disabled:opacity-50"
          >
            {loading ? "실행 중…" : "비교 실행"}
          </button>
        </div>

        {error && (
          <div className="animate-fade-in rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {results.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2">
            {results.map((r, i) => (
              <div
                key={`${r.provider}:${r.model}`}
                className="animate-fade-in rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5"
                style={{ animationDelay: `${i * 100}ms` }}
              >
                <div className="mb-2 flex items-center gap-2 text-xs text-[var(--muted)]">
                  <span className="font-medium text-[var(--foreground)]">
                    {PROVIDERS.find((p) => p.id === r.provider)?.name}
                  </span>
                  <span>·</span>
                  <span>{r.model}</span>
                </div>
                <div className="chat-content text-sm leading-relaxed whitespace-pre-wrap">
                  {r.ok ? r.result.text : <span className="text-red-400">Error: {r.error}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
