/**
 * Progress tracking and querying functions.
 *
 * Provides functions to retrieve and aggregate user progress data
 * from the database via Prisma.
 */

import { db } from "@/server/db";
import type { UserProgress } from "@/types/database";

/**
 * Aggregate stats for a user's overall progress.
 */
export interface OverallStats {
  totalCompleted: number;
  totalScenarios: number;
  accuracyAvg: number | null;
  vocabCount: number;
  streak: number;
}

/**
 * Get all progress records for a user.
 */
export async function getUserProgress(
  userId: string
): Promise<UserProgress[]> {
  try {
    const progress = await db.userProgress.findMany({
      where: { userId },
      orderBy: { completedAt: "desc" },
    });
    return progress as unknown as UserProgress[];
  } catch (error) {
    console.error(
      "[progress/tracker] Failed to get user progress:",
      error
    );
    return [];
  }
}

/**
 * Get progress for all scenarios in a specific chapter.
 */
export async function getChapterProgress(
  userId: string,
  chapterId: string
): Promise<UserProgress[]> {
  try {
    const scenarios = await db.scenario.findMany({
      where: { chapterId },
      select: { id: true },
    });

    if (scenarios.length === 0) return [];

    const scenarioIds = scenarios.map((s) => s.id);

    const progress = await db.userProgress.findMany({
      where: {
        userId,
        scenarioId: { in: scenarioIds },
      },
    });

    return progress as unknown as UserProgress[];
  } catch (error) {
    console.error(
      "[progress/tracker] Failed to get chapter progress:",
      error
    );
    return [];
  }
}

/**
 * Get aggregate stats for a user.
 */
export async function getOverallStats(
  userId: string
): Promise<OverallStats> {
  try {
    const [allProgress, totalScenarios] = await Promise.all([
      db.userProgress.findMany({
        where: { userId },
      }),
      db.scenario.count(),
    ]);

    const completed = allProgress.filter((p) => p.completed);
    const totalCompleted = completed.length;

    // Calculate average accuracy
    const withAccuracy = completed.filter((p) => p.accuracyScore !== null);
    const accuracyAvg =
      withAccuracy.length > 0
        ? withAccuracy.reduce((sum, p) => sum + (p.accuracyScore ?? 0), 0) /
          withAccuracy.length
        : null;

    // Count unique vocabulary words
    const vocabSet = new Set<string>();
    for (const p of allProgress) {
      const vocab = p.vocabularyUsed as string[] | null;
      if (vocab) {
        for (const word of vocab) {
          vocabSet.add(word);
        }
      }
    }
    const vocabCount = vocabSet.size;

    // Calculate streak
    const streak = calculateStreak(
      completed.map((p) => ({
        completed: p.completed,
        completedAt: p.completedAt,
      }))
    );

    return {
      totalCompleted,
      totalScenarios,
      accuracyAvg,
      vocabCount,
      streak,
    };
  } catch (error) {
    console.error(
      "[progress/tracker] Failed to get overall stats:",
      error
    );
    return {
      totalCompleted: 0,
      totalScenarios: 0,
      accuracyAvg: null,
      vocabCount: 0,
      streak: 0,
    };
  }
}

/**
 * Calculate and return the current streak based on completedAt dates.
 */
export async function updateStreak(userId: string): Promise<number> {
  try {
    const data = await db.userProgress.findMany({
      where: {
        userId,
        completed: true,
        completedAt: { not: null },
      },
      select: { completedAt: true },
      orderBy: { completedAt: "desc" },
    });

    if (data.length === 0) return 0;

    return calculateStreak(
      data.map((r) => ({
        completed: true,
        completedAt: r.completedAt,
      }))
    );
  } catch {
    return 0;
  }
}

/**
 * Internal helper to calculate streak from completed progress records.
 */
function calculateStreak(
  completed: Array<{ completed: boolean; completedAt: Date | null }>
): number {
  const withDates = completed.filter(
    (p): p is { completed: boolean; completedAt: Date } =>
      p.completedAt !== null
  );

  if (withDates.length === 0) return 0;

  // Get unique dates (UTC calendar days), sorted descending
  const uniqueDates = [
    ...new Set(
      withDates.map((p) => {
        const d = new Date(p.completedAt);
        return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
      })
    ),
  ].sort((a, b) => b.localeCompare(a));

  const today = new Date();
  const todayStr = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}-${String(today.getUTCDate()).padStart(2, "0")}`;

  const yesterday = new Date(today);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayStr = `${yesterday.getUTCFullYear()}-${String(yesterday.getUTCMonth() + 1).padStart(2, "0")}-${String(yesterday.getUTCDate()).padStart(2, "0")}`;

  if (uniqueDates[0] !== todayStr && uniqueDates[0] !== yesterdayStr) {
    return 0;
  }

  let streak = 1;
  for (let i = 1; i < uniqueDates.length; i++) {
    const prevDate = new Date(uniqueDates[i - 1] + "T00:00:00Z");
    const currDate = new Date(uniqueDates[i] + "T00:00:00Z");
    const diffMs = prevDate.getTime() - currDate.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    if (diffDays === 1) {
      streak++;
    } else {
      break;
    }
  }

  return streak;
}
