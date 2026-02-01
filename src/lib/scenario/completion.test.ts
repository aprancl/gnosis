import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock Prisma client
// ---------------------------------------------------------------------------

vi.mock("@/server/db", () => ({
  db: {
    userProgress: {
      upsert: vi.fn(),
      count: vi.fn(),
    },
    scenario: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    chapter: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    user: {
      update: vi.fn(),
    },
  },
}));

import { db } from "@/server/db";
import {
  markScenarioComplete,
  checkChapterComplete,
  getNextScenario,
} from "./completion";

const mockedDb = vi.mocked(db);

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// markScenarioComplete
// ---------------------------------------------------------------------------

describe("markScenarioComplete", () => {
  it("returns the updated progress row on success", async () => {
    const progressRow = {
      id: "prog-1",
      userId: "user-1",
      scenarioId: "sc-1",
      completed: true,
      accuracyScore: 0.85,
      vocabularyUsed: ["artos"],
      completedAt: new Date("2025-01-15T00:00:00Z"),
      createdAt: new Date("2025-01-15T00:00:00Z"),
    };

    mockedDb.userProgress.upsert.mockResolvedValue(progressRow as never);

    const result = await markScenarioComplete("user-1", "sc-1", 0.85, ["artos"]);
    expect(result).toEqual(progressRow);
  });

  it("returns null on error", async () => {
    mockedDb.userProgress.upsert.mockRejectedValue(new Error("DB error"));

    const result = await markScenarioComplete("user-1", "sc-1");
    expect(result).toBeNull();
  });

  it("passes optional accuracy and vocabulary through", async () => {
    const progressRow = {
      id: "prog-1",
      userId: "user-1",
      scenarioId: "sc-1",
      completed: true,
      accuracyScore: null,
      vocabularyUsed: null,
      completedAt: new Date("2025-01-15T00:00:00Z"),
      createdAt: new Date("2025-01-15T00:00:00Z"),
    };

    mockedDb.userProgress.upsert.mockResolvedValue(progressRow as never);

    const result = await markScenarioComplete("user-1", "sc-1");
    expect(result).toEqual(progressRow);
  });
});

// ---------------------------------------------------------------------------
// checkChapterComplete
// ---------------------------------------------------------------------------

describe("checkChapterComplete", () => {
  it("returns true when all scenarios have completed progress", async () => {
    mockedDb.scenario.findMany.mockResolvedValue([
      { id: "sc-1" },
      { id: "sc-2" },
    ] as never);
    mockedDb.userProgress.count.mockResolvedValue(2 as never);

    const result = await checkChapterComplete("user-1", "ch-1");
    expect(result).toBe(true);
  });

  it("returns false when some scenarios are not completed", async () => {
    mockedDb.scenario.findMany.mockResolvedValue([
      { id: "sc-1" },
      { id: "sc-2" },
      { id: "sc-3" },
    ] as never);
    mockedDb.userProgress.count.mockResolvedValue(1 as never);

    const result = await checkChapterComplete("user-1", "ch-1");
    expect(result).toBe(false);
  });

  it("returns false when no scenarios exist", async () => {
    mockedDb.scenario.findMany.mockResolvedValue([]);

    const result = await checkChapterComplete("user-1", "ch-1");
    expect(result).toBe(false);
  });

  it("returns false on error", async () => {
    mockedDb.scenario.findMany.mockRejectedValue(new Error("DB error"));

    const result = await checkChapterComplete("user-1", "ch-1");
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getNextScenario
// ---------------------------------------------------------------------------

describe("getNextScenario", () => {
  it("returns the next scenario on success", async () => {
    const nextScenario = {
      id: "sc-2",
      chapterId: "ch-1",
      scenarioNumber: 2,
      title: "At the Market Stall",
      contextDescription: "",
      agentRole: "",
      targetPhrases: [],
      systemPrompt: "",
      createdAt: new Date(),
    };

    mockedDb.scenario.findFirst.mockResolvedValue(nextScenario as never);

    const result = await getNextScenario("ch-1", 1);
    expect(result).toEqual(nextScenario);
  });

  it("returns null when there is no next scenario", async () => {
    mockedDb.scenario.findFirst.mockResolvedValue(null);

    const result = await getNextScenario("ch-1", 3);
    expect(result).toBeNull();
  });

  it("returns null on error", async () => {
    mockedDb.scenario.findFirst.mockRejectedValue(new Error("DB error"));

    const result = await getNextScenario("ch-1", 1);
    expect(result).toBeNull();
  });
});
