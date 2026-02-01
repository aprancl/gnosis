/** Force dynamic rendering - chat completions cannot be cached */
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import {
  createChatCompletion,
  createStreamingChatCompletion,
} from "@/lib/groq/client";
import {
  loadScenarioContext,
  processConversationTurn,
  detectCompletion,
  stripCompletionMarker,
} from "@/lib/scenario/engine";
import {
  markScenarioComplete,
  checkChapterComplete,
  getNextScenario,
  advanceUserProgress,
} from "@/lib/scenario/completion";
import { buildFallbackSystemPrompt } from "@/lib/scenario/prompts";
import { getOrCreateUser } from "@/server/auth";
import { saveMessage } from "@/lib/conversation/storage";
import { parseCorrections } from "@/lib/corrections/parser";
import type { ChatRequest, ChatErrorResponse } from "@/types/chat";
import type { CorrectionsData } from "@/types/corrections";

/**
 * Validate that the request body contains a valid ChatRequest.
 */
function validateChatRequest(
  body: unknown
): body is ChatRequest {
  if (!body || typeof body !== "object") return false;
  const obj = body as Record<string, unknown>;
  if (!Array.isArray(obj.messages)) return false;
  if (obj.messages.length === 0) return false;

  if (obj.scenarioId !== undefined && typeof obj.scenarioId !== "string") {
    return false;
  }

  return obj.messages.every(
    (msg: unknown) =>
      msg !== null &&
      typeof msg === "object" &&
      "role" in (msg as Record<string, unknown>) &&
      "content" in (msg as Record<string, unknown>) &&
      typeof (msg as Record<string, unknown>).content === "string" &&
      ["system", "user", "assistant"].includes(
        (msg as Record<string, unknown>).role as string
      )
  );
}

