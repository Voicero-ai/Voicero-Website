import Bottleneck from "bottleneck";
import OpenAI from "openai";
import { ChatCompletionCreateParamsNonStreaming } from "openai/resources/chat/completions";

// Create a limiter: max 5 calls/sec, 200k tokens/minute (approx ~3.3k tokens/sec)
const limiter = new Bottleneck({
  reservoir: 200_000, // tokens available per minute
  reservoirRefreshAmount: 200_000, // reset each interval
  reservoirRefreshInterval: 60_000, // 60 000 ms = 1 min
  maxConcurrent: 2, // limit concurrency
  minTime: 200, // at least 200 ms between calls (~5 calls/sec)
});

// Helper function to estimate token count
function estimateTokenCount(
  params: ChatCompletionCreateParamsNonStreaming
): number {
  // Rough estimation: 4 characters per token for English text
  const promptTokens =
    params.messages?.reduce((acc, msg) => {
      return acc + (msg.content?.length || 0) / 4;
    }, 0) || 0;

  const maxTokens = params.max_tokens || 0;
  return Math.ceil(promptTokens + maxTokens);
}

export async function createThrottledChatCompletion(
  openai: OpenAI,
  params: ChatCompletionCreateParamsNonStreaming
) {
  const estimatedTokens = estimateTokenCount(params);

  return limiter.schedule({ weight: estimatedTokens }, async () => {
    try {
      return await openai.chat.completions.create(params);
    } catch (error: any) {
      // If we hit a rate limit, we'll let the limiter handle the retry
      if (error.status === 429 || error.message?.includes("rate limit")) {
        throw error;
      }
      // For other errors, throw immediately
      throw error;
    }
  });
}
