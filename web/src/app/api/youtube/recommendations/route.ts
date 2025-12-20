import { requireUser } from "@/lib/api/auth";

export const runtime = "nodejs";

type Category = "all" | "finance" | "parenting" | "creator" | "it";

type YouTubeRecommendationItem = {
  videoId: string;
  url: string;
  title: string;
  channelTitle: string;
  publishedAt: string | null;
  thumbnail: string | null;
  viewCount: number | null;
  duration: string | null;
};

type TrendingCache = {
  fetchedAtMs: number;
  items: YouTubeRecommendationItem[];
};

type RawYouTubeVideo = {
  id?: string;
  snippet?: {
    title?: string;
    channelTitle?: string;
    publishedAt?: string;
    thumbnails?: {
      default?: { url?: string };
      medium?: { url?: string };
      high?: { url?: string };
      standard?: { url?: string };
      maxres?: { url?: string };
    };
  };
  statistics?: {
    viewCount?: string;
  };
  contentDetails?: {
    duration?: string;
  };
};

function getApiKey(): string | null {
  // Support both names; prefer the explicit one.
  return process.env.YOUTUBE_DATA_API_KEY ?? process.env.YOUTUBE_API_KEY ?? null;
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function normalizeText(s: string): string {
  return s.toLowerCase();
}

function matchesCategory(item: YouTubeRecommendationItem, category: Category): boolean {
  if (category === "all") return true;
  const hay = normalizeText(`${item.title}\n${item.channelTitle}`);

  const KEYWORDS: Record<Exclude<Category, "all">, string[]> = {
    finance: [
      "경제",
      "금리",
      "환율",
      "주식",
      "증시",
      "코스피",
      "코스닥",
      "부동산",
      "인플레",
      "물가",
      "채권",
      "연준",
      "fomc",
      "비트코인",
      "가상자산",
      "투자",
      "재테크",
      "금융",
      "시장",
    ],
    parenting: [
      "임신",
      "출산",
      "산모",
      "신생아",
      "육아",
      "수유",
      "모유",
      "분유",
      "산후",
      "태교",
      "산전",
      "산후조리",
      "아기",
      "유아",
    ],
    creator: [
      "릴스",
      "reels",
      "shorts",
      "쇼츠",
      "틱톡",
      "capcut",
      "캡컷",
      "편집",
      "영상편집",
      "브이로그",
      "촬영",
      "콘텐츠",
      "크리에이터",
      "인스타",
      "인스타그램",
      "자막",
    ],
    it: [
      "개발",
      "코딩",
      "프로그래밍",
      "next.js",
      "react",
      "리액트",
      "typescript",
      "자바스크립트",
      "ai",
      "llm",
      "gpt",
      "gemini",
      "supabase",
      "docker",
      "kubernetes",
      "프론트엔드",
      "백엔드",
    ],
  };

  const keywords = KEYWORDS[category];
  return keywords.some((k) => hay.includes(normalizeText(k)));
}

function parseYouTubeVideo(item: RawYouTubeVideo): YouTubeRecommendationItem | null {
  const videoId = typeof item.id === "string" ? item.id : null;
  const snippet = item.snippet ?? null;
  const title = typeof snippet?.title === "string" ? snippet.title : null;
  const channelTitle = typeof snippet?.channelTitle === "string" ? snippet.channelTitle : null;
  const publishedAt = typeof snippet?.publishedAt === "string" ? snippet.publishedAt : null;

  const thumbnails = snippet?.thumbnails ?? null;
  const thumbCandidates = [
    thumbnails?.maxres?.url,
    thumbnails?.standard?.url,
    thumbnails?.high?.url,
    thumbnails?.medium?.url,
    thumbnails?.default?.url,
  ].filter((v: unknown) => typeof v === "string") as string[];
  const thumbnail = thumbCandidates[0] ?? null;

  const viewCountRaw = item?.statistics?.viewCount;
  const viewCount = typeof viewCountRaw === "string" ? Number(viewCountRaw) : null;
  const duration = typeof item?.contentDetails?.duration === "string" ? item.contentDetails.duration : null;

  if (!videoId || !title || !channelTitle) return null;

  return {
    videoId,
    url: `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`,
    title,
    channelTitle,
    publishedAt,
    thumbnail,
    viewCount: Number.isFinite(viewCount) ? viewCount : null,
    duration,
  };
}

async function fetchTrendingKR(apiKey: string): Promise<YouTubeRecommendationItem[]> {
  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.searchParams.set("part", "snippet,statistics,contentDetails");
  url.searchParams.set("chart", "mostPopular");
  url.searchParams.set("regionCode", "KR");
  url.searchParams.set("maxResults", "50");
  url.searchParams.set("key", apiKey);

  const res = await fetch(url.toString(), { method: "GET" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      typeof json?.error?.message === "string"
        ? json.error.message
        : `YouTube API error (${res.status})`;
    throw new Error(message);
  }

  const rawItems = Array.isArray(json?.items) ? (json.items as RawYouTubeVideo[]) : [];
  const out: YouTubeRecommendationItem[] = [];
  for (const it of rawItems) {
    const parsed = parseYouTubeVideo(it);
    if (parsed) out.push(parsed);
  }
  return out;
}

function getCache(): TrendingCache | null {
  const g = globalThis as unknown as { __llmkv_youtube_trending_cache?: TrendingCache };
  return g.__llmkv_youtube_trending_cache ?? null;
}

function setCache(value: TrendingCache) {
  const g = globalThis as unknown as { __llmkv_youtube_trending_cache?: TrendingCache };
  g.__llmkv_youtube_trending_cache = value;
}

export async function GET(request: Request) {
  try {
    // Auth-gate the endpoint (even though results are public); keeps consistent access patterns.
    await requireUser(request);

    const apiKey = getApiKey();
    if (!apiKey) {
      return Response.json(
        {
          error:
            "Missing YouTube API key. Set server env var YOUTUBE_DATA_API_KEY (recommended) or YOUTUBE_API_KEY.",
        },
        { status: 500 }
      );
    }

    const url = new URL(request.url);
    const categoryRaw = (url.searchParams.get("category") ?? "all").trim();
    const maxResultsRaw = url.searchParams.get("maxResults") ?? "12";

    const category = (["all", "finance", "parenting", "creator", "it"].includes(categoryRaw)
      ? categoryRaw
      : "all") as Category;
    const maxResults = clampInt(parseInt(maxResultsRaw, 10), 1, 24);

    // Cache trending list for a short TTL (fast UX + reduced quota).
    const ttlMs = 5 * 60 * 1000;
    const now = Date.now();
    let cache = getCache();
    if (!cache || now - cache.fetchedAtMs > ttlMs) {
      const items = await fetchTrendingKR(apiKey);
      cache = { fetchedAtMs: now, items };
      setCache(cache);
    }

    const trending = cache.items;
    const filtered = category === "all" ? trending : trending.filter((it) => matchesCategory(it, category));

    const picked: YouTubeRecommendationItem[] = [];
    const seen = new Set<string>();

    for (const it of filtered) {
      if (picked.length >= maxResults) break;
      if (seen.has(it.videoId)) continue;
      seen.add(it.videoId);
      picked.push(it);
    }

    // Fill remaining with general trending to avoid empty states.
    if (picked.length < maxResults) {
      for (const it of trending) {
        if (picked.length >= maxResults) break;
        if (seen.has(it.videoId)) continue;
        seen.add(it.videoId);
        picked.push(it);
      }
    }

    return Response.json({
      items: picked,
      meta: {
        regionCode: "KR",
        category,
        source: "videos.list(chart=mostPopular)+keyword-filter",
        fetchedAt: new Date(cache.fetchedAtMs).toISOString(),
        ttlSeconds: Math.floor(ttlMs / 1000),
      },
    });
  } catch (e) {
    if (e instanceof Response) return e;
    const message = e instanceof Error ? e.message : "Unexpected error";
    return Response.json({ error: message }, { status: 500 });
  }
}


