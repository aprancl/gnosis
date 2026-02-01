import { notFound } from "next/navigation";
import { db } from "@/server/db";
import { getOrCreateUser } from "@/server/auth";
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

  const user = await getOrCreateUser();
  if (!user) {
    notFound();
  }

  // Fetch scenario, conversation messages, and user progress in parallel
  const [scenario, messages, progress] = await Promise.all([
    db.scenario.findFirst({
      where: { id: scenarioId, chapterId },
    }),
    db.conversationMessage.findMany({
      where: { userId: user.id, scenarioId },
      orderBy: { createdAt: "asc" },
    }),
    db.userProgress.findFirst({
      where: { userId: user.id, scenarioId },
      select: { accuracyScore: true, vocabularyUsed: true },
    }),
  ]);

  if (!scenario) {
    notFound();
  }

  // Find the next scenario in this chapter
  const nextScenario = await db.scenario.findFirst({
    where: {
      chapterId,
      scenarioNumber: { gt: scenario.scenarioNumber },
    },
    orderBy: { scenarioNumber: "asc" },
    select: { id: true, title: true },
  });

  return (
    <ScenarioReview
      data={{
        scenario: scenario as unknown as Scenario,
        chapterId,
        messages: messages as unknown as ConversationMessage[],
        accuracyScore: progress?.accuracyScore ?? null,
        vocabularyUsed: (progress?.vocabularyUsed as string[] | null) ?? null,
        nextScenarioId: nextScenario?.id ?? null,
        nextScenarioTitle: nextScenario?.title ?? null,
      }}
    />
  );
}
