import OpenAI from "openai";
import { ChatCompletionCreateParamsNonStreaming } from "openai/resources/chat/completions";

const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000; // 1 second
const MAX_RETRY_DELAY = 10000; // 10 seconds

export async function createChatCompletionWithRetry(
  openai: OpenAI,
  params: ChatCompletionCreateParamsNonStreaming
) {
  let retryCount = 0;
  let lastError: any;

  while (retryCount < MAX_RETRIES) {
    try {
      // Direct API call without throttling
      const completion = await openai.chat.completions.create(params);
      return completion;
    } catch (error: any) {
      lastError = error;

      // Check if it's a rate limit error
      if (error.status === 429 || error.message?.includes("rate limit")) {
        // Calculate exponential backoff delay
        const delay = Math.min(
          INITIAL_RETRY_DELAY * Math.pow(2, retryCount),
          MAX_RETRY_DELAY
        );

        console.log(
          `Rate limit hit. Retrying in ${delay}ms... (Attempt ${
            retryCount + 1
          }/${MAX_RETRIES})`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        retryCount++;
        continue;
      }

      // If it's not a rate limit error, throw immediately
      throw error;
    }
  }

  // If we've exhausted all retries, throw the last error
  throw lastError;
}
