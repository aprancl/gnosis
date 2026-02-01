/** Force dynamic rendering - progress is user-specific */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOverallStats } from "@/lib/progress/tracker";

/**
 * GET /api/progress
 *
 * Returns the current authenticated user's progress stats including
 * total completed scenarios, accuracy average, vocabulary count, and streak.
 */
export async function GET() {
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

  const stats = await getOverallStats(user.id);

  return NextResponse.json(
    { stats },
    {
      headers: {
        // Progress data is user-specific; allow short-lived private cache
        "Cache-Control": "private, max-age=30, stale-while-revalidate=60",
      },
    }
  );
}
