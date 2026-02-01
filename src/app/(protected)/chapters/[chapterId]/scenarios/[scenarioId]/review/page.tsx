import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ScenarioReview from "@/components/scenario/ScenarioReview";
import type {
  Scenario,
  ConversationMessage,
  UserProgress,
} from "@/types/database";

interface ReviewPageProps {
  params: Promise<{
    chapterId: string;
    scenarioId: string;
  }>;
}

export default async function ReviewPage({ params }: ReviewPageProps) {
  const { chapterId, scenarioId } = await params;
  const supabase = await createClient();

  // Get the authenticated user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    notFound();
  }

  // Fetch scenario, conversation messages, and user progress in parallel
  const [scenarioResult, messagesResult, progressResult, nextScenarioResult] =
    await Promise.all([
      supabase
        .from("scenarios")
        .select("id, chapter_id, scenario_number, title, context_description, agent_role, target_phrases, system_prompt")
        .eq("id", scenarioId)
        .eq("chapter_id", chapterId)
        .single(),
      supabase
        .from("conversation_messages")
        .select("id, role, content, corrections, created_at")
        .eq("user_id", user.id)
        .eq("scenario_id", scenarioId)
        .order("created_at", { ascending: true }),
      supabase
        .from("user_progress")
        .select("accuracy_score, vocabulary_used")
        .eq("user_id", user.id)
        .eq("scenario_id", scenarioId)
        .maybeSingle(),
      // Get the current scenario's number first to find the next one
      supabase
        .from("scenarios")
        .select("scenario_number")
        .eq("id", scenarioId)
        .single(),
    ]);

  if (scenarioResult.error || !scenarioResult.data) {
    notFound();
  }

  const scenario = scenarioResult.data as unknown as Scenario;
  const messages = (messagesResult.data ?? []) as unknown as ConversationMessage[];
  const progress = progressResult.data as unknown as UserProgress | null;

  // Find the next scenario in this chapter
  let nextScenarioId: string | null = null;
  let nextScenarioTitle: string | null = null;

  if (nextScenarioResult.data) {
    const currentNumber = nextScenarioResult.data.scenario_number;
    const { data: nextScenario } = await supabase
      .from("scenarios")
      .select("id, title")
      .eq("chapter_id", chapterId)
      .gt("scenario_number", currentNumber)
      .order("scenario_number", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (nextScenario) {
      nextScenarioId = nextScenario.id;
      nextScenarioTitle = nextScenario.title;
    }
  }

  return (
    <ScenarioReview
      data={{
        scenario,
        chapterId,
        messages,
        accuracyScore: progress?.accuracy_score ?? null,
        vocabularyUsed: progress?.vocabulary_used ?? null,
        nextScenarioId,
        nextScenarioTitle,
      }}
    />
  );
}
