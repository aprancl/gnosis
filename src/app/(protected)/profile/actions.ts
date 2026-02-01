"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getOrCreateUser } from "@/server/auth";
import { db } from "@/server/db";

/**
 * Server action for the new-user welcome flow.
 * Sets the user's current chapter to Chapter 1 and redirects to dashboard.
 */
export async function setupProfile() {
  const user = await getOrCreateUser();

  if (!user) {
    redirect("/sign-in");
  }

  // Find Chapter 1
  const chapter1 = await db.chapter.findFirst({
    where: { chapterNumber: 1 },
    select: { id: true },
  });

  if (chapter1) {
    await db.user.update({
      where: { id: user.id },
      data: { currentChapterId: chapter1.id },
    });
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}
