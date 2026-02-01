/**
 * Core scenario engine.
 *
 * Responsible for loading scenario context from Supabase, managing conversation
 * state, and detecting scenario completion. This module ties together the
 * database, prompt builder, and Groq API client.
 */

import { createClient } from "@/lib/supabase/server";
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
 * Load scenario and its parent chapter from Supabase.
 *
 * @param scenarioId - The UUID of the scenario to load
 * @returns The scenario context including the built system prompt, or null if not found
 */
export async function loadScenarioContext(
  scenarioId: string
): Promise<ScenarioContext | null> {
  const supabase = await createClient();

  // Load the scenario (select only needed columns for prompt building)
  const { data: scenario, error: scenarioError } = await supabase
    .from("scenarios")
    .select("id, chapter_id, scenario_number, title, context_description, agent_role, target_phrases, system_prompt")
    .eq("id", scenarioId)
    .single();

  if (scenarioError || !scenario) {
    console.error(
      "[scenario-engine] Failed to load scenario:",
      scenarioError?.message ?? "Not found"
    );
    return null;
  }

  // Load the parent chapter for vocabulary/grammar targets (select only needed columns)
  const { data: chapter, error: chapterError } = await supabase
    .from("chapters")
    .select("id, chapter_number, title, description, target_vocabulary, target_grammar")
    .eq("id", scenario.chapter_id)
    .single();

  if (chapterError || !chapter) {
    console.error(
      "[scenario-engine] Failed to load chapter:",
      chapterError?.message ?? "Not found"
    );
    return null;
  }

  // Cast the raw Supabase response to our typed interfaces.
  // The jsonb columns (target_vocabulary, target_grammar, target_phrases)
  // come back as unknown from the generic .select("*") call.
  const typedScenario = scenario as unknown as Scenario;
  const typedChapter = chapter as unknown as Chapter;

  const systemPrompt = buildSystemPrompt({
    scenario: typedScenario,
    chapter: typedChapter,
  });

  return {
    scenario: typedScenario,
    chapter: typedChapter,
    systemPrompt,
  };
}

/**
 * Detect whether the agent's response contains the scenario completion marker.
 *
 * @param content - The assistant's response text
 * @returns Whether the completion marker was found
 */
export function detectCompletion(content: string): boolean {
  return content.includes(SCENARIO_COMPLETE_MARKER);
}

/**
 * Strip the completion marker from the assistant's response for display.
 *
 * @param content - The assistant's response text (may contain the marker)
 * @returns The response with the marker removed and trimmed
 */
export function stripCompletionMarker(content: string): string {
  return content.replace(SCENARIO_COMPLETE_MARKER, "").trim();
}

/**
 * Process a single conversation turn through the scenario engine.
 *
 * Takes the conversation history (user messages + previous assistant messages),
 * prepends the scenario system prompt, sends it to Groq, and checks for
 * scenario completion in the response.
 *
 * @param systemPrompt - The built system prompt for the scenario
 * @param conversationHistory - The conversation messages so far (user + assistant, no system)
 * @returns The conversation turn result with the assistant's response and completion status
 */
export async function processConversationTurn(
  systemPrompt: string,
  conversationHistory: ChatMessage[]
): Promise<ConversationTurnResult> {
  // Build the full message list with system prompt first
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
 * cannot be loaded. Useful when the caller wants a prompt string without
 * managing the full engine flow.
 *
 * @param scenarioId - The UUID of the scenario, or undefined for fallback
 * @returns The system prompt string
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
