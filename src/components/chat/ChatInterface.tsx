"use client";

/**
 * ChatInterface component - the main chat interface that manages conversation state,
 * calls the /api/chat endpoint with streaming, and renders messages with a typing indicator.
 */

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { ChatMessage as ChatMessageType, NextScenarioInfo } from "@/types/chat";
import type { Scenario } from "@/types/database";
import { SCENARIO_COMPLETE_MARKER } from "@/lib/scenario/constants";
import ChatMessage from "./ChatMessage";
import ChatInput from "./ChatInput";
import HintButton from "./HintButton";
import VoiceModeToggle from "./VoiceModeToggle";
import { useVoiceMode } from "@/hooks/useVoiceMode";

/** Maximum number of hints allowed per scenario session */
const MAX_HINTS_PER_SCENARIO = 3;
/** Special message content the API recognizes as a hint request */
const HINT_REQUEST_MESSAGE = "[HINT_REQUEST]";

/** Completion metadata sent at the end of a streaming response */
const COMPLETION_META_PREFIX = "\n__COMPLETION_META__";

interface CompletionState {
  scenarioCompleted: boolean;
  chapterCompleted: boolean;
  nextScenario?: NextScenarioInfo;
}

/**
 * Parse completion metadata from the end of a streamed response.
 * Returns the clean content and any completion state found.
 */
function parseStreamedCompletion(raw: string): {
  content: string;
  completion: CompletionState | null;
} {
  const metaIndex = raw.indexOf(COMPLETION_META_PREFIX);
  if (metaIndex === -1) {
    // Also strip any completion marker that may be in the raw content
    const stripped = raw.replace(SCENARIO_COMPLETE_MARKER, "").trim();
    return { content: stripped !== raw ? stripped : raw, completion: null };
  }

  const content = raw.substring(0, metaIndex).replace(SCENARIO_COMPLETE_MARKER, "").trim();
  const metaJson = raw.substring(metaIndex + COMPLETION_META_PREFIX.length);

  try {
    const meta = JSON.parse(metaJson);
    return {
      content,
      completion: {
        scenarioCompleted: meta.scenarioCompleted ?? false,
        chapterCompleted: meta.chapterCompleted ?? false,
        nextScenario: meta.nextScenario,
      },
    };
  } catch {
    return { content, completion: null };
  }
}

/**
 * Detect whether an assistant message contains a language reminder
 * (i.e., the agent is nudging the user to respond in Greek).
 */
function containsLanguageReminder(content: string): boolean {
  const lowerContent = content.toLowerCase();
  const reminderPatterns = [
    "try in greek",
    "try using greek",
    "respond in greek",
    "write in greek",
    "speak in greek",
    "use greek",
    "in greek!",
    "στα ἑλληνικά",
    "στα ελληνικά",
    "προσπάθησε",
    "δοκίμασε στα",
  ];
  return reminderPatterns.some((pattern) => lowerContent.includes(pattern));
}

interface ChatInterfaceProps {
  scenario: Scenario;
  /** When true, the conversation was cleared for a fresh replay */
  isReplay?: boolean;
}

