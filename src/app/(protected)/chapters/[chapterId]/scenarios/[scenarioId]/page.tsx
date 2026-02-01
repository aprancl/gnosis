import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import BrowserSupportNotice from "@/components/ui/BrowserSupportNotice";
import ChatInterfaceLoader from "@/components/chat/ChatInterfaceLoader";
import type { Scenario } from "@/types/database";
import Link from "next/link";

interface ScenarioPageProps {
  params: Promise<{
    chapterId: string;
    scenarioId: string;
  }>;
  searchParams: Promise<{ replay?: string }>;
}

export default async function ScenarioPage({ params, searchParams }: ScenarioPageProps) {
  const { chapterId, scenarioId } = await params;
  const { replay } = await searchParams;
  const isReplay = replay === "1";
  const supabase = await createClient();

  // Fetch the scenario (select only columns needed by ChatInterface)
  const { data: scenario, error } = await supabase
    .from("scenarios")
    .select("id, chapter_id, scenario_number, title, context_description, agent_role, target_phrases, system_prompt")
    .eq("id", scenarioId)
    .eq("chapter_id", chapterId)
    .single();

  if (error || !scenario) {
    notFound();
  }

  // Cast to typed Scenario
  const typedScenario = scenario as Scenario;

  // If replaying, clear conversation history server-side
  if (isReplay) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from("conversation_messages")
        .delete()
        .eq("user_id", user.id)
        .eq("scenario_id", scenarioId);
    }
  }

  return (
    <div className="flex h-screen flex-col bg-parchment">
      {/* Top navigation bar */}
      <header className="flex items-center justify-between border-b border-blue-200 bg-white/90 px-4 py-3">
        <Link
          href={`/chapters/${chapterId}`}
          className="flex items-center gap-2 font-serif text-sm text-blue-700 transition-colors hover:text-blue-900"
        >
          <BackArrowIcon />
          Back to Chapter
        </Link>
        <h1 className="font-serif text-lg font-bold tracking-tight text-blue-900">
          Gnosis
        </h1>
        <div className="w-24" /> {/* Spacer for centering */}
      </header>

      {/* Browser support notice (dismissible) */}
      <BrowserSupportNotice />

      {/* Chat interface fills remaining space */}
      <div className="flex-1 overflow-hidden">
        <ChatInterfaceLoader scenario={typedScenario} isReplay={isReplay} />
      </div>
    </div>
  );
}

function BackArrowIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M19 12H5" />
      <path d="m12 19-7-7 7-7" />
    </svg>
  );
}
