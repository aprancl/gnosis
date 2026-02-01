/**
 * Correction parsing utility for extracting inline corrections from
 * assistant messages.
 *
 * The AI agent provides corrections in several formats within its Greek responses:
 *
 * 1. Parenthetical corrections with explicit indicators:
 *    "...word (correction: X should be Y -- explanation)..."
 *    "...word (X is nominative -- Y would be accusative)..."
 *
 * 2. Asterisk-wrapped corrections:
 *    "...the correct form is *corrected_word*..."
 *
 * 3. Bracket-wrapped corrections:
 *    "...[corrected_word] instead of original_word..."
 *
 * The parser detects these patterns, extracts structured correction data,
 * and returns the cleaned content alongside the corrections array.
 */

import type { Correction, CorrectionParseResult } from "@/types/corrections";

// ---------------------------------------------------------------------------
// Correction pattern matchers
// ---------------------------------------------------------------------------

/**
 * Pattern 1: Parenthetical correction with "should be", "not", or "--" indicators.
 *
 * Matches patterns like:
 * - "(ἄρτον is accusative -- correct here! / ἄρτου would be genitive)"
 * - "(should be ἄρτον, not ἄρτος)"
 * - "(correction: use ἄρτον instead of ἄρτος)"
 * - "(ἄρτος → ἄρτον)"
 */
const PAREN_CORRECTION_PATTERNS: RegExp[] = [
  // "(should be X, not Y)" or "(should be X not Y)"
  /\(should\s+be\s+(.+?)[,;]\s*not\s+(.+?)\)/gi,
  // "(correction: use X instead of Y)"
  /\(correction:\s*(?:use\s+)?(.+?)\s+instead\s+of\s+(.+?)\)/gi,
  // "(X → Y)" or "(X -> Y)"
  /\((\S+?)\s*(?:→|->)\s*(\S+?)\)/g,
  // "(X, not Y)" where X and Y are single words
  /\((\S+?)[,;]\s*not\s+(\S+?)\)/gi,
];

/**
 * Pattern 2: Parenthetical explanation with grammar terms.
 *
 * Matches patterns like:
 * - "(ἄρτον is accusative -- ἄρτου would be genitive)"
 * - "(nominative: ἄρτος, but here we need accusative: ἄρτον)"
 */
const GRAMMAR_EXPLANATION_PATTERN =
  /\(([^)]{8,120}(?:nominative|accusative|genitive|dative|vocative|singular|plural|aorist|imperfect|present|future|perfect|indicative|subjunctive|imperative|infinitive|participle)[^)]{0,120})\)/gi;

/**
 * Pattern 3: Asterisk-wrapped corrections (e.g., *corrected_word*).
 * These are common markdown-style emphasis used to highlight the correct form.
 * Only matches single words or short phrases (up to 40 chars) between asterisks.
 */
const ASTERISK_CORRECTION_PATTERN = /\*([^*\n]{1,40})\*/g;

/**
 * Pattern 4: Bracket-wrapped corrections (e.g., [corrected_word]).
 * Sometimes used to denote the correct form explicitly.
 * Excludes [SCENARIO_COMPLETE] and other system markers.
 */
const BRACKET_CORRECTION_PATTERN = /\[([^\]\n]{1,40})\]/g;

const SYSTEM_MARKERS = ["SCENARIO_COMPLETE"];

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

/**
 * Parse an assistant message and extract inline corrections.
 *
 * @param content - The raw assistant message content
 * @returns Parsed result with cleaned content and corrections array
 */
