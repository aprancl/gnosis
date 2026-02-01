/**
 * Scenario completion detection and progression logic.
 *
 * Handles marking scenarios as complete, checking chapter completion,
 * finding the next scenario, and advancing user progress through chapters.
 */

import { createClient } from "@/lib/supabase/server";
import type {
  Scenario,
  UserProgress,
  UserProgressInsert,
} from "@/types/database";

/**
 * Mark a scenario as completed for a user.
 *
 * Uses upsert to handle both first-time completion and re-completion.
 * Sets completed = true, completed_at to now, and optionally records
 * accuracy_score and vocabulary_used.
 *
 * @param userId - The authenticated user's UUID
 * @param scenarioId - The completed scenario's UUID
 * @param accuracyScore - Optional accuracy score (0-1)
 * @param vocabularyUsed - Optional array of vocabulary words used during the scenario
 * @returns The updated user_progress row, or null on error
 */
export async function markScenarioComplete(
  userId: string,
  scenarioId: string,
  accuracyScore?: number,
  vocabularyUsed?: string[]
): Promise<UserProgress | null> {
  const supabase = await createClient();

  const upsertData: UserProgressInsert = {
    user_id: userId,
    scenario_id: scenarioId,
    completed: true,
    completed_at: new Date().toISOString(),
    accuracy_score: accuracyScore ?? null,
    vocabulary_used: vocabularyUsed ?? null,
  };

  const { data, error } = await supabase
    .from("user_progress")
    .upsert(upsertData, { onConflict: "user_id,scenario_id" })
    .select()
    .single();

  if (error) {
    console.error(
      "[scenario/completion] Failed to mark scenario complete:",
      error.message
    );
    return null;
  }

  return data as unknown as UserProgress;
}

/**
 * Check if all scenarios in a chapter have been completed by a user.
 *
 * @param userId - The authenticated user's UUID
 * @param chapterId - The chapter UUID to check
 * @returns True if every scenario in the chapter has a completed user_progress row
 */
export async function checkChapterComplete(
  userId: string,
  chapterId: string
): Promise<boolean> {
  const supabase = await createClient();

  // Get all scenarios in this chapter
  const { data: scenarios, error: scenarioError } = await supabase
    .from("scenarios")
    .select("id")
    .eq("chapter_id", chapterId);

  if (scenarioError || !scenarios || scenarios.length === 0) {
    return false;
  }

  const scenarioIds = scenarios.map((s) => s.id);

  // Get completed progress for this user in these scenarios
  const { data: progress, error: progressError } = await supabase
    .from("user_progress")
    .select("scenario_id")
    .eq("user_id", userId)
    .eq("completed", true)
    .in("scenario_id", scenarioIds);

  if (progressError) {
    console.error(
      "[scenario/completion] Failed to check chapter completion:",
      progressError.message
    );
    return false;
  }

  const completedIds = new Set((progress ?? []).map((p) => p.scenario_id));
  return scenarioIds.every((id) => completedIds.has(id));
}

/**
 * Get the next scenario in a chapter after the given scenario number.
 *
 * @param chapterId - The chapter UUID
 * @param currentScenarioNumber - The just-completed scenario's number
 * @returns The next scenario, or null if the current one was the last
 */
export async function getNextScenario(
  chapterId: string,
  currentScenarioNumber: number
): Promise<Scenario | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("scenarios")
    .select("id, chapter_id, scenario_number, title")
    .eq("chapter_id", chapterId)
    .gt("scenario_number", currentScenarioNumber)
    .order("scenario_number", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error(
      "[scenario/completion] Failed to get next scenario:",
      error.message
    );
    return null;
  }

  return data ? (data as unknown as Scenario) : null;
}

/**
 * Advance the user's current_chapter_id to the next chapter if the current
 * chapter is fully complete.
 *
 * @param userId - The authenticated user's UUID
 * @param chapterId - The chapter that was just completed
 * @returns The next chapter ID if advanced, null if no next chapter or not complete
 */
export async function advanceUserProgress(
  userId: string,
  chapterId: string
): Promise<string | null> {
  const supabase = await createClient();

  // First verify the chapter is actually complete
  const isComplete = await checkChapterComplete(userId, chapterId);
  if (!isComplete) {
    return null;
  }

  // Find the current chapter's number
  const { data: currentChapter, error: chapterError } = await supabase
    .from("chapters")
    .select("chapter_number")
    .eq("id", chapterId)
    .single();

  if (chapterError || !currentChapter) {
    return null;
  }

  // Find the next chapter by chapter_number
  const { data: nextChapter, error: nextError } = await supabase
    .from("chapters")
    .select("id")
    .gt("chapter_number", currentChapter.chapter_number)
    .order("chapter_number", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (nextError || !nextChapter) {
    // No next chapter - user has completed all chapters, or error
    return null;
  }

  // Update the user's current_chapter_id
  const { error: updateError } = await supabase
    .from("profiles")
    .update({ current_chapter_id: nextChapter.id })
    .eq("id", userId);

  if (updateError) {
    console.error(
      "[scenario/completion] Failed to advance user progress:",
      updateError.message
    );
    return null;
  }

  return nextChapter.id;
}
