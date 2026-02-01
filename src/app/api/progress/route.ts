/** Force dynamic rendering - progress is user-specific */
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getOrCreateUser } from "@/server/auth";
import { getOverallStats } from "@/lib/progress/tracker";

/**
 * GET /api/progress
 *
 * Returns the current authenticated user's progress stats.
 */
export async function GET() {
  const user = await getOrCreateUser();

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
        "Cache-Control": "private, max-age=30, stale-while-revalidate=60",
      },
    }
  );
}