export function parseCorrections(content: string): CorrectionParseResult {
  const corrections: Correction[] = [];

  // --- Pass 1: Explicit parenthetical corrections ---
  for (const pattern of PAREN_CORRECTION_PATTERNS) {
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      const fullMatch = match[0];
      const position = match.index;

      // Determine which capture group is "corrected" vs "original"
      // For "should be X, not Y" => X is corrected, Y is original
      // For "correction: use X instead of Y" => X is corrected, Y is original
      // For "X → Y" => X is original, Y is corrected
      // For "X, not Y" => X is corrected, Y is original
      const isArrowPattern = fullMatch.includes("→") || fullMatch.includes("->");

      const corrected = isArrowPattern ? match[2].trim() : match[1].trim();
      const original = isArrowPattern ? match[1].trim() : match[2].trim();

      corrections.push({
        original,
        corrected,
        explanation: fullMatch.replace(/^\(/, "").replace(/\)$/, "").trim(),
        position,
      });
    }
  }

  // --- Pass 2: Grammar explanation parentheticals ---
  {
    GRAMMAR_EXPLANATION_PATTERN.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = GRAMMAR_EXPLANATION_PATTERN.exec(content)) !== null) {
      const explanation = match[1].trim();
      const position = match.index;

      // Avoid duplicates from Pass 1
      const isDuplicate = corrections.some(
        (c) => Math.abs(c.position - position) < 5
      );
      if (isDuplicate) continue;

      // Try to extract original/corrected from the explanation text
      const parsed = parseGrammarExplanation(explanation);
      corrections.push({
        original: parsed.original,
        corrected: parsed.corrected,
        explanation,
        position,
      });
    }
  }

  // --- Pass 3: Asterisk-wrapped corrections ---
  {
    ASTERISK_CORRECTION_PATTERN.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = ASTERISK_CORRECTION_PATTERN.exec(content)) !== null) {
      const correctedWord = match[1].trim();
      const position = match.index;

      // Skip if it looks like regular emphasis (common English words, etc.)
      if (correctedWord.length < 2) continue;

      // Avoid duplicates
      const isDuplicate = corrections.some(
        (c) =>
          c.corrected === correctedWord || Math.abs(c.position - position) < 5
      );
      if (isDuplicate) continue;

      corrections.push({
        original: "",
        corrected: correctedWord,
        explanation: "Corrected form",
        position,
      });
    }
  }

  // --- Pass 4: Bracket-wrapped corrections ---
  {
    BRACKET_CORRECTION_PATTERN.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = BRACKET_CORRECTION_PATTERN.exec(content)) !== null) {
      const bracketContent = match[1].trim();
      const position = match.index;

      // Skip system markers
      if (SYSTEM_MARKERS.includes(bracketContent)) continue;

      // Skip if it looks like a simple reference/label
      if (bracketContent.length < 2) continue;

      // Avoid duplicates
      const isDuplicate = corrections.some(
        (c) =>
          c.corrected === bracketContent || Math.abs(c.position - position) < 5
      );
      if (isDuplicate) continue;

      corrections.push({
        original: "",
        corrected: bracketContent,
        explanation: "Corrected form",
        position,
      });
    }
  }

  // Sort corrections by position
  corrections.sort((a, b) => a.position - b.position);

  return {
    cleanedContent: content,
    corrections,
  };
}

// ---------------------------------------------------------------------------
// Helper: parse grammar explanation text
// ---------------------------------------------------------------------------

/**
 * Attempt to extract original and corrected forms from a grammar explanation.
 *
 * E.g., "ἄρτον is accusative -- ἄρτου would be genitive"
 *   => original: "ἄρτου", corrected: "ἄρτον"
 *
 * If extraction fails, returns the explanation as both original and corrected.
 */
function parseGrammarExplanation(text: string): {
  original: string;
  corrected: string;
} {
  // Pattern: "X is CASE -- Y would be CASE"
  const dashPattern = /(\S+)\s+is\s+\w+\s*--\s*(\S+)\s+would\s+be/i;
  const dashMatch = text.match(dashPattern);
  if (dashMatch) {
    return { original: dashMatch[2], corrected: dashMatch[1] };
  }

  // Pattern: "CASE: X, but here we need CASE: Y"
  const butPattern =
    /\w+:\s*(\S+)[,;]\s*but\s+(?:here\s+)?(?:we\s+)?need\s+\w+:\s*(\S+)/i;
  const butMatch = text.match(butPattern);
  if (butMatch) {
    return { original: butMatch[1], corrected: butMatch[2] };
  }

  // Fallback: extract the first Greek-looking word as the corrected form
  const greekWordMatch = text.match(/[\u0370-\u03FF\u1F00-\u1FFF]+/);
  if (greekWordMatch) {
    return { original: "", corrected: greekWordMatch[0] };
  }

  return { original: "", corrected: text.substring(0, 20) };
}

/**
 * Check if a message contains any correction patterns.
 * Lighter-weight check than full parsing for quick filtering.
 */
export function hasCorrections(content: string): boolean {
  // Quick check for common correction indicators
  if (/\((?:should\s+be|correction:|not\s+\w)/i.test(content)) return true;
  if (/\(\S+\s*(?:→|->)\s*\S+\)/.test(content)) return true;
  if (GRAMMAR_EXPLANATION_PATTERN.test(content)) {
    GRAMMAR_EXPLANATION_PATTERN.lastIndex = 0;
    return true;
  }
  if (/\*[^*\n]{1,40}\*/.test(content)) return true;
  if (/\[[^\]\n]{2,40}\]/.test(content)) {
    // Make sure it's not just [SCENARIO_COMPLETE]
    const brackets = content.match(/\[([^\]\n]{2,40})\]/g) || [];
    return brackets.some(
      (b) => !SYSTEM_MARKERS.includes(b.slice(1, -1))
    );
  }
  return false;
}