export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json();

    if (!validateChatRequest(body)) {
      const error: ChatErrorResponse = {
        error:
          "Invalid request body. Expected { messages: [{ role, content }], scenarioId?: string }",
        code: "INVALID_REQUEST",
      };
      return NextResponse.json(error, { status: 400 });
    }

    const { messages, scenarioId } = body;

    // Check if client wants streaming
    const acceptStream =
      request.headers.get("accept") === "text/event-stream";

    // Get authenticated user
    const user = await getOrCreateUser();

    // --- Scenario-aware path ---
    if (scenarioId) {
      const scenarioContext = await loadScenarioContext(scenarioId);

      if (!scenarioContext) {
        const error: ChatErrorResponse = {
          error: `Scenario not found: ${scenarioId}`,
          code: "SCENARIO_NOT_FOUND",
        };
        return NextResponse.json(error, { status: 404 });
      }

      // Filter out any client-sent system messages to prevent prompt injection
      const conversationMessages = messages.filter((m) => m.role !== "system");

      // Save the latest user message to the database
      const latestUserMessage = conversationMessages[conversationMessages.length - 1];
      if (user && latestUserMessage && latestUserMessage.role === "user") {
        await saveMessage(user.id, scenarioId, "user", latestUserMessage.content);
      }

      if (acceptStream) {
        const fullMessages = [
          { role: "system" as const, content: scenarioContext.systemPrompt },
          ...conversationMessages,
        ];
        const stream = await createStreamingChatCompletion(fullMessages);

        const { readable, writable } = new TransformStream();
        const writer = writable.getWriter();
        const reader = stream.getReader();
        const userId = user?.id;
        const currentScenarioContext = scenarioContext;

        (async () => {
          let accumulated = "";
          const decoder = new TextDecoder();
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              accumulated += decoder.decode(value, { stream: true });
              await writer.write(value);
            }
          } finally {
            const completed = detectCompletion(accumulated);
            const cleanContent = completed
              ? stripCompletionMarker(accumulated)
              : accumulated;

            const correctionResult = parseCorrections(cleanContent);
            const correctionsData: CorrectionsData | null =
              correctionResult.corrections.length > 0
                ? { corrections: correctionResult.corrections }
                : null;

            if (userId && cleanContent) {
              await saveMessage(
                userId,
                scenarioId,
                "assistant",
                cleanContent,
                correctionsData as unknown as Record<string, unknown> | null
              );
            }

            if (completed && userId) {
              await markScenarioComplete(userId, scenarioId);
              await advanceUserProgress(
                userId,
                currentScenarioContext.scenario.chapterId
              );
            }

            if (completed) {
              const nextScenario = await getNextScenario(
                currentScenarioContext.scenario.chapterId,
                currentScenarioContext.scenario.scenarioNumber
              );
              const chapterDone = userId
                ? await checkChapterComplete(
                    userId,
                    currentScenarioContext.scenario.chapterId
                  )
                : false;

              const metadata = {
                __completion: true,
                scenarioCompleted: true,
                chapterCompleted: chapterDone,
                nextScenario: nextScenario
                  ? {
                      id: nextScenario.id,
                      title: nextScenario.title,
                      chapterId: nextScenario.chapterId,
                      scenarioNumber: nextScenario.scenarioNumber,
                    }
                  : undefined,
              };

              const encoder = new TextEncoder();
              await writer.write(
                encoder.encode(`\n__COMPLETION_META__${JSON.stringify(metadata)}`)
              );
            }

            await writer.close();
          }
        })();

        return new Response(readable, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        });
      }

      // Non-streaming scenario path
      const turnResult = await processConversationTurn(
        scenarioContext.systemPrompt,
        conversationMessages
      );

      const correctionResult = parseCorrections(turnResult.assistantMessage);
      const correctionsPayload: CorrectionsData | null =
        correctionResult.corrections.length > 0
          ? { corrections: correctionResult.corrections }
          : null;

      if (user) {
        await saveMessage(
          user.id,
          scenarioId,
          "assistant",
          turnResult.assistantMessage,
          correctionsPayload as unknown as Record<string, unknown> | null
        );
      }

      let chapterCompleted = false;
      let nextScenarioInfo = undefined;

      if (turnResult.scenarioCompleted && user) {
        await markScenarioComplete(user.id, scenarioId);

        chapterCompleted = await checkChapterComplete(
          user.id,
          scenarioContext.scenario.chapterId
        );

        if (chapterCompleted) {
          await advanceUserProgress(
            user.id,
            scenarioContext.scenario.chapterId
          );
        }

        const nextScenario = await getNextScenario(
          scenarioContext.scenario.chapterId,
          scenarioContext.scenario.scenarioNumber
        );

        if (nextScenario) {
          nextScenarioInfo = {
            id: nextScenario.id,
            title: nextScenario.title,
            chapterId: nextScenario.chapterId,
            scenarioNumber: nextScenario.scenarioNumber,
          };
        }
      }

      return NextResponse.json({
        message: {
          role: "assistant" as const,
          content: turnResult.assistantMessage,
        },
        scenarioCompleted: turnResult.scenarioCompleted,
        chapterCompleted,
        nextScenario: nextScenarioInfo,
        usage: turnResult.usage,
      });
    }

    // --- Generic chat path (no scenario) ---
    if (acceptStream) {
      const stream = await createStreamingChatCompletion(messages);
      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    const hasSystemMessage = messages.some((m) => m.role === "system");
    const finalMessages = hasSystemMessage
      ? messages
      : [{ role: "system" as const, content: buildFallbackSystemPrompt() }, ...messages];

    const result = await createChatCompletion(finalMessages);

    return NextResponse.json({
      message: {
        role: "assistant" as const,
        content: result.content,
      },
      usage: result.usage,
    });
  } catch (error) {
    console.error("[api/chat] Error:", error);

    const errorResponse: ChatErrorResponse = {
      error: "An error occurred while processing your request.",
      code: "INTERNAL_ERROR",
    };

    if (error instanceof Error) {
      if (error.message.includes("401") || error.message.includes("Unauthorized")) {
        errorResponse.error = "Authentication failed with the AI provider.";
        errorResponse.code = "AUTH_ERROR";
        return NextResponse.json(errorResponse, { status: 502 });
      }
      if (error.message.includes("429") || error.message.includes("rate limit")) {
        errorResponse.error = "Rate limit exceeded. Please try again later.";
        errorResponse.code = "RATE_LIMIT";
        return NextResponse.json(errorResponse, { status: 429 });
      }
    }

    return NextResponse.json(errorResponse, { status: 500 });
  }
}
