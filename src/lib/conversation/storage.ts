/**
 * Conversation history storage and retrieval.
 *
 * Provides functions for persisting conversation messages to the database
 * and retrieving them for display or replay.
 */

import { db } from "@/server/db";
import { Prisma } from "@prisma/client";
import type { ConversationMessage } from "@/types/database";

/**
 * Save a single message to the conversation_messages table.
 */
export async function saveMessage(
  userId: string,
  scenarioId: string,
  role: "user" | "assistant",
  content: string,
  corrections?: Record<string, unknown> | null
): Promise<ConversationMessage | null> {
  try {
    const message = await db.conversationMessage.create({
      data: {
        userId,
        scenarioId,
        role,
        content,
        corrections: corrections
          ? (corrections as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      },
    });
    return message as unknown as ConversationMessage;
  } catch (error) {
    console.error("[conversation/storage] Failed to save message:", error);
    return null;
  }
}

/**
 * Retrieve all messages for a user/scenario pair, ordered chronologically.
 */
export async function getConversationHistory(
  userId: string,
  scenarioId: string
): Promise<ConversationMessage[]> {
  try {
    const messages = await db.conversationMessage.findMany({
      where: { userId, scenarioId },
      orderBy: { createdAt: "asc" },
    });
    return messages as unknown as ConversationMessage[];
  } catch (error) {
    console.error(
      "[conversation/storage] Failed to load conversation history:",
      error
    );
    return [];
  }
}

/**
 * Delete all messages for a user/scenario pair (for scenario replay).
 */
export async function clearConversation(
  userId: string,
  scenarioId: string
): Promise<boolean> {
  try {
    await db.conversationMessage.deleteMany({
      where: { userId, scenarioId },
    });
    return true;
  } catch (error) {
    console.error(
      "[conversation/storage] Failed to clear conversation:",
      error
    );
    return false;
  }
}