export default function ChatInterface({ scenario, isReplay = false }: ChatInterfaceProps) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessageType[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [streamingContent, setStreamingContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showGreekHint, setShowGreekHint] = useState(false);
  const [completion, setCompletion] = useState<CompletionState | null>(null);
  const [hintsUsed, setHintsUsed] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Track the latest assistant message index for auto-TTS
  const lastSpokenIndexRef = useRef(-1);

  // Ref for streaming text chunk emitter (used for streaming TTS in voice mode)
  // When set, text chunks from the streaming response are pushed here
  const streamChunkResolverRef = useRef<((chunk: string) => void) | null>(null);
  const streamEndResolverRef = useRef<(() => void) | null>(null);
  // Track whether streaming TTS was used for the current response
  const streamTTSActiveRef = useRef(false);

  // Refs for voice mode state accessed inside sendMessage
  // (voiceMode is declared after sendMessage, so we use refs for live values)
  const voiceModeActiveRef = useRef(false);
  const voiceTtsSupportedRef = useRef(false);
  const speakStreamRef = useRef<((chunks: AsyncIterable<string>) => Promise<void>) | null>(null);

  // Detect if the latest assistant message includes a language reminder
  const latestAssistantContent = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") return messages[i].content;
    }
    return null;
  }, [messages]);

  useEffect(() => {
    if (latestAssistantContent && containsLanguageReminder(latestAssistantContent)) {
      setShowGreekHint(true);
      const timer = setTimeout(() => setShowGreekHint(false), 8000);
      return () => clearTimeout(timer);
    } else {
      setShowGreekHint(false);
    }
  }, [latestAssistantContent]);

  // Load existing conversation history on mount (skip for replay -- history was cleared)
  useEffect(() => {
    if (isReplay) {
      setIsLoadingHistory(false);
      return;
    }

    async function loadHistory() {
      try {
        const response = await fetch(`/api/conversations/${scenario.id}`);
        if (response.ok) {
          const data = await response.json();
          if (data.messages && data.messages.length > 0) {
            const historyMessages: ChatMessageType[] = data.messages.map(
              (msg: { role: string; content: string }) => ({
                role: msg.role as ChatMessageType["role"],
                content: msg.content,
              })
            );
            setMessages(historyMessages);
            // Mark all existing messages as already spoken so we don't auto-play history
            lastSpokenIndexRef.current = historyMessages.length - 1;
          }
        }
      } catch (err) {
        console.error("Failed to load conversation history:", err);
      } finally {
        setIsLoadingHistory(false);
      }
    }
    loadHistory();
  }, [scenario.id, isReplay]);

  // Auto-scroll to bottom when messages change or streaming content updates
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent]);

  const sendMessage = useCallback(
    async (content: string) => {
      if (isLoading) return;

      setError(null);
      const userMessage: ChatMessageType = { role: "user", content };

      // Add user message to conversation
      setMessages((prev) => [...prev, userMessage]);
      setIsLoading(true);
      setStreamingContent("");

      // Build message history (user + assistant only; system prompt handled server-side via scenarioId)
      const allMessages: ChatMessageType[] = [
        ...messages,
        userMessage,
      ];

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
          },
          body: JSON.stringify({
            messages: allMessages,
            scenarioId: scenario.id,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => null);
          throw new Error(
            errorData?.error ?? `Request failed with status ${response.status}`
          );
        }

        if (!response.body) {
          throw new Error("No response body received");
        }

        // Start streaming TTS if voice mode is active
        streamTTSActiveRef.current = false;
        if (voiceModeActiveRef.current && voiceTtsSupportedRef.current && speakStreamRef.current) {
          streamTTSActiveRef.current = true;

          // Create an async iterable that yields text chunks as they arrive
          const chunkQueue: string[] = [];
          let resolveWait: (() => void) | null = null;
          let streamDone = false;

          streamChunkResolverRef.current = (chunk: string) => {
            chunkQueue.push(chunk);
            if (resolveWait) {
              resolveWait();
              resolveWait = null;
            }
          };

          streamEndResolverRef.current = () => {
            streamDone = true;
            if (resolveWait) {
              resolveWait();
              resolveWait = null;
            }
          };

          const textChunkIterable: AsyncIterable<string> = {
            [Symbol.asyncIterator]() {
              return {
                async next(): Promise<IteratorResult<string>> {
                  while (chunkQueue.length === 0 && !streamDone) {
                    await new Promise<void>((resolve) => {
                      resolveWait = resolve;
                    });
                  }
                  if (chunkQueue.length > 0) {
                    return { value: chunkQueue.shift()!, done: false };
                  }
                  return { value: undefined as unknown as string, done: true };
                },
              };
            },
          };

          // Fire and forget -- speakStream will run in parallel with the streaming loop
          speakStreamRef.current!(textChunkIterable).catch((err: unknown) => {
            console.warn("[ChatInterface] Streaming TTS error:", err);
          });
        }

        // Read the stream
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let accumulated = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          accumulated += chunk;
          setStreamingContent(accumulated);

          // Push chunk to streaming TTS if active
          if (streamChunkResolverRef.current) {
            streamChunkResolverRef.current(chunk);
          }
        }

        // Signal end of text stream to TTS
        if (streamEndResolverRef.current) {
          streamEndResolverRef.current();
          streamChunkResolverRef.current = null;
          streamEndResolverRef.current = null;
        }

        // Parse completion metadata from the stream
        const { content: cleanContent, completion: completionData } =
          parseStreamedCompletion(accumulated);

        // Add complete assistant message
        const assistantMessage: ChatMessageType = {
          role: "assistant",
          content: cleanContent,
        };
        setMessages((prev) => [...prev, assistantMessage]);
        setStreamingContent("");

        // Show completion overlay if scenario was completed
        if (completionData?.scenarioCompleted) {
          setCompletion(completionData);
        }
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "An unexpected error occurred";
        setError(errorMessage);
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading, messages, scenario.id]
  );

  // Hint request handler
  const requestHint = useCallback(() => {
    if (hintsUsed >= MAX_HINTS_PER_SCENARIO || isLoading) return;
    setHintsUsed((prev) => prev + 1);
    sendMessage(HINT_REQUEST_MESSAGE);
  }, [hintsUsed, isLoading, sendMessage]);

  // Voice mode integration
  const voiceMode = useVoiceMode({
    onTranscript: sendMessage,
    isProcessing: isLoading,
  });

  // Keep refs in sync with voiceMode for use inside sendMessage
  voiceModeActiveRef.current = voiceMode.isVoiceModeActive;
  voiceTtsSupportedRef.current = voiceMode.ttsSupported;
  speakStreamRef.current = voiceMode.speakStream;

  // Auto-play TTS for new assistant messages when voice mode is active.
  // If streaming TTS already handled this message, skip the non-streaming fallback.
  useEffect(() => {
    if (!voiceMode.isVoiceModeActive || !voiceMode.ttsSupported) return;
    if (messages.length === 0) return;

    const lastMessage = messages[messages.length - 1];
    const lastIndex = messages.length - 1;

    if (
      lastMessage.role === "assistant" &&
      lastMessage.content &&
      lastIndex > lastSpokenIndexRef.current &&
      !isLoading
    ) {
      lastSpokenIndexRef.current = lastIndex;

      // If streaming TTS was active for this response, it already handled playback
      if (streamTTSActiveRef.current) {
        streamTTSActiveRef.current = false;
        return;
      }

      voiceMode.speak(lastMessage.content);
    }
  }, [messages, voiceMode, isLoading]);

  return (
    <div className="flex h-full flex-col">
      {/* Scenario context header */}
      <div className="border-b border-blue-200 bg-white/80 px-6 py-4">
        <div className="mx-auto flex max-w-3xl items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h2 className="font-serif text-xl font-bold text-blue-900">
              {scenario.title}
            </h2>
            <p className="mt-1 font-serif text-sm leading-relaxed text-blue-700/70">
              {scenario.contextDescription}
            </p>
            {scenario.agentRole && (
              <p className="mt-1 font-serif text-xs italic text-blue-500">
                Speaking with: {scenario.agentRole}
              </p>
            )}
          </div>
          <div className="shrink-0">
            <VoiceModeToggle
              isActive={voiceMode.isVoiceModeActive}
              onToggle={voiceMode.toggleVoiceMode}
              isAvailable={voiceMode.isAvailable}
              voiceState={voiceMode.voiceState}
              unavailableReason={voiceMode.unavailableReason}
            />
          </div>
        </div>
      </div>

      {/* Messages area */}
      <div
        ref={chatContainerRef}
        className="flex-1 overflow-y-auto bg-parchment/50 px-4 py-6"
      >
        <div className="mx-auto max-w-3xl space-y-4">
          {/* Loading history indicator */}
          {isLoadingHistory && (
            <div className="py-12 text-center">
              <p className="font-serif text-lg text-blue-800/60">
                Loading conversation...
              </p>
            </div>
          )}

          {/* Welcome prompt when no messages */}
          {messages.length === 0 && !isLoading && !isLoadingHistory && (
            <div className="py-12 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-100">
                <GreekColumnIcon />
              </div>
              <p className="font-serif text-lg text-blue-800/60">
                {voiceMode.isVoiceModeActive
                  ? "Tap the microphone to begin speaking in Greek..."
                  : "Begin the conversation in Greek..."}
              </p>
              <p className="mt-2 font-serif text-sm text-blue-600/50">
                {scenario.targetPhrases.length > 0 && (
                  <>Try using: {scenario.targetPhrases.slice(0, 3).join(", ")}</>
                )}
              </p>
            </div>
          )}

          {/* Rendered messages */}
          {messages.map((msg, index) => (
            <ChatMessage key={index} message={msg} />
          ))}

          {/* Streaming message */}
          {isLoading && streamingContent && (
            <ChatMessage
              message={{ role: "assistant", content: streamingContent }}
              isStreaming
            />
          )}

          {/* Typing indicator (before any content streams in) */}
          {isLoading && !streamingContent && <TypingIndicator />}

          {/* Error message */}
          {error && (
            <div className="mx-auto max-w-md rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-center">
              <p className="font-serif text-sm text-red-700">{error}</p>
              <button
                onClick={() => setError(null)}
                className="mt-2 font-serif text-xs text-red-500 underline hover:text-red-700"
              >
                Dismiss
              </button>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Language hint banner */}
      {showGreekHint && (
        <div className="border-t border-amber-200 bg-amber-50 px-4 py-2 text-center">
          <p className="font-serif text-sm text-amber-700">
            Try responding in Greek!
          </p>
        </div>
      )}

      {/* Input area - switches between text input and voice controls */}
      <div className="border-t border-blue-200 bg-white px-4 py-4">
        <div className="mx-auto max-w-3xl">
          {voiceMode.isVoiceModeActive ? (
            <VoiceModeControls
              voiceState={voiceMode.voiceState}
              isListening={voiceMode.isListening}
              interimTranscript={voiceMode.interimTranscript}
              finalTranscript={voiceMode.finalTranscript}
              sttError={voiceMode.sttError}
              sttSupported={voiceMode.sttSupported}
              isSpeaking={voiceMode.isSpeaking}
              onStartListening={voiceMode.startListening}
              onStopListening={voiceMode.stopListening}
              onStopSpeaking={voiceMode.stopSpeaking}
              disabled={isLoading || !!completion}
            />
          ) : (
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <ChatInput onSend={sendMessage} disabled={isLoading || !!completion} />
              </div>
              <div className="mb-1">
                <HintButton
                  hintsUsed={hintsUsed}
                  maxHints={MAX_HINTS_PER_SCENARIO}
                  disabled={isLoading || !!completion}
                  onRequestHint={requestHint}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Scenario completion overlay */}
      {completion && (
        <CompletionOverlay
          completion={completion}
          scenario={scenario}
          onContinue={() => {
            if (completion.nextScenario) {
              router.push(
                `/chapters/${completion.nextScenario.chapterId}/scenarios/${completion.nextScenario.id}`
              );
            } else {
              router.push(`/chapters`);
            }
          }}
          onDismiss={() => setCompletion(null)}
        />
      )}
    </div>
  );
}

/** Scenario completion overlay modal */
function CompletionOverlay({
  completion,
  scenario,
  onContinue,
  onDismiss,
}: {
  completion: CompletionState;
  scenario: Scenario;
  onContinue: () => void;
  onDismiss: () => void;
}) {
  const isChapterDone = completion.chapterCompleted;
  const hasNext = !!completion.nextScenario;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-blue-900/40 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-md rounded-2xl border border-blue-200 bg-white p-8 shadow-2xl">
        {/* Success icon */}
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
          <CheckmarkIcon />
        </div>

        <h3 className="text-center font-serif text-2xl font-bold text-blue-900">
          {isChapterDone && !hasNext
            ? "Chapter Complete!"
            : "Scenario Complete!"}
        </h3>

        <p className="mt-2 text-center font-serif text-sm text-blue-700/70">
          {isChapterDone && !hasNext
            ? `You have completed all scenarios in this chapter. Well done!`
            : `You have successfully completed "${scenario.title}".`}
        </p>

        {isChapterDone && hasNext && (
          <p className="mt-1 text-center font-serif text-xs text-green-700">
            Chapter complete! The next chapter is now unlocked.
          </p>
        )}

        <div className="mt-6 flex flex-col gap-3">
          {hasNext && (
            <button
              onClick={onContinue}
              className="w-full rounded-lg bg-blue-800 px-4 py-3 font-serif text-sm font-semibold text-white transition-colors hover:bg-blue-700"
            >
              Continue to Next Scenario
              {completion.nextScenario && (
                <span className="mt-0.5 block text-xs font-normal text-blue-200">
                  {completion.nextScenario.title}
                </span>
              )}
            </button>
          )}

          <button
            onClick={() => {
              // Always navigate to chapters list for this button
              window.location.href = "/chapters";
            }}
            className={
              hasNext
                ? "w-full rounded-lg border border-blue-200 bg-white px-4 py-3 font-serif text-sm font-semibold text-blue-800 transition-colors hover:bg-blue-50"
                : "w-full rounded-lg bg-blue-800 px-4 py-3 font-serif text-sm font-semibold text-white transition-colors hover:bg-blue-700"
            }
          >
            {hasNext ? "Back to Chapters" : "Return to Chapters"}
          </button>

          <button
            onClick={() => {
              // Replay: navigate to same scenario with replay flag
              window.location.href = `/chapters/${scenario.chapterId}/scenarios/${scenario.id}?replay=1`;
            }}
            className="w-full rounded-lg border border-blue-200 bg-white px-4 py-3 font-serif text-sm font-semibold text-blue-800 transition-colors hover:bg-blue-50"
          >
            Replay This Scenario
          </button>

          <button
            onClick={onDismiss}
            className="w-full px-4 py-2 font-serif text-xs text-blue-500 transition-colors hover:text-blue-700"
          >
            Stay in Conversation
          </button>
        </div>
      </div>
    </div>
  );
}

function CheckmarkIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-green-600"
    >
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

/** Animated typing dots indicator */
function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="rounded-2xl border border-blue-100 bg-white px-5 py-3 shadow-sm">
        <div className="mb-1 font-sans text-xs font-medium uppercase tracking-wider text-blue-400">
          Didaskalos
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 animate-bounce rounded-full bg-blue-400 [animation-delay:0ms]" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-blue-400 [animation-delay:150ms]" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-blue-400 [animation-delay:300ms]" />
        </div>
      </div>
    </div>
  );
}

/** Voice mode controls - large microphone button, transcript display, state indicators */
interface VoiceModeControlsProps {
  voiceState: string;
  isListening: boolean;
  interimTranscript: string;
  finalTranscript: string;
  sttError: string | null;
  sttSupported: boolean;
  isSpeaking: boolean;
  onStartListening: () => void;
  onStopListening: () => void;
  onStopSpeaking: () => void;
  disabled: boolean;
}

function VoiceModeControls({
  voiceState,
  isListening,
  interimTranscript,
  finalTranscript,
  sttError,
  sttSupported,
  isSpeaking,
  onStartListening,
  onStopListening,
  onStopSpeaking,
  disabled,
}: VoiceModeControlsProps) {
  const currentTranscript =
    finalTranscript + (interimTranscript ? ` ${interimTranscript}` : "");

  const handleMicClick = () => {
    if (isListening) {
      onStopListening();
    } else {
      onStartListening();
    }
  };

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Live transcript display */}
      {currentTranscript.trim() && (
        <div className="w-full max-w-md rounded-xl bg-blue-50 px-4 py-3 text-center">
          <p className="font-serif text-base text-blue-800 italic">
            {currentTranscript.trim()}
          </p>
        </div>
      )}

      {/* State label */}
      <p className="font-serif text-sm text-blue-500">
        <VoiceStateLabel state={voiceState} />
      </p>

      {/* Main control buttons */}
      <div className="flex items-center gap-4">
        {/* Stop speaking button (when TTS is active) */}
        {isSpeaking && (
          <button
            type="button"
            onClick={onStopSpeaking}
            className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-green-300 bg-green-50 text-green-700 transition-colors hover:bg-green-100"
            aria-label="Stop speaking"
            title="Stop speaking"
          >
            <StopIcon />
          </button>
        )}

        {/* Large microphone button */}
        {sttSupported && (
          <button
            type="button"
            onClick={handleMicClick}
            disabled={disabled || isSpeaking}
            className={`relative flex h-16 w-16 items-center justify-center rounded-full transition-all ${
              isListening
                ? "bg-red-500 text-white shadow-lg shadow-red-200 hover:bg-red-600"
                : "bg-blue-700 text-white shadow-lg shadow-blue-200 hover:bg-blue-800"
            } disabled:opacity-40 disabled:shadow-none`}
            aria-label={isListening ? "Stop listening" : "Tap to speak"}
            title={isListening ? "Stop listening" : "Tap to speak in Greek"}
          >
            {/* Pulse animation when listening */}
            {isListening && (
              <>
                <span className="absolute inset-0 animate-ping rounded-full bg-red-400 opacity-20" />
                <span className="absolute inset-[-4px] animate-pulse rounded-full border-2 border-red-300 opacity-40" />
              </>
            )}
            {/* Processing animation */}
            {voiceState === "processing" && (
              <span className="absolute inset-0 animate-pulse rounded-full bg-amber-400 opacity-20" />
            )}
            <LargeMicrophoneIcon />
          </button>
        )}

        {/* Fallback: show a message if STT is not supported */}
        {!sttSupported && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-center">
            <p className="font-serif text-sm text-amber-700">
              Voice input is not available in this browser.
            </p>
            <p className="mt-1 font-serif text-xs text-amber-600">
              Agent responses will still be spoken aloud.
            </p>
          </div>
        )}
      </div>

      {/* STT error message */}
      {sttError && (
        <div className="max-w-md rounded-lg bg-red-50 px-3 py-2 text-center">
          <p className="font-serif text-xs text-red-600">{sttError}</p>
        </div>
      )}
    </div>
  );
}

function VoiceStateLabel({ state }: { state: string }) {
  switch (state) {
    case "listening":
      return (
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-red-400" />
          Listening...
        </span>
      );
    case "processing":
      return (
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-400" />
          Processing...
        </span>
      );
    case "speaking":
      return (
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-green-400" />
          Speaking...
        </span>
      );
    default:
      return <>Tap the microphone to speak</>;
  }
}

function LargeMicrophoneIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="relative z-10"
    >
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" x2="12" y1="19" y2="22" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="none"
    >
      <rect x="6" y="6" width="12" height="12" rx="1" />
    </svg>
  );
}

function GreekColumnIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-blue-600"
    >
      <path d="M6 3h12" />
      <path d="M6 21h12" />
      <path d="M8 3v18" />
      <path d="M16 3v18" />
      <path d="M12 3v18" />
      <path d="M6 3c0 0 0 3 -1 6" />
      <path d="M18 3c0 0 0 3 1 6" />
    </svg>
  );
}
