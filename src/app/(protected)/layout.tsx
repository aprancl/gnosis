import { redirect } from "next/navigation";
import { getOrCreateUser } from "@/server/auth";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getOrCreateUser();

  if (!user) {
    redirect("/sign-in");
  }

  return <>{children}</>;
}
