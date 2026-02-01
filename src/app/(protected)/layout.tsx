import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Layout for protected routes. Checks for an authenticated user
 * and redirects to sign-in if not found.
 */
export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/sign-in");
  }

  return <>{children}</>;
}
