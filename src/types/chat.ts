/**
 * Chat message types used throughout the Gnosis application.
 * These types define the interface between the client, API routes, and the Groq LLM.
 */

/** Roles that can appear in a chat message */
export type ChatRole = "system" | "user" | "assistant";

/** A single message in a chat conversation */
export interface ChatMessage {
  role: ChatRole;
  content: string;
}

/** Request body for the /api/chat endpoint */
export interface ChatRequest {
  messages: ChatMessage[];
  /** Optional scenario ID to load context from the database */
  scenarioId?: string;
}

/** Info about the next scenario after completion */
export interface NextScenarioInfo {
  id: string;
  title: string;
  chapterId: string;
  scenarioNumber: number;
}

/** Non-streaming response from the /api/chat endpoint */
export interface ChatResponse {
  message: ChatMessage;
  /** Whether the scenario was completed in this turn */
  scenarioCompleted?: boolean;
  /** Whether the entire chapter is complete */
  chapterCompleted?: boolean;
  /** Info about the next scenario, if any */
  nextScenario?: NextScenarioInfo;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/** Error response from the /api/chat endpoint */
export interface ChatErrorResponse {
  error: string;
  code?: string;
}
