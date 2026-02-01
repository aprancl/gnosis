import { auth, currentUser } from "@clerk/nextjs/server";
import { db } from "@/server/db";

/**
 * Gets the current user from the database, creating a record if one
 * doesn't exist yet. Returns null if the user is not authenticated.
 */
export async function getOrCreateUser() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;

  try {
    return await db.user.upsert({
      where: { clerkId },
      update: {},
      create: {
        clerkId,
        email:
          (await currentUser())?.emailAddresses[0]?.emailAddress ?? "",
      },
    });
  } catch (error) {
    // P2002 = unique constraint violation (race condition on concurrent requests)
    if (
      error instanceof Error &&
      "code" in error &&
      (error as { code: string }).code === "P2002"
    ) {
      return db.user.findUnique({ where: { clerkId } });
    }
    console.error("[auth] Failed to get/create user in database:", error);
    return null;
  }
}
