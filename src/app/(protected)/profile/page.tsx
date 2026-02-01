import Link from "next/link";
import { currentUser } from "@clerk/nextjs/server";
import { UserButton } from "@clerk/nextjs";
import { getOrCreateUser } from "@/server/auth";
import { db } from "@/server/db";
import { redirect } from "next/navigation";

export default async function ProfilePage() {
  const clerkUser = await currentUser();
  if (!clerkUser) redirect("/sign-in");

  const user = await getOrCreateUser();
  if (!user) redirect("/sign-in");

  // Get current chapter info if set
  let currentChapterTitle: string | null = null;
  if (user.currentChapterId) {
    const chapter = await db.chapter.findUnique({
      where: { id: user.currentChapterId },
      select: { chapterNumber: true, title: true },
    });
    if (chapter) {
      currentChapterTitle = `Ch. ${chapter.chapterNumber}: ${chapter.title}`;
    }
  }

  const displayName =
    clerkUser.firstName
      ? `${clerkUser.firstName}${clerkUser.lastName ? ` ${clerkUser.lastName}` : ""}`
      : null;
  const email = clerkUser.emailAddresses[0]?.emailAddress ?? "";

  return (
    <div className="flex min-h-screen flex-col bg-parchment">
      {/* Header */}
      <header className="border-b border-blue-200 bg-white/80 px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <Link href="/dashboard">
            <h1 className="font-serif text-2xl font-bold tracking-tight text-blue-900">
              Gnosis
            </h1>
          </Link>
          <div className="flex items-center gap-4">
            <span className="font-serif text-sm text-blue-800/60">
              {displayName || email}
            </span>
            <UserButton />
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
        {/* Back link */}
        <Link
          href="/dashboard"
          className="mb-8 inline-flex items-center gap-1 font-serif text-sm text-blue-700 hover:text-blue-900"
        >
          &larr; Back to Dashboard
        </Link>

        <h2 className="mt-4 font-serif text-3xl font-bold text-blue-900">
          Profile
        </h2>
        <p className="mt-2 font-serif text-blue-800/60">
          Your account information.
        </p>

        {/* Profile info */}
        <div className="mt-8 rounded-xl border border-blue-200 bg-white p-8 shadow-sm">
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-1.5">
              <label className="font-serif text-sm font-medium text-ink">
                Email
              </label>
              <p className="rounded-lg border border-blue-100 bg-blue-50/30 px-4 py-2.5 font-serif text-ink/50">
                {email}
              </p>
              <p className="font-serif text-xs text-blue-800/40">
                Managed by your authentication provider.
              </p>
            </div>

            {displayName && (
              <div className="flex flex-col gap-1.5">
                <label className="font-serif text-sm font-medium text-ink">
                  Display Name
                </label>
                <p className="rounded-lg border border-blue-100 bg-blue-50/30 px-4 py-2.5 font-serif text-ink">
                  {displayName}
                </p>
              </div>
            )}

            {currentChapterTitle && (
              <div className="flex flex-col gap-1.5">
                <label className="font-serif text-sm font-medium text-ink">
                  Current Chapter
                </label>
                <p className="rounded-lg border border-blue-100 bg-blue-50/30 px-4 py-2.5 font-serif text-ink">
                  {currentChapterTitle}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Account info */}
        <div className="mt-8 rounded-xl border border-blue-100 bg-white/50 p-6">
          <h3 className="font-serif text-lg font-semibold text-blue-900">
            Account Information
          </h3>
          <dl className="mt-4 space-y-3">
            <div className="flex justify-between">
              <dt className="font-serif text-sm text-blue-800/60">
                Member since
              </dt>
              <dd className="font-serif text-sm text-ink">
                {new Date(user.createdAt).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </dd>
            </div>
          </dl>
        </div>
      </main>
    </div>
  );
}
