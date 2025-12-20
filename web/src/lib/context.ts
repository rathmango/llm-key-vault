/**
 * Context Management Utilities
 * - Token estimation (lightweight, no external dependencies)
 * - Auto-summarization when context exceeds threshold
 */

export type MessageForContext = {
  role: "user" | "assistant" | "system";
  content: string;
  images?: string[];
};

// Simple token estimation: ~4 chars per token (rough approximation)
// More accurate than counting words, less overhead than tiktoken
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

// Estimate tokens for a message, including images
// GPT-4 Vision: ~85 tokens for low detail, ~170 for high detail per image
export function estimateMessageTokens(message: MessageForContext): number {
  const textContent = typeof message.content === "string" 
    ? message.content 
    : "";
  
  let tokens = estimateTokens(textContent);
  
  // Add ~200 tokens per image (conservative estimate for optimized images)
  if (message.images && message.images.length > 0) {
    tokens += message.images.length * 200;
  }
  
  return tokens;
}

// Estimate total tokens for all messages
export function estimateTotalTokens(messages: MessageForContext[]): number {
  return messages.reduce((sum, msg) => sum + estimateMessageTokens(msg), 0);
}

// Context limit for GPT-5.2
const MODEL_LIMITS: Record<string, number> = {
  "gpt-5.2-2025-12-11": 200000 - 32000,
  default: 168000,
};

export function getContextLimit(model: string): number {
  return MODEL_LIMITS[model] ?? MODEL_LIMITS.default;
}

// Threshold for triggering summarization (80% of limit)
export function getSummarizationThreshold(model: string): number {
  return Math.floor(getContextLimit(model) * 0.8);
}

// Check if context needs summarization
export function needsSummarization(messages: MessageForContext[], model: string): boolean {
  const totalTokens = estimateTotalTokens(messages);
  const threshold = getSummarizationThreshold(model);
  return totalTokens >= threshold;
}

// Prepare messages for summarization:
// - Keep last N messages intact
// - Return older messages to be summarized
export function splitForSummarization(
  messages: MessageForContext[],
  keepLastN: number = 3
): { toSummarize: MessageForContext[]; toKeep: MessageForContext[] } {
  if (messages.length <= keepLastN) {
    return { toSummarize: [], toKeep: messages };
  }
  
  const toSummarize = messages.slice(0, -keepLastN);
  const toKeep = messages.slice(-keepLastN);
  
  return { toSummarize, toKeep };
}

// Generate summarization prompt
export function createSummarizationPrompt(messages: MessageForContext[]): string {
  const conversation = messages
    .filter(m => m.role !== "system") // Don't include system messages
    .map(m => `${m.role === "user" ? "사용자" : "AI"}: ${m.content}`)
    .join("\n\n");
  
  return `다음 대화를 300단어 이내로 요약해주세요. 핵심 내용, 사용자의 요청사항, 중요한 맥락을 보존해주세요. 요약만 출력하고 다른 설명은 하지 마세요.

대화 내용:
${conversation}`;
}

// Build messages with summary prepended
export function buildMessagesWithSummary(
  summary: string,
  recentMessages: MessageForContext[]
): MessageForContext[] {
  const summaryMessage: MessageForContext = {
    role: "system",
    content: `[이전 대화 요약]\n${summary}\n\n위 내용은 이전 대화의 요약입니다. 이 맥락을 참고하여 대화를 이어가세요.`,
  };
  
  return [summaryMessage, ...recentMessages];
}

