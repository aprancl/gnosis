/**
 * Scenario completion detection and progression logic.
 *
 * Handles marking scenarios as complete, checking chapter completion,
 * finding the next scenario, and advancing user progress through chapters.
 */

import { db } from "@/server/db";
import { Prisma } from "@prisma/client";
import type { Scenario, UserProgress } from "@/types/database";

/**
 * Mark a scenario as completed for a user.
 *
 * Uses upsert to handle both first-time completion and re-completion.
 */
export async function markScenarioComplete(
  userId: string,
  scenarioId: string,
  accuracyScore?: number,
  vocabularyUsed?: string[]
): Promise<UserProgress | null> {
  try {
    const progress = await db.userProgress.upsert({
      where: {
        userId_scenarioId: { userId, scenarioId },
      },
      update: {
        completed: true,
        completedAt: new Date(),
        accuracyScore: accuracyScore ?? null,
        vocabularyUsed: vocabularyUsed
          ? (vocabularyUsed as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      },
      create: {
        userId,
        scenarioId,
        completed: true,
        completedAt: new Date(),
        accuracyScore: accuracyScore ?? null,
        vocabularyUsed: vocabularyUsed
          ? (vocabularyUsed as unknown as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      },
    });
    return progress as unknown as UserProgress;
  } catch (error) {
    console.error(
      "[scenario/completion] Failed to mark scenario complete:",
      error
    );
    return null;
  }
}

/**
 * Check if all scenarios in a chapter have been completed by a user.
 */
export async function checkChapterComplete(
  userId: string,
  chapterId: string
): Promise<boolean> {
  try {
    const scenarios = await db.scenario.findMany({
      where: { chapterId },
      select: { id: true },
    });

    if (scenarios.length === 0) return false;

    const scenarioIds = scenarios.map((s) => s.id);

    const completedCount = await db.userProgress.count({
      where: {
        userId,
        completed: true,
        scenarioId: { in: scenarioIds },
      },
    });

    return completedCount === scenarioIds.length;
  } catch (error) {
    console.error(
      "[scenario/completion] Failed to check chapter completion:",
      error
    );
    return false;
  }
}

/**
 * Get the next scenario in a chapter after the given scenario number.
 */
export async function getNextScenario(
  chapterId: string,
  currentScenarioNumber: number
): Promise<Scenario | null> {
  try {
    const scenario = await db.scenario.findFirst({
      where: {
        chapterId,
        scenarioNumber: { gt: currentScenarioNumber },
      },
      orderBy: { scenarioNumber: "asc" },
    });
    return scenario ? (scenario as unknown as Scenario) : null;
  } catch (error) {
    console.error(
      "[scenario/completion] Failed to get next scenario:",
      error
    );
    return null;
  }
}

/**
 * Advance the user's currentChapterId to the next chapter if the current
 * chapter is fully complete.
 */
export async function advanceUserProgress(
  userId: string,
  chapterId: string
): Promise<string | null> {
  try {
    const isComplete = await checkChapterComplete(userId, chapterId);
    if (!isComplete) return null;

    const currentChapter = await db.chapter.findUnique({
      where: { id: chapterId },
      select: { chapterNumber: true },
    });

    if (!currentChapter) return null;

    const nextChapter = await db.chapter.findFirst({
      where: {
        chapterNumber: { gt: currentChapter.chapterNumber },
      },
      orderBy: { chapterNumber: "asc" },
      select: { id: true },
    });

    if (!nextChapter) return null;

    await db.user.update({
      where: { id: userId },
      data: { currentChapterId: nextChapter.id },
    });

    return nextChapter.id;
  } catch (error) {
    console.error(
      "[scenario/completion] Failed to advance user progress:",
      error
    );
    return null;
  }
}
