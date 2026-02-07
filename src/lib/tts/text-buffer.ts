/**
 * Text buffer utility for streaming TTS.
 *
 * Accumulates text chunks and flushes at sentence boundaries
 * (period, exclamation, question mark, semicolon, or Greek ano teleia).
 * This ensures TTS synthesis receives complete sentences for natural prosody.
 */

/**
 * Regex matching sentence-ending punctuation followed by optional whitespace.
 * Includes Greek ano teleia (U+0387 and middle dot U+00B7) and standard punctuation.
 */
const SENTENCE_BOUNDARY_RE = /[.!?;\u0387\u00B7]\s*/g;

/**
 * Minimum character threshold before flushing even without a sentence boundary.
 * Prevents indefinite buffering when text has no punctuation.
 */
const MAX_BUFFER_LENGTH = 200;

/**
 * Minimum character threshold for a flush. Very short fragments produce
 * poor TTS output, so we wait for at least this many characters.
 */
const MIN_FLUSH_LENGTH = 3;

export interface TextBufferOptions {
  /** Max chars to buffer before force-flushing. Default: 200 */
  maxBufferLength?: number;
  /** Min chars required for a flush. Default: 3 */
  minFlushLength?: number;
}

/**
 * Create a text buffer that accumulates streaming text chunks and
 * yields complete sentences for TTS synthesis.
 */
export class TextBuffer {
  private buffer = "";
  private readonly maxBufferLength: number;
  private readonly minFlushLength: number;

  constructor(options: TextBufferOptions = {}) {
    this.maxBufferLength = options.maxBufferLength ?? MAX_BUFFER_LENGTH;
    this.minFlushLength = options.minFlushLength ?? MIN_FLUSH_LENGTH;
  }

  /**
   * Add a text chunk to the buffer. Returns an array of complete
   * sentences ready for TTS synthesis (may be empty if no boundary found yet).
   */
  add(chunk: string): string[] {
    this.buffer += chunk;
    return this.extractSentences();
  }

  /**
   * Flush any remaining buffered text. Call this when the stream ends
   * to ensure no text is left unsynthesized.
   */
  flush(): string | null {
    const remaining = this.buffer.trim();
    this.buffer = "";
    return remaining.length > 0 ? remaining : null;
  }

  /**
   * Get the current buffer contents without modifying state.
   */
  peek(): string {
    return this.buffer;
  }

  /**
   * Reset the buffer, discarding any accumulated text.
   */
  reset(): void {
    this.buffer = "";
  }

  /**
   * Extract complete sentences from the buffer.
   * Returns an array of sentence strings, leaving any incomplete
   * trailing text in the buffer.
   */
  private extractSentences(): string[] {
    const sentences: string[] = [];

    // Find the last sentence boundary position
    let lastBoundary = -1;
    SENTENCE_BOUNDARY_RE.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = SENTENCE_BOUNDARY_RE.exec(this.buffer)) !== null) {
      const endPos = match.index + match[0].length;
      lastBoundary = endPos;
    }

    // If we found a sentence boundary, extract everything up to it
    if (lastBoundary > 0) {
      const complete = this.buffer.substring(0, lastBoundary).trim();
      this.buffer = this.buffer.substring(lastBoundary);

      if (complete.length >= this.minFlushLength) {
        sentences.push(complete);
      } else if (complete.length > 0) {
        // Too short -- prepend back and wait for more text
        this.buffer = complete + " " + this.buffer;
      }
    }

    // Force flush if buffer exceeds max length with no boundary in sight
    if (this.buffer.length >= this.maxBufferLength) {
      // Try to break at a word boundary
      const wordBreak = this.buffer.lastIndexOf(" ", this.maxBufferLength);
      if (wordBreak > this.minFlushLength) {
        const chunk = this.buffer.substring(0, wordBreak).trim();
        this.buffer = this.buffer.substring(wordBreak + 1);
        if (chunk.length > 0) {
          sentences.push(chunk);
        }
      } else {
        // No good word boundary, flush everything
        const chunk = this.buffer.trim();
        this.buffer = "";
        if (chunk.length > 0) {
          sentences.push(chunk);
        }
      }
    }

    return sentences;
  }
}

/**
 * Detect sentence boundaries in text. Returns the index after the last
 * complete sentence, or -1 if no boundary is found.
 *
 * Exported for unit testing.
 */
export function findLastSentenceBoundary(text: string): number {
  let lastBoundary = -1;
  SENTENCE_BOUNDARY_RE.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = SENTENCE_BOUNDARY_RE.exec(text)) !== null) {
    lastBoundary = match.index + match[0].length;
  }

  return lastBoundary;
}
