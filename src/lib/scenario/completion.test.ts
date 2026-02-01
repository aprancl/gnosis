import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock Supabase client
// ---------------------------------------------------------------------------

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import {
  markScenarioComplete,
  checkChapterComplete,
  getNextScenario,
  advanceUserProgress,
} from "./completion";

const mockedCreateClient = vi.mocked(createClient);

/**
 * Create a mock Supabase client whose .from() returns a chainable query builder.
 * The client itself must NOT have a `then` method, otherwise `await createClient()`
 * would unwrap it as a thenable instead of returning the mock object.
 */
function createMockClient(resolvedValue: { data: unknown; error: unknown }) {
  const chain = createChainableQuery(resolvedValue);
  const client: Record<string, unknown> = {};
  client["from"] = vi.fn().mockReturnValue(chain);
  return client;
}

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
      user_id: "user-1",
      scenario_id: "sc-1",
      completed: true,
      accuracy_score: 0.85,
      vocabulary_used: ["artos"],
      completed_at: "2025-01-15T00:00:00Z",
      created_at: "2025-01-15T00:00:00Z",
    };

    const mockClient = createMockClient({ data: progressRow, error: null });
    mockedCreateClient.mockResolvedValue(mockClient as never);

    const result = await markScenarioComplete("user-1", "sc-1", 0.85, [
      "artos",
    ]);
    expect(result).toEqual(progressRow);
  });

  it("returns null on Supabase error", async () => {
    const mockClient = createMockClient({
      data: null,
      error: { message: "DB error" },
    });
    mockedCreateClient.mockResolvedValue(mockClient as never);

    const result = await markScenarioComplete("user-1", "sc-1");
    expect(result).toBeNull();
  });

  it("passes optional accuracy and vocabulary through", async () => {
    const progressRow = {
      id: "prog-1",
      user_id: "user-1",
      scenario_id: "sc-1",
      completed: true,
      accuracy_score: null,
      vocabulary_used: null,
      completed_at: "2025-01-15T00:00:00Z",
      created_at: "2025-01-15T00:00:00Z",
    };
    const mockClient = createMockClient({ data: progressRow, error: null });
    mockedCreateClient.mockResolvedValue(mockClient as never);

    const result = await markScenarioComplete("user-1", "sc-1");
    expect(result).toEqual(progressRow);
  });
});

// ---------------------------------------------------------------------------
// checkChapterComplete
// ---------------------------------------------------------------------------

describe("checkChapterComplete", () => {
  it("returns true when all scenarios have completed progress", async () => {
    // Two-step query: first get scenarios, then get completed progress
    const scenarios = [{ id: "sc-1" }, { id: "sc-2" }];
    const progress = [{ scenario_id: "sc-1" }, { scenario_id: "sc-2" }];

    let queryCount = 0;
    const mockClient: Record<string, unknown> = {};
    mockClient["from"] = vi.fn().mockImplementation(() => {
      queryCount++;
      if (queryCount === 1) {
        // First call: scenarios query
        return createChainableQuery({ data: scenarios, error: null });
      }
      // Second call: progress query
      return createChainableQuery({ data: progress, error: null });
    });
    mockedCreateClient.mockResolvedValue(mockClient as never);

    const result = await checkChapterComplete("user-1", "ch-1");
    expect(result).toBe(true);
  });

  it("returns false when some scenarios are not completed", async () => {
    const scenarios = [{ id: "sc-1" }, { id: "sc-2" }, { id: "sc-3" }];
    const progress = [{ scenario_id: "sc-1" }]; // Only 1 of 3

    let queryCount = 0;
    const mockClient: Record<string, unknown> = {};
    mockClient["from"] = vi.fn().mockImplementation(() => {
      queryCount++;
      if (queryCount === 1) {
        return createChainableQuery({ data: scenarios, error: null });
      }
      return createChainableQuery({ data: progress, error: null });
    });
    mockedCreateClient.mockResolvedValue(mockClient as never);

    const result = await checkChapterComplete("user-1", "ch-1");
    expect(result).toBe(false);
  });

  it("returns false when no scenarios exist", async () => {
    const mockClient: Record<string, unknown> = {};
    mockClient["from"] = vi.fn().mockReturnValue(
      createChainableQuery({ data: [], error: null })
    );
    mockedCreateClient.mockResolvedValue(mockClient as never);

    const result = await checkChapterComplete("user-1", "ch-1");
    expect(result).toBe(false);
  });

  it("returns false on scenario query error", async () => {
    const mockClient: Record<string, unknown> = {};
    mockClient["from"] = vi.fn().mockReturnValue(
      createChainableQuery({ data: null, error: { message: "DB error" } })
    );
    mockedCreateClient.mockResolvedValue(mockClient as never);

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
      chapter_id: "ch-1",
      scenario_number: 2,
      title: "At the Market Stall",
    };

    const mockClient = createMockClient({ data: nextScenario, error: null });
    mockedCreateClient.mockResolvedValue(mockClient as never);

    const result = await getNextScenario("ch-1", 1);
    expect(result).toEqual(nextScenario);
  });

  it("returns null when there is no next scenario", async () => {
    const mockClient = createMockClient({ data: null, error: null });
    mockedCreateClient.mockResolvedValue(mockClient as never);

    const result = await getNextScenario("ch-1", 3);
    expect(result).toBeNull();
  });

  it("returns null on error", async () => {
    const mockClient = createMockClient({
      data: null,
      error: { message: "DB error" },
    });
    mockedCreateClient.mockResolvedValue(mockClient as never);

    const result = await getNextScenario("ch-1", 1);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Helper: create a fully chainable Supabase-like query builder
// ---------------------------------------------------------------------------

function createChainableQuery(resolvedValue: {
  data: unknown;
  error: unknown;
  count?: number | null;
}) {
  const chain: Record<string, unknown> = {};
  const chainMethods = [
    "select", "insert", "upsert", "update", "delete",
    "eq", "gt", "in", "not", "order", "limit",
  ];
  for (const m of chainMethods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain["single"] = vi.fn().mockResolvedValue(resolvedValue);
  chain["maybeSingle"] = vi.fn().mockResolvedValue(resolvedValue);
  // Make the chain itself thenable so `await supabase.from(...).select(...).eq(...)` works
  // Make the chain thenable so `await supabase.from(...).select(...).eq(...)` works.
  // Always resolve (not reject) -- Supabase returns { data, error } even on errors.
  chain["then"] = (resolve: (v: unknown) => void) => {
    resolve(resolvedValue);
  };
  return chain;
}
