/**
 * Progress tracking and querying functions.
 *
 * Provides functions to retrieve and aggregate user progress data
 * from the user_progress table in Supabase.
 */

import { createClient } from "@/lib/supabase/server";
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
 *
 * @param userId - The authenticated user's UUID
 * @returns Array of user progress records, or empty array on error
 */
export async function getUserProgress(
  userId: string
): Promise<UserProgress[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("user_progress")
    .select("id, user_id, scenario_id, completed, accuracy_score, vocabulary_used, completed_at, created_at")
    .eq("user_id", userId)
    .order("completed_at", { ascending: false });

  if (error) {
    console.error(
      "[progress/tracker] Failed to get user progress:",
      error.message
    );
    return [];
  }

  return (data ?? []) as unknown as UserProgress[];
}

/**
 * Get progress for all scenarios in a specific chapter.
 *
 * Joins user_progress with scenarios to filter by chapter_id.
 *
 * @param userId - The authenticated user's UUID
 * @param chapterId - The chapter UUID to filter by
 * @returns Array of user progress records for the chapter's scenarios
 */
export async function getChapterProgress(
  userId: string,
  chapterId: string
): Promise<UserProgress[]> {
  const supabase = await createClient();

  // First get all scenario IDs for this chapter
  const { data: scenarios, error: scenarioError } = await supabase
    .from("scenarios")
    .select("id")
    .eq("chapter_id", chapterId);

  if (scenarioError || !scenarios || scenarios.length === 0) {
    return [];
  }

  const scenarioIds = scenarios.map((s) => s.id);

  const { data: progress, error: progressError } = await supabase
    .from("user_progress")
    .select("*")
    .eq("user_id", userId)
    .in("scenario_id", scenarioIds);

  if (progressError) {
    console.error(
      "[progress/tracker] Failed to get chapter progress:",
      progressError.message
    );
    return [];
  }

  return (progress ?? []) as unknown as UserProgress[];
}

/**
 * Get aggregate stats for a user.
 *
 * Returns total completed scenarios, overall accuracy average,
 * unique vocabulary count, and current streak.
 *
 * @param userId - The authenticated user's UUID
 * @returns Aggregate stats object
 */
export async function getOverallStats(
  userId: string
): Promise<OverallStats> {
  const supabase = await createClient();

  // Fetch all user progress records (select only needed columns)
  const { data: allProgress, error: progressError } = await supabase
    .from("user_progress")
    .select("completed, accuracy_score, vocabulary_used, completed_at")
    .eq("user_id", userId);

  // Fetch total scenario count (head-only query for efficiency)
  const { count: totalScenarios } = await supabase
    .from("scenarios")
    .select("id", { count: "exact", head: true });

  if (progressError) {
    console.error(
      "[progress/tracker] Failed to get overall stats:",
      progressError.message
    );
    return {
      totalCompleted: 0,
      totalScenarios: totalScenarios ?? 0,
      accuracyAvg: null,
      vocabCount: 0,
      streak: 0,
    };
  }

  const progress = (allProgress ?? []) as unknown as UserProgress[];

  // Count completed scenarios
  const completed = progress.filter((p) => p.completed);
  const totalCompleted = completed.length;

  // Calculate average accuracy (only from records with a score)
  const withAccuracy = completed.filter((p) => p.accuracy_score !== null);
  const accuracyAvg =
    withAccuracy.length > 0
      ? withAccuracy.reduce((sum, p) => sum + (p.accuracy_score ?? 0), 0) /
        withAccuracy.length
      : null;

  // Count unique vocabulary words across all progress records
  const vocabSet = new Set<string>();
  for (const p of progress) {
    if (p.vocabulary_used) {
      for (const word of p.vocabulary_used) {
        vocabSet.add(word);
      }
    }
  }
  const vocabCount = vocabSet.size;

  // Calculate streak
  const streak = calculateStreak(completed);

  return {
    totalCompleted,
    totalScenarios: totalScenarios ?? 0,
    accuracyAvg,
    vocabCount,
    streak,
  };
}

/**
 * Calculate and return the current streak based on completed_at dates.
 *
 * A streak is defined as consecutive calendar days (in UTC) with at least
 * one scenario completed. Today counts as the first day if there is
 * activity today; otherwise the streak is 0.
 *
 * @param userId - The authenticated user's UUID
 * @returns Current streak in days
 */
export async function updateStreak(userId: string): Promise<number> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("user_progress")
    .select("completed_at")
    .eq("user_id", userId)
    .eq("completed", true)
    .not("completed_at", "is", null)
    .order("completed_at", { ascending: false });

  if (error || !data || data.length === 0) {
    return 0;
  }

  const completedRecords = data as unknown as Array<{
    completed_at: string;
  }>;

  return calculateStreak(
    completedRecords.map((r) => ({
      completed_at: r.completed_at,
      completed: true,
    })) as Array<{ completed: boolean; completed_at: string | null }>
  );
}

/**
 * Internal helper to calculate streak from completed progress records.
 *
 * @param completed - Array of completed progress records (must have completed_at)
 * @returns Streak count in consecutive calendar days
 */
function calculateStreak(
  completed: Array<{ completed: boolean; completed_at: string | null }>
): number {
  // Filter to records with completion dates
  const withDates = completed.filter(
    (p): p is { completed: boolean; completed_at: string } =>
      p.completed_at !== null
  );

  if (withDates.length === 0) return 0;

  // Get unique dates (UTC calendar days), sorted descending
  const uniqueDates = [
    ...new Set(
      withDates.map((p) => {
        const d = new Date(p.completed_at);
        return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
      })
    ),
  ].sort((a, b) => b.localeCompare(a));

  // Check if the most recent activity is today or yesterday
  const today = new Date();
  const todayStr = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}-${String(today.getUTCDate()).padStart(2, "0")}`;

  const yesterday = new Date(today);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const yesterdayStr = `${yesterday.getUTCFullYear()}-${String(yesterday.getUTCMonth() + 1).padStart(2, "0")}-${String(yesterday.getUTCDate()).padStart(2, "0")}`;

  // If the most recent day is neither today nor yesterday, streak is 0
  if (uniqueDates[0] !== todayStr && uniqueDates[0] !== yesterdayStr) {
    return 0;
  }

  // Count consecutive days backwards from the most recent
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
