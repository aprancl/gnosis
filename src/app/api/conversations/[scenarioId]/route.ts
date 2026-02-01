/** Force dynamic rendering - conversation data is user-specific */
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getOrCreateUser } from "@/server/auth";
import {
  getConversationHistory,
  clearConversation,
} from "@/lib/conversation/storage";

interface RouteParams {
  params: Promise<{ scenarioId: string }>;
}

/**
 * GET /api/conversations/[scenarioId]
 *
 * Retrieve conversation history for the authenticated user and the given scenario.
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { scenarioId } = await params;

  const user = await getOrCreateUser();

  if (!user) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
  }

  const messages = await getConversationHistory(user.id, scenarioId);

  return NextResponse.json(
    { messages },
    {
      headers: {
        "Cache-Control": "private, no-cache, no-store, must-revalidate",
      },
    }
  );
}

/**
 * DELETE /api/conversations/[scenarioId]
 *
 * Clear all conversation history for the authenticated user and the given scenario.
 */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const { scenarioId } = await params;

  const user = await getOrCreateUser();

  if (!user) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
  }

  const success = await clearConversation(user.id, scenarioId);

  if (!success) {
    return NextResponse.json(
      { error: "Failed to clear conversation history" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
