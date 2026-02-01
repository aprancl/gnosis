/**
 * Conversation history storage and retrieval.
 *
 * Provides functions for persisting conversation messages to the Supabase
 * conversation_messages table and retrieving them for display or replay.
 */

import { createClient } from "@/lib/supabase/server";
import type {
  ConversationMessage,
  ConversationMessageInsert,
} from "@/types/database";

/**
 * Save a single message to the conversation_messages table.
 *
 * @param userId - The authenticated user's UUID
 * @param scenarioId - The scenario UUID this message belongs to
 * @param role - "user" or "assistant"
 * @param content - The message text
 * @param corrections - Optional corrections data (for assistant feedback)
 * @returns The saved message row, or null on error
 */
export async function saveMessage(
  userId: string,
  scenarioId: string,
  role: "user" | "assistant",
  content: string,
  corrections?: Record<string, unknown> | null
): Promise<ConversationMessage | null> {
  const supabase = await createClient();

  const insert: ConversationMessageInsert = {
    user_id: userId,
    scenario_id: scenarioId,
    role,
    content,
    corrections: corrections ?? null,
  };

  const { data, error } = await supabase
    .from("conversation_messages")
    .insert(insert)
    .select()
    .single();

  if (error) {
    console.error("[conversation/storage] Failed to save message:", error.message);
    return null;
  }

  return data as unknown as ConversationMessage;
}

/**
 * Retrieve all messages for a user/scenario pair, ordered by created_at ascending.
 *
 * @param userId - The authenticated user's UUID
 * @param scenarioId - The scenario UUID
 * @returns Array of conversation messages ordered chronologically, or empty array on error
 */
export async function getConversationHistory(
  userId: string,
  scenarioId: string
): Promise<ConversationMessage[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("conversation_messages")
    .select("id, role, content, corrections, created_at")
    .eq("user_id", userId)
    .eq("scenario_id", scenarioId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error(
      "[conversation/storage] Failed to load conversation history:",
      error.message
    );
    return [];
  }

  return (data ?? []) as unknown as ConversationMessage[];
}

/**
 * Delete all messages for a user/scenario pair (for scenario replay).
 *
 * @param userId - The authenticated user's UUID
 * @param scenarioId - The scenario UUID
 * @returns True if deletion succeeded (or no rows to delete), false on error
 */
export async function clearConversation(
  userId: string,
  scenarioId: string
): Promise<boolean> {
  const supabase = await createClient();

  const { error } = await supabase
    .from("conversation_messages")
    .delete()
    .eq("user_id", userId)
    .eq("scenario_id", scenarioId);

  if (error) {
    console.error(
      "[conversation/storage] Failed to clear conversation:",
      error.message
    );
    return false;
  }

  return true;
}
