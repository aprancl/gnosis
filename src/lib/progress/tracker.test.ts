import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock Prisma client
// ---------------------------------------------------------------------------

vi.mock("@/server/db", () => ({
  db: {
    userProgress: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    scenario: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

import { db } from "@/server/db";
import {
  getUserProgress,
  getChapterProgress,
  getOverallStats,
  updateStreak,
} from "./tracker";

const mockedDb = vi.mocked(db);

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// getUserProgress
// ---------------------------------------------------------------------------

describe("getUserProgress", () => {
  it("returns progress records on success", async () => {
    const progressRecords = [
      {
        id: "p-1",
        userId: "user-1",
        scenarioId: "sc-1",
        completed: true,
        accuracyScore: 0.9,
        vocabularyUsed: ["artos"],
        completedAt: new Date("2025-01-15T00:00:00Z"),
        createdAt: new Date("2025-01-15T00:00:00Z"),
      },
    ];

    mockedDb.userProgress.findMany.mockResolvedValue(progressRecords as never);

    const result = await getUserProgress("user-1");
    expect(result).toEqual(progressRecords);
  });

  it("returns empty array on error", async () => {
    mockedDb.userProgress.findMany.mockRejectedValue(new Error("DB error"));

    const result = await getUserProgress("user-1");
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getChapterProgress
// ---------------------------------------------------------------------------

describe("getChapterProgress", () => {
  it("returns progress for a chapter's scenarios", async () => {
    const scenarios = [{ id: "sc-1" }, { id: "sc-2" }];
    const progress = [
      {
        id: "p-1",
        userId: "user-1",
        scenarioId: "sc-1",
        completed: true,
        accuracyScore: 0.85,
        vocabularyUsed: [],
        completedAt: new Date("2025-01-15T00:00:00Z"),
        createdAt: new Date("2025-01-15T00:00:00Z"),
      },
    ];

    mockedDb.scenario.findMany.mockResolvedValue(scenarios as never);
    mockedDb.userProgress.findMany.mockResolvedValue(progress as never);

    const result = await getChapterProgress("user-1", "ch-1");
    expect(result).toEqual(progress);
  });

  it("returns empty array when chapter has no scenarios", async () => {
    mockedDb.scenario.findMany.mockResolvedValue([]);

    const result = await getChapterProgress("user-1", "ch-1");
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getOverallStats
// ---------------------------------------------------------------------------

describe("getOverallStats", () => {
  it("computes correct stats from progress records", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-15T12:00:00Z"));

    const progressRecords = [
      {
        id: "p-1",
        userId: "user-1",
        scenarioId: "sc-1",
        completed: true,
        accuracyScore: 0.8,
        vocabularyUsed: ["artos", "agora"],
        completedAt: new Date("2025-01-15T10:00:00Z"),
        createdAt: new Date("2025-01-14T00:00:00Z"),
      },
      {
        id: "p-2",
        userId: "user-1",
        scenarioId: "sc-2",
        completed: true,
        accuracyScore: 0.9,
        vocabularyUsed: ["agora", "chaire"],
        completedAt: new Date("2025-01-14T10:00:00Z"),
        createdAt: new Date("2025-01-14T00:00:00Z"),
      },
    ];

    mockedDb.userProgress.findMany.mockResolvedValue(progressRecords as never);
    mockedDb.scenario.count.mockResolvedValue(6 as never);

    const stats = await getOverallStats("user-1");

    expect(stats.totalCompleted).toBe(2);
    expect(stats.totalScenarios).toBe(6);
    expect(stats.accuracyAvg).toBeCloseTo(0.85);
    expect(stats.vocabCount).toBe(3);
    expect(stats.streak).toBe(2);

    vi.useRealTimers();
  });

  it("returns zero stats on error", async () => {
    mockedDb.userProgress.findMany.mockRejectedValue(new Error("DB error"));
    mockedDb.scenario.count.mockResolvedValue(3 as never);

    const stats = await getOverallStats("user-1");
    expect(stats.totalCompleted).toBe(0);
    expect(stats.accuracyAvg).toBeNull();
    expect(stats.vocabCount).toBe(0);
    expect(stats.streak).toBe(0);
  });

  it("returns null accuracy when no scored records exist", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-15T12:00:00Z"));

    const progressRecords = [
      {
        id: "p-1",
        userId: "user-1",
        scenarioId: "sc-1",
        completed: true,
        accuracyScore: null,
        vocabularyUsed: null,
        completedAt: new Date("2025-01-15T10:00:00Z"),
        createdAt: new Date("2025-01-15T00:00:00Z"),
      },
    ];

    mockedDb.userProgress.findMany.mockResolvedValue(progressRecords as never);
    mockedDb.scenario.count.mockResolvedValue(3 as never);

    const stats = await getOverallStats("user-1");
    expect(stats.accuracyAvg).toBeNull();
    expect(stats.vocabCount).toBe(0);

    vi.useRealTimers();
  });
});

// ---------------------------------------------------------------------------
// updateStreak
// ---------------------------------------------------------------------------

describe("updateStreak", () => {
  it("returns streak count for consecutive days", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-15T12:00:00Z"));

    const completedRecords = [
      { completedAt: new Date("2025-01-15T10:00:00Z") },
      { completedAt: new Date("2025-01-14T15:00:00Z") },
      { completedAt: new Date("2025-01-13T08:00:00Z") },
    ];

    mockedDb.userProgress.findMany.mockResolvedValue(completedRecords as never);

    const streak = await updateStreak("user-1");
    expect(streak).toBe(3);

    vi.useRealTimers();
  });

  it("returns 0 when no completed records exist", async () => {
    mockedDb.userProgress.findMany.mockResolvedValue([]);

    const streak = await updateStreak("user-1");
    expect(streak).toBe(0);
  });

  it("returns 0 when most recent activity is older than yesterday", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-15T12:00:00Z"));

    mockedDb.userProgress.findMany.mockResolvedValue([
      { completedAt: new Date("2025-01-10T10:00:00Z") },
    ] as never);

    const streak = await updateStreak("user-1");
    expect(streak).toBe(0);

    vi.useRealTimers();
  });

  it("counts streak starting from yesterday if no activity today", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-15T12:00:00Z"));

    mockedDb.userProgress.findMany.mockResolvedValue([
      { completedAt: new Date("2025-01-14T10:00:00Z") },
      { completedAt: new Date("2025-01-13T10:00:00Z") },
    ] as never);

    const streak = await updateStreak("user-1");
    expect(streak).toBe(2);

    vi.useRealTimers();
  });

  it("breaks streak on gap days", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-15T12:00:00Z"));

    mockedDb.userProgress.findMany.mockResolvedValue([
      { completedAt: new Date("2025-01-15T10:00:00Z") },
      { completedAt: new Date("2025-01-14T10:00:00Z") },
      { completedAt: new Date("2025-01-12T10:00:00Z") },
    ] as never);

    const streak = await updateStreak("user-1");
    expect(streak).toBe(2);

    vi.useRealTimers();
  });
});
