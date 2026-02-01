/**
 * TypeScript type definitions for the Gnosis database schema.
 * These types mirror the Prisma schema models with camelCase field names.
 *
 * Note: Prisma generates its own types, but these are used throughout
 * the app for convenience and to avoid importing from @prisma/client everywhere.
 */

// ---------------------------------------------------------------------------
// Table row types (what you get back from a query)
// ---------------------------------------------------------------------------

export interface Chapter {
  id: string;
  chapterNumber: number;
  title: string;
  description: string;
  targetVocabulary: string[];
  targetGrammar: string[];
  createdAt: Date;
}

export interface Scenario {
  id: string;
  chapterId: string;
  scenarioNumber: number;
  title: string;
  contextDescription: string;
  agentRole: string;
  targetPhrases: string[];
  systemPrompt: string;
  createdAt: Date;
}

export interface UserProgress {
  id: string;
  userId: string;
  scenarioId: string;
  completed: boolean;
  accuracyScore: number | null;
  vocabularyUsed: string[] | null;
  completedAt: Date | null;
  createdAt: Date;
}

export interface ConversationMessage {
  id: string;
  userId: string;
  scenarioId: string;
  role: string;
  content: string;
  corrections: Record<string, unknown> | null;
  createdAt: Date;
}
