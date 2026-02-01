import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock Prisma client
// ---------------------------------------------------------------------------

vi.mock("@/server/db", () => ({
  db: {
    conversationMessage: {
      create: vi.fn(),
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

import { db } from "@/server/db";
import { saveMessage, getConversationHistory, clearConversation } from "./storage";

const mockedDb = vi.mocked(db);

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// saveMessage
// ---------------------------------------------------------------------------

describe("saveMessage", () => {
  it("returns the saved message on success", async () => {
    const savedMessage = {
      id: "msg-1",
      userId: "user-1",
      scenarioId: "sc-1",
      role: "user",
      content: "Chaire!",
      corrections: null,
      createdAt: new Date("2025-01-15T00:00:00Z"),
    };

    mockedDb.conversationMessage.create.mockResolvedValue(savedMessage as never);

    const result = await saveMessage("user-1", "sc-1", "user", "Chaire!");
    expect(result).toEqual(savedMessage);
  });

  it("returns null on error", async () => {
    mockedDb.conversationMessage.create.mockRejectedValue(new Error("Insert failed"));

    const result = await saveMessage("user-1", "sc-1", "user", "Chaire!");
    expect(result).toBeNull();
  });

  it("passes corrections data through", async () => {
    const corrections = { corrections: [{ original: "a", corrected: "b", explanation: "test", position: 0 }] };
    const savedMessage = {
      id: "msg-2",
      userId: "user-1",
      scenarioId: "sc-1",
      role: "assistant",
      content: "Response with corrections",
      corrections,
      createdAt: new Date("2025-01-15T00:00:00Z"),
    };

    mockedDb.conversationMessage.create.mockResolvedValue(savedMessage as never);

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
  it("returns messages ordered by createdAt", async () => {
    const messages = [
      {
        id: "msg-1",
        userId: "user-1",
        scenarioId: "sc-1",
        role: "user",
        content: "Chaire!",
        corrections: null,
        createdAt: new Date("2025-01-15T00:00:00Z"),
      },
      {
        id: "msg-2",
        userId: "user-1",
        scenarioId: "sc-1",
        role: "assistant",
        content: "Chaire kai su!",
        corrections: null,
        createdAt: new Date("2025-01-15T00:01:00Z"),
      },
    ];

    mockedDb.conversationMessage.findMany.mockResolvedValue(messages as never);

    const result = await getConversationHistory("user-1", "sc-1");
    expect(result).toEqual(messages);
    expect(result).toHaveLength(2);
  });

  it("returns empty array on error", async () => {
    mockedDb.conversationMessage.findMany.mockRejectedValue(new Error("Query failed"));

    const result = await getConversationHistory("user-1", "sc-1");
    expect(result).toEqual([]);
  });

  it("returns empty array when no messages exist", async () => {
    mockedDb.conversationMessage.findMany.mockResolvedValue([]);

    const result = await getConversationHistory("user-1", "sc-1");
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// clearConversation
// ---------------------------------------------------------------------------

describe("clearConversation", () => {
  it("returns true on successful deletion", async () => {
    mockedDb.conversationMessage.deleteMany.mockResolvedValue({ count: 3 } as never);

    const result = await clearConversation("user-1", "sc-1");
    expect(result).toBe(true);
  });

  it("returns false on error", async () => {
    mockedDb.conversationMessage.deleteMany.mockRejectedValue(new Error("Delete failed"));

    const result = await clearConversation("user-1", "sc-1");
    expect(result).toBe(false);
  });
});
