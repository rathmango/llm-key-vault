export type WebSearchSource = {
  title: string;
  url: string;
  snippet?: string;
};

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable: ${name}`);
  return v;
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + "…";
}

export async function searchWeb(query: string, opts?: { maxResults?: number; timeoutMs?: number }): Promise<WebSearchSource[]> {
  const apiKey = requireEnv("TAVILY_API_KEY");
  const maxResults = opts?.maxResults ?? 5;
  const timeoutMs = opts?.timeoutMs ?? 12_000;

  const q = query.trim();
  if (!q) return [];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query: q,
        max_results: maxResults,
        search_depth: "basic",
        include_answer: false,
        include_raw_content: false,
        include_images: false,
      }),
      signal: controller.signal,
    });

    const data = await res.json().catch(() => null) as unknown;

    if (!res.ok) {
      const message =
        (data as { error?: string })?.error ??
        (data as { message?: string })?.message ??
        `Tavily request failed (${res.status})`;
      throw new Error(message);
    }

    const results = Array.isArray((data as { results?: unknown })?.results)
      ? ((data as { results: Array<{ title?: unknown; url?: unknown; content?: unknown }> }).results ?? [])
      : [];

    return results
      .map((r) => ({
        title: typeof r.title === "string" ? truncate(r.title, 160) : "",
        url: typeof r.url === "string" ? r.url : "",
        snippet: typeof r.content === "string" ? truncate(r.content, 480) : undefined,
      }))
      .filter((r) => r.title.length > 0 && r.url.length > 0);
  } finally {
    clearTimeout(timer);
  }
}


