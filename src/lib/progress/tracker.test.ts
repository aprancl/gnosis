import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock Supabase client
// ---------------------------------------------------------------------------

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import {
  getUserProgress,
  getChapterProgress,
  getOverallStats,
  updateStreak,
} from "./tracker";

const mockedCreateClient = vi.mocked(createClient);

beforeEach(() => {
  vi.clearAllMocks();
  // Reset the date mock if set
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Helper: chainable query builder
// ---------------------------------------------------------------------------

function createChainableQuery(resolvedValue: {
  data: unknown;
  error: unknown;
  count?: number | null;
}) {
  const chain: Record<string, unknown> = {};
  const methods = [
    "from", "select", "insert", "upsert", "update", "delete",
    "eq", "gt", "in", "not", "order", "limit",
  ];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain["single"] = vi.fn().mockResolvedValue(resolvedValue);
  chain["maybeSingle"] = vi.fn().mockResolvedValue(resolvedValue);
  chain["then"] = (resolve: (v: unknown) => void) => resolve(resolvedValue);
  return chain;
}

// ---------------------------------------------------------------------------
// getUserProgress
// ---------------------------------------------------------------------------

describe("getUserProgress", () => {
  it("returns progress records on success", async () => {
    const progressRecords = [
      {
        id: "p-1",
        user_id: "user-1",
        scenario_id: "sc-1",
        completed: true,
        accuracy_score: 0.9,
        vocabulary_used: ["artos"],
        completed_at: "2025-01-15T00:00:00Z",
        created_at: "2025-01-15T00:00:00Z",
      },
    ];

    const query = createChainableQuery({ data: progressRecords, error: null });
    const client = { from: vi.fn().mockReturnValue(query) };
    mockedCreateClient.mockResolvedValue(client as never);

    const result = await getUserProgress("user-1");
    expect(result).toEqual(progressRecords);
  });

  it("returns empty array on error", async () => {
    const query = createChainableQuery({
      data: null,
      error: { message: "DB error" },
    });
    const client = { from: vi.fn().mockReturnValue(query) };
    mockedCreateClient.mockResolvedValue(client as never);

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
        user_id: "user-1",
        scenario_id: "sc-1",
        completed: true,
        accuracy_score: 0.85,
        vocabulary_used: [],
        completed_at: "2025-01-15T00:00:00Z",
        created_at: "2025-01-15T00:00:00Z",
      },
    ];

    let queryCount = 0;
    const client: Record<string, unknown> = {};
    client["from"] = vi.fn().mockImplementation(() => {
      queryCount++;
      if (queryCount === 1) {
        return createChainableQuery({ data: scenarios, error: null });
      }
      return createChainableQuery({ data: progress, error: null });
    });
    mockedCreateClient.mockResolvedValue(client as never);

    const result = await getChapterProgress("user-1", "ch-1");
    expect(result).toEqual(progress);
  });

  it("returns empty array when chapter has no scenarios", async () => {
    const client = {
      from: vi.fn().mockReturnValue(
        createChainableQuery({ data: [], error: null })
      ),
    };
    mockedCreateClient.mockResolvedValue(client as never);

    const result = await getChapterProgress("user-1", "ch-1");
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// getOverallStats
// ---------------------------------------------------------------------------

describe("getOverallStats", () => {
  it("computes correct stats from progress records", async () => {
    // Fix date to 2025-01-15 so streak calculation is predictable
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-15T12:00:00Z"));

    const progressRecords = [
      {
        id: "p-1",
        user_id: "user-1",
        scenario_id: "sc-1",
        completed: true,
        accuracy_score: 0.8,
        vocabulary_used: ["artos", "agora"],
        completed_at: "2025-01-15T10:00:00Z",
        created_at: "2025-01-14T00:00:00Z",
      },
      {
        id: "p-2",
        user_id: "user-1",
        scenario_id: "sc-2",
        completed: true,
        accuracy_score: 0.9,
        vocabulary_used: ["agora", "chaire"],
        completed_at: "2025-01-14T10:00:00Z",
        created_at: "2025-01-14T00:00:00Z",
      },
    ];

    let queryCount = 0;
    const client: Record<string, unknown> = {};
    client["from"] = vi.fn().mockImplementation(() => {
      queryCount++;
      if (queryCount === 1) {
        // user_progress query
        return createChainableQuery({
          data: progressRecords,
          error: null,
        });
      }
      // scenarios count query
      return createChainableQuery({
        data: null,
        error: null,
        count: 6,
      });
    });
    mockedCreateClient.mockResolvedValue(client as never);

    const stats = await getOverallStats("user-1");

    expect(stats.totalCompleted).toBe(2);
    expect(stats.totalScenarios).toBe(6);
    // Average accuracy: (0.8 + 0.9) / 2 = 0.85
    expect(stats.accuracyAvg).toBeCloseTo(0.85);
    // Unique vocab: artos, agora, chaire = 3
    expect(stats.vocabCount).toBe(3);
    // Streak: activity on Jan 15 and Jan 14 = 2 consecutive days
    expect(stats.streak).toBe(2);

    vi.useRealTimers();
  });

  it("returns zero stats on error", async () => {
    const client: Record<string, unknown> = {};
    let queryCount = 0;
    client["from"] = vi.fn().mockImplementation(() => {
      queryCount++;
      if (queryCount === 1) {
        return createChainableQuery({
          data: null,
          error: { message: "DB error" },
        });
      }
      return createChainableQuery({ data: null, error: null, count: 3 });
    });
    mockedCreateClient.mockResolvedValue(client as never);

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
        user_id: "user-1",
        scenario_id: "sc-1",
        completed: true,
        accuracy_score: null,
        vocabulary_used: null,
        completed_at: "2025-01-15T10:00:00Z",
        created_at: "2025-01-15T00:00:00Z",
      },
    ];

    let queryCount = 0;
    const client: Record<string, unknown> = {};
    client["from"] = vi.fn().mockImplementation(() => {
      queryCount++;
      if (queryCount === 1) {
        return createChainableQuery({ data: progressRecords, error: null });
      }
      return createChainableQuery({ data: null, error: null, count: 3 });
    });
    mockedCreateClient.mockResolvedValue(client as never);

    const stats = await getOverallStats("user-1");
    expect(stats.accuracyAvg).toBeNull();
    expect(stats.vocabCount).toBe(0);

    vi.useRealTimers();
  });
});

// ---------------------------------------------------------------------------
// updateStreak (calls calculateStreak internally)
// ---------------------------------------------------------------------------

describe("updateStreak", () => {
  it("returns streak count for consecutive days", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-15T12:00:00Z"));

    const completedRecords = [
      { completed_at: "2025-01-15T10:00:00Z" },
      { completed_at: "2025-01-14T15:00:00Z" },
      { completed_at: "2025-01-13T08:00:00Z" },
    ];

    const query = createChainableQuery({
      data: completedRecords,
      error: null,
    });
    const client = { from: vi.fn().mockReturnValue(query) };
    mockedCreateClient.mockResolvedValue(client as never);

    const streak = await updateStreak("user-1");
    expect(streak).toBe(3);

    vi.useRealTimers();
  });

  it("returns 0 when no completed records exist", async () => {
    const query = createChainableQuery({ data: [], error: null });
    const client = { from: vi.fn().mockReturnValue(query) };
    mockedCreateClient.mockResolvedValue(client as never);

    const streak = await updateStreak("user-1");
    expect(streak).toBe(0);
  });

  it("returns 0 on error", async () => {
    const query = createChainableQuery({
      data: null,
      error: { message: "DB error" },
    });
    const client = { from: vi.fn().mockReturnValue(query) };
    mockedCreateClient.mockResolvedValue(client as never);

    const streak = await updateStreak("user-1");
    expect(streak).toBe(0);
  });

  it("returns 0 when most recent activity is older than yesterday", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-15T12:00:00Z"));

    const completedRecords = [
      { completed_at: "2025-01-10T10:00:00Z" }, // 5 days ago
    ];

    const query = createChainableQuery({
      data: completedRecords,
      error: null,
    });
    const client = { from: vi.fn().mockReturnValue(query) };
    mockedCreateClient.mockResolvedValue(client as never);

    const streak = await updateStreak("user-1");
    expect(streak).toBe(0);

    vi.useRealTimers();
  });

  it("counts streak starting from yesterday if no activity today", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-15T12:00:00Z"));

    const completedRecords = [
      { completed_at: "2025-01-14T10:00:00Z" }, // yesterday
      { completed_at: "2025-01-13T10:00:00Z" }, // day before
    ];

    const query = createChainableQuery({
      data: completedRecords,
      error: null,
    });
    const client = { from: vi.fn().mockReturnValue(query) };
    mockedCreateClient.mockResolvedValue(client as never);

    const streak = await updateStreak("user-1");
    expect(streak).toBe(2);

    vi.useRealTimers();
  });

  it("breaks streak on gap days", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-15T12:00:00Z"));

    const completedRecords = [
      { completed_at: "2025-01-15T10:00:00Z" }, // today
      { completed_at: "2025-01-14T10:00:00Z" }, // yesterday
      // gap on Jan 13
      { completed_at: "2025-01-12T10:00:00Z" }, // 3 days ago
    ];

    const query = createChainableQuery({
      data: completedRecords,
      error: null,
    });
    const client = { from: vi.fn().mockReturnValue(query) };
    mockedCreateClient.mockResolvedValue(client as never);

    const streak = await updateStreak("user-1");
    expect(streak).toBe(2); // Only today + yesterday

    vi.useRealTimers();
  });
});
