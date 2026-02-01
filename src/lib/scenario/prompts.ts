/**
 * System prompt builder for scenario-based conversations.
 *
 * Constructs the LLM system prompt from scenario data, chapter context,
 * and conversation management instructions. Uses reusable template sections
 * from prompt-templates.ts. The prompt instructs the agent to stay in
 * character, respond in Koine Greek, provide inline corrections, and track
 * whether the user has met scenario objectives.
 */

import type { Scenario, Chapter } from "@/types/database";
import {
  baseSystemPrompt,
  scenarioContextSection,
  learningTargetsSection,
  scenarioSystemPreamble,
} from "@/lib/scenario/prompt-templates";

/** Data needed to build a scenario system prompt */
export interface ScenarioPromptData {
  scenario: Scenario;
  chapter: Chapter;
}

/**
 * Build the full system prompt for a scenario conversation.
 *
 * The prompt is composed of:
 * 1. The base system prompt (shared behavioral instructions, calibrated to chapter level)
 * 2. The scenario-specific preamble (character instructions from the scenario record)
 * 3. The scenario context section (setting, role, chapter info)
 * 4. The learning targets section (vocabulary, grammar, phrases)
 *
 * Sections are separated by horizontal rules for clarity.
 */
export function buildSystemPrompt(data: ScenarioPromptData): string {
  const { scenario, chapter } = data;

  const base = baseSystemPrompt(chapter.chapterNumber);

  const preamble = scenarioSystemPreamble(scenario.systemPrompt);

  const context = scenarioContextSection({
    title: scenario.title,
    contextDescription: scenario.contextDescription,
    agentRole: scenario.agentRole,
    chapterNumber: chapter.chapterNumber,
    chapterTitle: chapter.title,
  });

  const targets = learningTargetsSection({
    targetVocabulary: chapter.targetVocabulary,
    targetGrammar: chapter.targetGrammar,
    targetPhrases: scenario.targetPhrases,
  });

  return `${base}

---

${preamble}

---

${context}

${targets}`;
}

/**
 * Build a minimal system prompt for when scenario data is not available.
 * Falls back to a generic Koine Greek conversation partner.
 */
export function buildFallbackSystemPrompt(): string {
  return `You are a conversational partner for practicing Koine Greek (Ancient/Biblical Greek, NOT modern Greek).
You use reconstructed Koine pronunciation following the Buth "Living Koine" method.

## Rules
- Respond primarily in Koine Greek.
- Keep your language simple and clear.
- Gently correct grammatical errors inline.
- Only switch to English if the user explicitly asks for help or clarification.
- Be encouraging and patient.
`;
}
