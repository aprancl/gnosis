import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock Supabase client
// ---------------------------------------------------------------------------

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "@/lib/supabase/server";
import { saveMessage, getConversationHistory, clearConversation } from "./storage";

const mockedCreateClient = vi.mocked(createClient);

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Helper: chainable query builder
// ---------------------------------------------------------------------------

function createChainableQuery(resolvedValue: {
  data: unknown;
  error: unknown;
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

function createMockClient(resolvedValue: { data: unknown; error: unknown }) {
  const query = createChainableQuery(resolvedValue);
  const client: Record<string, unknown> = {
    from: vi.fn().mockReturnValue(query),
  };
  return { client, query };
}

// ---------------------------------------------------------------------------
// saveMessage
// ---------------------------------------------------------------------------

describe("saveMessage", () => {
  it("returns the saved message on success", async () => {
    const savedMessage = {
      id: "msg-1",
      user_id: "user-1",
      scenario_id: "sc-1",
      role: "user" as const,
      content: "Chaire!",
      corrections: null,
      created_at: "2025-01-15T00:00:00Z",
    };

    const { client } = createMockClient({ data: savedMessage, error: null });
    mockedCreateClient.mockResolvedValue(client as never);

    const result = await saveMessage("user-1", "sc-1", "user", "Chaire!");
    expect(result).toEqual(savedMessage);
  });

  it("returns null on error", async () => {
    const { client } = createMockClient({
      data: null,
      error: { message: "Insert failed" },
    });
    mockedCreateClient.mockResolvedValue(client as never);

    const result = await saveMessage("user-1", "sc-1", "user", "Chaire!");
    expect(result).toBeNull();
  });

  it("passes corrections data through", async () => {
    const savedMessage = {
      id: "msg-2",
      user_id: "user-1",
      scenario_id: "sc-1",
      role: "assistant" as const,
      content: "Response with corrections",
      corrections: { corrections: [{ original: "a", corrected: "b", explanation: "test", position: 0 }] },
      created_at: "2025-01-15T00:00:00Z",
    };

    const { client } = createMockClient({ data: savedMessage, error: null });
    mockedCreateClient.mockResolvedValue(client as never);

    const corrections = { corrections: [{ original: "a", corrected: "b", explanation: "test", position: 0 }] };
    const result = await saveMessage(
      "user-1",
      "sc-1",
      "assistant",
      "Response with corrections",
      corrections
    );
    expect(result).toEqual(savedMessage);
  });
});

// ---------------------------------------------------------------------------
// getConversationHistory
// ---------------------------------------------------------------------------

describe("getConversationHistory", () => {
  it("returns messages ordered by created_at", async () => {
    const messages = [
      {
        id: "msg-1",
        user_id: "user-1",
        scenario_id: "sc-1",
        role: "user",
        content: "Chaire!",
        corrections: null,
        created_at: "2025-01-15T00:00:00Z",
      },
      {
        id: "msg-2",
        user_id: "user-1",
        scenario_id: "sc-1",
        role: "assistant",
        content: "Chaire kai su!",
        corrections: null,
        created_at: "2025-01-15T00:01:00Z",
      },
    ];

    const query = createChainableQuery({ data: messages, error: null });
    const client = { from: vi.fn().mockReturnValue(query) };
    mockedCreateClient.mockResolvedValue(client as never);

    const result = await getConversationHistory("user-1", "sc-1");
    expect(result).toEqual(messages);
    expect(result).toHaveLength(2);
  });

  it("returns empty array on error", async () => {
    const query = createChainableQuery({
      data: null,
      error: { message: "Query failed" },
    });
    const client = { from: vi.fn().mockReturnValue(query) };
    mockedCreateClient.mockResolvedValue(client as never);

    const result = await getConversationHistory("user-1", "sc-1");
    expect(result).toEqual([]);
  });

  it("returns empty array when no messages exist", async () => {
    const query = createChainableQuery({ data: [], error: null });
    const client = { from: vi.fn().mockReturnValue(query) };
    mockedCreateClient.mockResolvedValue(client as never);

    const result = await getConversationHistory("user-1", "sc-1");
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// clearConversation
// ---------------------------------------------------------------------------

describe("clearConversation", () => {
  it("returns true on successful deletion", async () => {
    const query = createChainableQuery({ data: null, error: null });
    const client = { from: vi.fn().mockReturnValue(query) };
    mockedCreateClient.mockResolvedValue(client as never);

    const result = await clearConversation("user-1", "sc-1");
    expect(result).toBe(true);
  });

  it("returns false on error", async () => {
    const query = createChainableQuery({
      data: null,
      error: { message: "Delete failed" },
    });
    const client = { from: vi.fn().mockReturnValue(query) };
    mockedCreateClient.mockResolvedValue(client as never);

    const result = await clearConversation("user-1", "sc-1");
    expect(result).toBe(false);
  });
});
