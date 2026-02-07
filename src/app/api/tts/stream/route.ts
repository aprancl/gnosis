/** Force dynamic rendering -- streaming TTS cannot be cached */
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getOrCreateUser } from "@/server/auth";
import {
  synthesize,
  TTSRateLimitError,
  TTSTimeoutError,
  TTSApiError,
  TTSError,
} from "@/lib/tts/google-cloud";
import { polytonicToMonotonic } from "@/lib/tts/preprocess";
import { loadDictionary, generateSSML } from "@/lib/tts/pronunciation-dict";
import { checkRateLimit } from "@/app/api/tts/route";
import { logTTSRequest, logTTSError, startTimer } from "@/lib/tts/logger";

/**
 * Split text into sentences for chunk-by-chunk synthesis.
 * Keeps punctuation attached to the sentence.
 */
function splitIntoSentences(text: string): string[] {
  // Match sentences ending with punctuation (including Greek ano teleia)
  const sentences: string[] = [];
  const re = /[^.!?;\u0387·]*[.!?;\u0387·]+[\s]*/g;
  let match: RegExpExecArray | null;
  let lastIndex = 0;

  while ((match = re.exec(text)) !== null) {
    lastIndex = re.lastIndex;
    const sentence = match[0].trim();
    if (sentence.length > 0) {
      sentences.push(sentence);
    }
  }

  // Handle trailing text without punctuation
  if (lastIndex < text.length) {
    const trailing = text.slice(lastIndex).trim();
    if (trailing.length > 0) {
      sentences.push(trailing);
    }
  }

  return sentences;
}

/**
 * POST /api/tts/stream
 *
 * Accepts { text: string } and returns a streaming response where each
 * sentence is synthesized independently and streamed as binary audio chunks.
 *
 * The response uses a simple framing protocol:
 * - Each chunk is prefixed with a 4-byte big-endian uint32 length header
 * - Followed by that many bytes of MP3 audio data
 * - A final 4-byte zero-length header signals end of stream
 *
 * This allows the client to reassemble individual audio chunks for
 * sequential playback while synthesis happens in parallel with playback.
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Authentication
    const user = await getOrCreateUser();
    if (!user) {
      return NextResponse.json(
        { error: "Authentication required", code: "UNAUTHORIZED" },
        { status: 401 }
      );
    }

    // 2. Rate limiting
    const retryAfter = checkRateLimit(user.id);
    if (retryAfter > 0) {
      return NextResponse.json(
        { error: "Rate limit exceeded. Please try again later.", code: "RATE_LIMIT" },
        {
          status: 429,
          headers: { "Retry-After": String(retryAfter) },
        }
      );
    }

    // 3. Parse request body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON in request body", code: "INVALID_REQUEST" },
        { status: 400 }
      );
    }

    if (
      !body ||
      typeof body !== "object" ||
      typeof (body as Record<string, unknown>).text !== "string" ||
      ((body as Record<string, unknown>).text as string).trim() === ""
    ) {
      return NextResponse.json(
        { error: "Missing required field: text (non-empty string)", code: "INVALID_REQUEST" },
        { status: 400 }
      );
    }

    const text = ((body as Record<string, unknown>).text as string).trim();

    // 4. Split text into sentences
    const sentences = splitIntoSentences(text);
    if (sentences.length === 0) {
      return NextResponse.json(
        { error: "Text must not be empty", code: "INVALID_REQUEST" },
        { status: 400 }
      );
    }

    // 5. Load pronunciation dictionary once
    let dict: ReturnType<typeof loadDictionary> | null = null;
    try {
      dict = loadDictionary();
    } catch {
      // Fall back to plain SSML if dictionary fails
    }

    // 6. Stream audio chunks
    const { readable, writable } = new TransformStream<Uint8Array>();
    const writer = writable.getWriter();

    // Process sentences in background
    (async () => {
      try {
        let sentenceIndex = 0;
        for (const sentence of sentences) {
          // Generate SSML for this sentence
          let ssmlText: string;
          const preprocessed = polytonicToMonotonic(sentence);
          if (dict) {
            ssmlText = generateSSML(preprocessed, dict);
          } else {
            ssmlText = `<speak>${preprocessed}</speak>`;
          }

          // Synthesize this sentence
          const elapsed = startTimer();
          const result = await synthesize({
            text: ssmlText,
            ssml: true,
            audioEncoding: "MP3",
          });
          const latencyMs = elapsed();

          if (result.audioContent.length > 0) {
            // Write length header (4 bytes, big-endian)
            const header = new Uint8Array(4);
            const view = new DataView(header.buffer);
            view.setUint32(0, result.audioContent.length, false);
            await writer.write(header);

            // Write audio data
            await writer.write(new Uint8Array(result.audioContent));
          }

          logTTSRequest({
            userId: user.id,
            chars: result.characterCount,
            format: "mp3",
            provider: "google-cloud",
            latencyMs,
            cacheHit: false,
            streaming: true,
            sentenceIndex,
          });
          sentenceIndex++;
        }

        // Write end-of-stream marker (zero-length header)
        const endMarker = new Uint8Array(4);
        await writer.write(endMarker);
      } catch (error) {
        console.error("[api/tts/stream] Synthesis error:", error);
        logTTSError(user.id, error, { endpoint: "/api/tts/stream", streaming: true });
        // Try to write error info before closing
        // In practice the client should handle incomplete streams gracefully
      } finally {
        await writer.close();
      }
    })();

    return new Response(readable, {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Cache-Control": "no-cache",
        "Transfer-Encoding": "chunked",
      },
    });
  } catch (error) {
    console.error("[api/tts/stream] Error:", error);
    logTTSError("unknown", error, { endpoint: "/api/tts/stream" });

    if (error instanceof TTSRateLimitError) {
      return NextResponse.json(
        { error: "TTS provider rate limit exceeded", code: "RATE_LIMIT" },
        { status: 429 }
      );
    }

    if (error instanceof TTSTimeoutError) {
      return NextResponse.json(
        { error: "TTS synthesis timed out", code: "TIMEOUT" },
        { status: 502 }
      );
    }

    if (error instanceof TTSApiError) {
      return NextResponse.json(
        { error: `TTS synthesis failed: ${error.message}`, code: "TTS_ERROR" },
        { status: 502 }
      );
    }

    if (error instanceof TTSError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: 502 }
      );
    }

    return NextResponse.json(
      { error: "An unexpected error occurred", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
