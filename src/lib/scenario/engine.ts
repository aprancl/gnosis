/**
 * Core scenario engine.
 *
 * Responsible for loading scenario context from the database, managing
 * conversation state, and detecting scenario completion. This module ties
 * together the database, prompt builder, and Groq API client.
 */

import { db } from "@/server/db";
import { createChatCompletion } from "@/lib/groq/client";
import { buildSystemPrompt, buildFallbackSystemPrompt } from "@/lib/scenario/prompts";
import type { Scenario, Chapter } from "@/types/database";
import type { ChatMessage } from "@/types/chat";

import { SCENARIO_COMPLETE_MARKER } from "@/lib/scenario/constants";

// Re-export so existing consumers that import from engine.ts continue to work.
export { SCENARIO_COMPLETE_MARKER };

/** Result of loading scenario context from the database */
export interface ScenarioContext {
  scenario: Scenario;
  chapter: Chapter;
  systemPrompt: string;
}

/** Result of processing a conversation turn through the engine */
export interface ConversationTurnResult {
  /** The assistant's response message */
  assistantMessage: string;
  /** Whether the scenario has been completed in this turn */
  scenarioCompleted: boolean;
  /** Token usage from the LLM call */
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Load scenario and its parent chapter from the database.
 */
export async function loadScenarioContext(
  scenarioId: string
): Promise<ScenarioContext | null> {
  try {
    const scenario = await db.scenario.findUnique({
      where: { id: scenarioId },
      include: { chapter: true },
    });

    if (!scenario) {
      console.error("[scenario-engine] Scenario not found:", scenarioId);
      return null;
    }

    const typedScenario = scenario as unknown as Scenario;
    const typedChapter = scenario.chapter as unknown as Chapter;

    const systemPrompt = buildSystemPrompt({
      scenario: typedScenario,
      chapter: typedChapter,
    });

    return {
      scenario: typedScenario,
      chapter: typedChapter,
      systemPrompt,
    };
  } catch (error) {
    console.error("[scenario-engine] Failed to load scenario:", error);
    return null;
  }
}

/**
 * Detect whether the agent's response contains the scenario completion marker.
 */
export function detectCompletion(content: string): boolean {
  return content.includes(SCENARIO_COMPLETE_MARKER);
}

/**
 * Strip the completion marker from the assistant's response for display.
 */
export function stripCompletionMarker(content: string): string {
  return content.replace(SCENARIO_COMPLETE_MARKER, "").trim();
}

/**
 * Process a single conversation turn through the scenario engine.
 */
export async function processConversationTurn(
  systemPrompt: string,
  conversationHistory: ChatMessage[]
): Promise<ConversationTurnResult> {
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...conversationHistory,
  ];

  const result = await createChatCompletion(messages, {
    temperature: 0.7,
  });

  const scenarioCompleted = detectCompletion(result.content);
  const assistantMessage = scenarioCompleted
    ? stripCompletionMarker(result.content)
    : result.content;

  return {
    assistantMessage,
    scenarioCompleted,
    usage: result.usage,
  };
}

/**
 * Build a system prompt for a scenario, or return a fallback if the scenario
 * cannot be loaded.
 */
export async function getSystemPromptForScenario(
  scenarioId?: string
): Promise<string> {
  if (!scenarioId) {
    return buildFallbackSystemPrompt();
  }

  const context = await loadScenarioContext(scenarioId);
  if (!context) {
    console.warn(
      "[scenario-engine] Could not load scenario, using fallback prompt"
    );
    return buildFallbackSystemPrompt();
  }

  return context.systemPrompt;
}
