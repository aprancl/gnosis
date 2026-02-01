"use client";

/**
 * Client-side lazy loader for ChatInterface.
 *
 * Uses next/dynamic with ssr: false to avoid bundling voice hooks (STT/TTS)
 * during server-side rendering, reducing the initial page load bundle size.
 */

import dynamic from "next/dynamic";
import type { Scenario } from "@/types/database";

const ChatInterface = dynamic(() => import("./ChatInterface"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <p className="font-serif text-lg text-blue-800/60">
        Loading chat...
      </p>
    </div>
  ),
});

interface ChatInterfaceLoaderProps {
  scenario: Scenario;
  isReplay?: boolean;
}

export default function ChatInterfaceLoader({
  scenario,
  isReplay = false,
}: ChatInterfaceLoaderProps) {
  return <ChatInterface scenario={scenario} isReplay={isReplay} />;
}
