/**
 * TypeScript type definitions for the Gnosis database schema.
 * These types mirror the PostgreSQL tables defined in supabase/migrations/001_initial_schema.sql.
 *
 * Follows the Supabase convention of Database > public > Tables > { Row, Insert, Update }.
 */

// ---------------------------------------------------------------------------
// Table row types (what you get back from a SELECT)
// ---------------------------------------------------------------------------

export interface Profile {
  id: string;
  display_name: string | null;
  current_chapter_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Chapter {
  id: string;
  chapter_number: number;
  title: string;
  description: string;
  target_vocabulary: string[];
  target_grammar: string[];
  created_at: string;
}

export interface Scenario {
  id: string;
  chapter_id: string;
  scenario_number: number;
  title: string;
  context_description: string;
  agent_role: string;
  target_phrases: string[];
  system_prompt: string;
  created_at: string;
}

export interface UserProgress {
  id: string;
  user_id: string;
  scenario_id: string;
  completed: boolean;
  accuracy_score: number | null;
  vocabulary_used: string[] | null;
  completed_at: string | null;
  created_at: string;
}

export interface ConversationMessage {
  id: string;
  user_id: string;
  scenario_id: string;
  role: "user" | "assistant";
  content: string;
  corrections: Record<string, unknown> | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Insert types (what you send on INSERT - omit server-generated fields)
// ---------------------------------------------------------------------------

export interface ProfileInsert {
  id: string;
  display_name?: string | null;
  current_chapter_id?: string | null;
}

export interface ChapterInsert {
  id?: string;
  chapter_number: number;
  title: string;
  description: string;
  target_vocabulary?: string[];
  target_grammar?: string[];
}

export interface ScenarioInsert {
  id?: string;
  chapter_id: string;
  scenario_number: number;
  title: string;
  context_description: string;
  agent_role: string;
  target_phrases?: string[];
  system_prompt: string;
}

export interface UserProgressInsert {
  id?: string;
  user_id: string;
  scenario_id: string;
  completed?: boolean;
  accuracy_score?: number | null;
  vocabulary_used?: string[] | null;
  completed_at?: string | null;
}

export interface ConversationMessageInsert {
  id?: string;
  user_id: string;
  scenario_id: string;
  role: "user" | "assistant";
  content: string;
  corrections?: Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// Update types (all fields optional except PK is implicit)
// ---------------------------------------------------------------------------

export interface ProfileUpdate {
  display_name?: string | null;
  current_chapter_id?: string | null;
}

export interface ChapterUpdate {
  chapter_number?: number;
  title?: string;
  description?: string;
  target_vocabulary?: string[];
  target_grammar?: string[];
}

export interface ScenarioUpdate {
  chapter_id?: string;
  scenario_number?: number;
  title?: string;
  context_description?: string;
  agent_role?: string;
  target_phrases?: string[];
  system_prompt?: string;
}

export interface UserProgressUpdate {
  completed?: boolean;
  accuracy_score?: number | null;
  vocabulary_used?: string[] | null;
  completed_at?: string | null;
}

export interface ConversationMessageUpdate {
  content?: string;
  corrections?: Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// Supabase-compatible Database type
// ---------------------------------------------------------------------------

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: ProfileInsert;
        Update: ProfileUpdate;
      };
      chapters: {
        Row: Chapter;
        Insert: ChapterInsert;
        Update: ChapterUpdate;
      };
      scenarios: {
        Row: Scenario;
        Insert: ScenarioInsert;
        Update: ScenarioUpdate;
      };
      user_progress: {
        Row: UserProgress;
        Insert: UserProgressInsert;
        Update: UserProgressUpdate;
      };
      conversation_messages: {
        Row: ConversationMessage;
        Insert: ConversationMessageInsert;
        Update: ConversationMessageUpdate;
      };
    };
  };
}
