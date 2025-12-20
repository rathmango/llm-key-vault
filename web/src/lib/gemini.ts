export type GeminiGenerateContentResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
  promptFeedback?: unknown;
};

export async function geminiGenerateText(params: {
  apiKey: string;
  model: string; // e.g. "gemini-2.5-flash"
  contents: Array<{
    role?: "user" | "model";
    parts: Array<
      | { text: string }
      | {
          file_data: {
            file_uri: string;
          };
        }
    >;
  }>;
}): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    params.model
  )}:generateContent`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": params.apiKey,
    },
    body: JSON.stringify({
      contents: params.contents,
    }),
  });

  const json = (await res.json().catch(() => null)) as GeminiGenerateContentResponse | null;
  if (!res.ok) {
    const err = json as unknown as { error?: { message?: unknown } };
    const msg =
      (typeof err?.error?.message === "string" ? err.error.message : null) ??
      `Gemini request failed (${res.status})`;
    throw new Error(msg);
  }

  const text = json?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  return text;
}

export async function geminiTranscribeYouTubeUrl(params: {
  apiKey: string;
  youtubeUrl: string;
  languageHint?: string; // "ko" / "en"
  model?: string;
}): Promise<{ language: string; textWithTimestamps: string }> {
  const model = params.model ?? "gemini-2.5-flash";
  const lang = (params.languageHint ?? "ko").trim() || "ko";

  const prompt = [
    "You are a transcription engine.",
    "",
    "Task: Produce a FULL transcript of all spoken audio in the provided YouTube video.",
    "",
    "Format requirements:",
    "- Output ONLY the transcript (no commentary).",
    "- Each line MUST be: [MM:SS] <text>",
    "- Include everything that is spoken (do not summarize, do not omit filler).",
    "- Use the video's original spoken language; if mixed, keep mixed.",
    "- Prefer exact timestamps; if uncertain, approximate but keep monotonic order.",
    "",
    `Preferred language hint: ${lang}`,
  ].join("\n");

  const text = await geminiGenerateText({
    apiKey: params.apiKey,
    model,
    contents: [
      {
        role: "user",
        parts: [
          { file_data: { file_uri: params.youtubeUrl } },
          { text: prompt },
        ],
      },
    ],
  });

  return { language: lang, textWithTimestamps: text.trim() };
}


