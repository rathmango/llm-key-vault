import { z } from "zod";
import { requireUser } from "@/lib/api/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { decryptSecret } from "@/lib/crypto";
import { geminiGenerateText } from "@/lib/gemini";

export const runtime = "nodejs";
export const maxDuration = 300;

const BodySchema = z.object({
  sessionId: z.string().min(1),
  url: z.string().url(),
  lang: z.string().optional(), // "ko" | "en" etc
  model: z.string().optional(), // gemini model id
});

type YouTubeVideo = {
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

function getYouTubeApiKey(): string | null {
  return process.env.YOUTUBE_DATA_API_KEY ?? process.env.YOUTUBE_API_KEY ?? null;
}

function extractYouTubeId(input: string): string | null {
  const text = input.trim();
  const m1 = text.match(/(?:youtube\.com\/watch\?[^#\s]*\bv=)([a-zA-Z0-9_-]{6,})/i);
  if (m1?.[1]) return m1[1];
  const m2 = text.match(/youtu\.be\/([a-zA-Z0-9_-]{6,})/i);
  if (m2?.[1]) return m2[1];
  const m3 = text.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{6,})/i);
  if (m3?.[1]) return m3[1];
  return null;
}

type RawYouTubeVideoItem = {
  id?: string;
  snippet?: {
    title?: string;
    channelTitle?: string;
    description?: string;
    publishedAt?: string;
    thumbnails?: {
      default?: { url?: string };
      medium?: { url?: string };
      high?: { url?: string };
      standard?: { url?: string };
      maxres?: { url?: string };
    };
  };
  statistics?: { viewCount?: string };
  contentDetails?: { duration?: string };
};

function parseVideo(item: RawYouTubeVideoItem, videoId: string): YouTubeVideo {
  const snippet = item.snippet ?? {};
  const thumbnails = snippet.thumbnails ?? {};
  const thumbCandidates = [
    thumbnails.maxres?.url,
    thumbnails.standard?.url,
    thumbnails.high?.url,
    thumbnails.medium?.url,
    thumbnails.default?.url,
  ].filter((v): v is string => typeof v === "string");

  const viewCountRaw = item.statistics?.viewCount;
  const viewCount = typeof viewCountRaw === "string" ? Number(viewCountRaw) : null;

  return {
    videoId,
    url: `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`,
    title: typeof snippet.title === "string" ? snippet.title : null,
    channelTitle: typeof snippet.channelTitle === "string" ? snippet.channelTitle : null,
    description: typeof snippet.description === "string" ? snippet.description : null,
    publishedAt: typeof snippet.publishedAt === "string" ? snippet.publishedAt : null,
    thumbnail: thumbCandidates[0] ?? null,
    viewCount: Number.isFinite(viewCount) ? viewCount : null,
    duration: typeof item.contentDetails?.duration === "string" ? item.contentDetails.duration : null,
  };
}

async function fetchVideoMeta(apiKey: string, videoId: string): Promise<YouTubeVideo> {
  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.searchParams.set("part", "snippet,statistics,contentDetails");
  url.searchParams.set("id", videoId);
  url.searchParams.set("key", apiKey);

  const res = await fetch(url.toString(), { method: "GET" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = typeof json?.error?.message === "string" ? json.error.message : `YouTube API error (${res.status})`;
    throw new Error(msg);
  }
  const item = Array.isArray(json?.items) ? (json.items[0] as RawYouTubeVideoItem | undefined) : undefined;
  return parseVideo(item ?? {}, videoId);
}

async function loadGeminiKey(userId: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("api_keys")
    .select("encrypted_key")
    .eq("user_id", userId)
    .eq("provider", "gemini")
    .maybeSingle();
  if (error) return null;
  if (!data?.encrypted_key) return null;
  try {
    return decryptSecret(data.encrypted_key);
  } catch {
    return null;
  }
}

function takeSection(all: string, header: string): string {
  const re = new RegExp(`^###\\s+${header}\\s*$`, "mi");
  const idx = all.search(re);
  if (idx < 0) return "";
  const rest = all.slice(idx);
  const after = rest.replace(re, "").replace(/^\r?\n/, "");
  const next = after.search(/^###\s+/m);
  return (next >= 0 ? after.slice(0, next) : after).trim();
}

function sanitizeTranscript(text: string): { text: string; isTruncated: boolean; segmentsCount: number } {
  const MAX_CHARS = 160_000;
  let out = text.trim();
  let isTruncated = false;
  if (out.length > MAX_CHARS) {
    out = out.slice(0, MAX_CHARS);
    isTruncated = true;
  }
  const segmentsCount = out
    .split("\n")
    .map((x) => x.trim())
    .filter((x) => /^\[\d{2}:\d{2}\]/.test(x) || /^\[\d{2}:\d{2}:\d{2}\]/.test(x))
    .length;
  return { text: out, isTruncated, segmentsCount };
}

function buildAnalysisMarkdown(args: {
  video: YouTubeVideo;
  summaryMd: string;
  outlineMd: string;
  questionsMd: string;
  transcriptSaved: boolean;
  transcriptSource: string;
  transcriptTruncated: boolean;
}): string {
  const lines: string[] = [];
  lines.push(`## 📺 ${args.video.title ?? "YouTube 영상"}`);
  if (args.video.channelTitle) lines.push(`- 채널: **${args.video.channelTitle}**`);
  lines.push(`- 링크: ${args.video.url}`);
  lines.push("");
  lines.push("## 요약");
  lines.push(args.summaryMd || "- (요약 생성 실패)");
  lines.push("");
  lines.push("## 타임스탬프 아웃라인");
  lines.push(args.outlineMd || "- (아웃라인 생성 실패)");
  lines.push("");
  lines.push("## 다음 질문 추천");
  lines.push(args.questionsMd || "- (질문 추천 생성 실패)");
  lines.push("");
  if (args.transcriptSaved) {
    lines.push(
      `> 전문(트랜스크립트)은 **DB에 저장**되었습니다. (source: \`${args.transcriptSource}\`${args.transcriptTruncated ? ", truncated" : ""})`
    );
  } else {
    lines.push("> 전문(트랜스크립트)을 저장하지 못했습니다. (Gemini 키 설정 필요)");
  }
  return lines.join("\n");
}

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const body = BodySchema.parse(await request.json());

    const videoId = extractYouTubeId(body.url);
    if (!videoId) return Response.json({ error: "Invalid YouTube URL" }, { status: 400 });

    const supabase = getSupabaseAdmin();

    // Verify session ownership
    const { data: session } = await supabase
      .from("chat_sessions")
      .select("id")
      .eq("id", body.sessionId)
      .eq("user_id", user.id)
      .single();

    if (!session) return Response.json({ error: "Session not found" }, { status: 404 });

    const ytKey = getYouTubeApiKey();
    if (!ytKey) return Response.json({ error: "Missing YOUTUBE_DATA_API_KEY" }, { status: 500 });

    const geminiKey = await loadGeminiKey(user.id);
    if (!geminiKey) {
      return Response.json({ error: "Gemini API key not set. Save it in API Key 탭 (Gemini)." }, { status: 400 });
    }

    const lang = (body.lang ?? "ko").trim() || "ko";
    const geminiModel = body.model ?? "gemini-2.5-flash";

    // Fetch metadata + run Gemini once to get transcript + analysis sections
    const video = await fetchVideoMeta(ytKey, videoId);

    const prompt = [
      "You are an expert YouTube video analyzer and transcription engine.",
      "",
      "Return EXACTLY four sections in this order, each starting with its header line:",
      "### SUMMARY",
      "### OUTLINE",
      "### QUESTIONS",
      "### TRANSCRIPT",
      "",
      "Rules:",
      "- SUMMARY: 8–12 bullet points in Korean.",
      "- OUTLINE: bullet list of key moments. Each bullet MUST start with [MM:SS].",
      "- QUESTIONS: 5 follow-up questions in Korean.",
      "- TRANSCRIPT: FULL transcript of ALL spoken words. Each line MUST be: [MM:SS] <text>",
      "- Output ONLY these sections; no extra text.",
      "",
      `Preferred language hint: ${lang}`,
      "",
      "Important: If the video is long, still try to output as much transcript as possible in the required format.",
    ].join("\n");

    const combined = await geminiGenerateText({
      apiKey: geminiKey,
      model: geminiModel,
      contents: [
        {
          role: "user",
          parts: [
            { file_data: { file_uri: video.url } },
            { text: prompt },
          ],
        },
      ],
    });

    const summaryMd = takeSection(combined, "SUMMARY");
    const outlineMd = takeSection(combined, "OUTLINE");
    const questionsMd = takeSection(combined, "QUESTIONS");
    const transcriptRaw = takeSection(combined, "TRANSCRIPT");
    const transcriptSanitized = sanitizeTranscript(transcriptRaw);

    // Upsert video_contexts
    const { data: ctx, error: upsertError } = await supabase
      .from("video_contexts")
      .upsert(
        {
          user_id: user.id,
          session_id: body.sessionId,
          provider: "gemini",
          video_id: videoId,
          url: video.url,
          title: video.title,
          channel_title: video.channelTitle,
          description: video.description,
          transcript_language: lang,
          transcript_source: "gemini",
          transcript_text: transcriptSanitized.text,
          summary_md: summaryMd,
          outline_md: outlineMd,
          questions_md: questionsMd,
        },
        { onConflict: "session_id,video_id" }
      )
      .select()
      .single();

    if (upsertError) throw new Error(upsertError.message);

    const assistantMarkdown = buildAnalysisMarkdown({
      video,
      summaryMd,
      outlineMd,
      questionsMd,
      transcriptSaved: Boolean(transcriptSanitized.text),
      transcriptSource: "gemini",
      transcriptTruncated: transcriptSanitized.isTruncated,
    });

    return Response.json({
      context: ctx,
      video,
      analysis: {
        markdown: assistantMarkdown,
        transcriptTruncated: transcriptSanitized.isTruncated,
        transcriptSegments: transcriptSanitized.segmentsCount,
      },
    });
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof z.ZodError) return Response.json({ error: e.message }, { status: 400 });
    const message = e instanceof Error ? e.message : "Unexpected error";
    return Response.json({ error: message }, { status: 500 });
  }
}


