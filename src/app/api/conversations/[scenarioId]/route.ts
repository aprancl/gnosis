/** Force dynamic rendering - conversation data is user-specific */
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
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
 * Returns messages ordered by created_at ascending.
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { scenarioId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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
 * Used when a user wants to replay a scenario from scratch.
 */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const { scenarioId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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
