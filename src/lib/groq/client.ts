/**
 * Server-side Groq API client.
 *
 * This module provides a configured Groq client instance and a chat completion
 * wrapper for interacting with the Groq API. It must only be used in server-side
 * code (API routes, server components, server actions) to keep the API key secret.
 */

import Groq from "groq-sdk";
import { serverEnv } from "@/lib/env";
import type { ChatMessage } from "@/types/chat";

/** Lazily-initialized singleton Groq client */
let groqClient: Groq | null = null;

function getGroqClient(): Groq {
  if (!groqClient) {
    groqClient = new Groq({
      apiKey: serverEnv.GROQ_API_KEY,
    });
  }
  return groqClient;
}

/** Options for the chat completion request */
export interface ChatCompletionOptions {
  /** Override the default model for this request */
  model?: string;
  /** Sampling temperature (0-2). Lower = more deterministic. */
  temperature?: number;
  /** Maximum tokens in the response */
  maxCompletionTokens?: number;
  /** Whether to stream the response */
  stream?: boolean;
}

/**
 * Send a chat completion request to Groq and return the assistant's response.
 *
 * @param messages - The conversation history
 * @param options - Optional parameters for the completion request
 * @returns The assistant's response message content
 */
export async function createChatCompletion(
  messages: ChatMessage[],
  options: ChatCompletionOptions = {}
): Promise<{ content: string; usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number } }> {
  const client = getGroqClient();
  const model = options.model ?? serverEnv.GROQ_MODEL_ID;

  const completion = await client.chat.completions.create({
    model,
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
    temperature: options.temperature ?? 0.7,
    max_completion_tokens: options.maxCompletionTokens,
    stream: false,
  });

  const responseContent = completion.choices[0]?.message?.content ?? "";

  return {
    content: responseContent,
    usage: completion.usage
      ? {
          prompt_tokens: completion.usage.prompt_tokens,
          completion_tokens: completion.usage.completion_tokens,
          total_tokens: completion.usage.total_tokens,
        }
      : undefined,
  };
}

/**
 * Send a streaming chat completion request to Groq.
 * Returns a ReadableStream suitable for use with Next.js streaming responses.
 *
 * @param messages - The conversation history
 * @param options - Optional parameters for the completion request
 * @returns A ReadableStream of server-sent event chunks
 */
export async function createStreamingChatCompletion(
  messages: ChatMessage[],
  options: Omit<ChatCompletionOptions, "stream"> = {}
): Promise<ReadableStream<Uint8Array>> {
  const client = getGroqClient();
  const model = options.model ?? serverEnv.GROQ_MODEL_ID;

  const stream = await client.chat.completions.create({
    model,
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
    temperature: options.temperature ?? 0.7,
    max_completion_tokens: options.maxCompletionTokens,
    stream: true,
  });

  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content;
          if (content) {
            controller.enqueue(encoder.encode(content));
          }
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}
