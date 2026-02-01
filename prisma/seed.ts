import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Inline the chapter IDs to avoid path alias issues in seed script
const CHAPTER_1_ID = "00000000-0000-0000-0000-000000000001";
const CHAPTER_2_ID = "00000000-0000-0000-0000-000000000002";
const CHAPTER_3_ID = "00000000-0000-0000-0000-000000000003";
const CHAPTER_4_ID = "00000000-0000-0000-0000-000000000004";
const CHAPTER_5_ID = "00000000-0000-0000-0000-000000000005";
const CHAPTER_6_ID = "00000000-0000-0000-0000-000000000006";
const CHAPTER_7_ID = "00000000-0000-0000-0000-000000000007";

async function main() {
  console.log("Seeding database...");

  // Import seed data (uses path alias, so we import dynamically)
  // We'll inline the data import using a relative path
  const { seedChapters, seedScenarios } = await import(
    "../src/lib/data/seed-scenarios"
  );

  // Upsert chapters
  for (const chapter of seedChapters) {
    await prisma.chapter.upsert({
      where: { id: chapter.id ?? undefined, chapterNumber: chapter.chapterNumber },
      update: {
        title: chapter.title,
        description: chapter.description,
        targetVocabulary: chapter.targetVocabulary,
        targetGrammar: chapter.targetGrammar,
      },
      create: {
        id: chapter.id,
        chapterNumber: chapter.chapterNumber,
        title: chapter.title,
        description: chapter.description,
        targetVocabulary: chapter.targetVocabulary,
        targetGrammar: chapter.targetGrammar,
      },
    });
  }

  console.log(`Seeded ${seedChapters.length} chapters`);

  // Upsert scenarios
  for (const scenario of seedScenarios) {
    await prisma.scenario.upsert({
      where: {
        chapterId_scenarioNumber: {
          chapterId: scenario.chapterId,
          scenarioNumber: scenario.scenarioNumber,
        },
      },
      update: {
        title: scenario.title,
        contextDescription: scenario.contextDescription,
        agentRole: scenario.agentRole,
        targetPhrases: scenario.targetPhrases,
        systemPrompt: scenario.systemPrompt,
      },
      create: {
        chapterId: scenario.chapterId,
        scenarioNumber: scenario.scenarioNumber,
        title: scenario.title,
        contextDescription: scenario.contextDescription,
        agentRole: scenario.agentRole,
        targetPhrases: scenario.targetPhrases,
        systemPrompt: scenario.systemPrompt,
      },
    });
  }

  console.log(`Seeded ${seedScenarios.length} scenarios`);
  console.log("Seeding complete!");
}

main()
  .catch((e) => {
    console.error("Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
