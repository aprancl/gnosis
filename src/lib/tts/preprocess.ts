/**
 * Polytonic-to-monotonic Greek text preprocessing.
 *
 * Modern Greek TTS engines expect monotonic orthography. This module strips
 * polytonic combining diacriticals (grave, circumflex/perispomeni, smooth
 * breathing, rough breathing, iota subscript) while preserving diaeresis
 * marks that affect pronunciation, then recomposes with NFC.
 *
 * Only Greek Unicode ranges are processed; Latin/English text passes through
 * unchanged.
 */

// Combining diacriticals to strip (after NFD decomposition)
const POLYTONIC_MARKS = new Set([
  "\u0300", // combining grave accent
  "\u0342", // combining Greek perispomeni (circumflex)
  "\u0313", // combining comma above (smooth breathing / psili)
  "\u0314", // combining reversed comma above (rough breathing / dasia)
  "\u0345", // combining Greek ypogegrammeni (iota subscript)
]);

// Greek Unicode block ranges (Basic Greek + Extended Greek)
// U+0370-03FF  Greek and Coptic
// U+1F00-1FFF  Greek Extended
const GREEK_RANGE_RE =
  /[\u0370-\u03FF\u1F00-\u1FFF][\u0300-\u036F\u1DC0-\u1DFF\u0342\u0345]*/;

/**
 * Returns true when a code point (before decomposition) belongs to a Greek
 * Unicode block, so we know its combining marks should be filtered.
 */
function isGreekCodePoint(cp: number): boolean {
  return (
    (cp >= 0x0370 && cp <= 0x03ff) || // Greek and Coptic
    (cp >= 0x1f00 && cp <= 0x1fff) // Greek Extended
  );
}

/**
 * Returns true when the code point is a combining mark that can follow
 * a Greek base character after NFD decomposition.
 */
function isCombiningMark(cp: number): boolean {
  return (
    (cp >= 0x0300 && cp <= 0x036f) || // Combining Diacritical Marks
    (cp >= 0x1dc0 && cp <= 0x1dff) || // Combining Diacritical Marks Supplement
    cp === 0x0342 || // perispomeni (falls inside 0300-036F but listed for clarity)
    cp === 0x0345 // ypogegrammeni
  );
}

/**
 * Convert polytonic Greek text to monotonic form suitable for Modern Greek
 * TTS engines.
 *
 * @param text - Input text, possibly containing polytonic Greek diacritics.
 * @returns Monotonic-normalised text. Returns empty string for null/undefined/empty input.
 */
export function polytonicToMonotonic(text: unknown): string {
  // Handle invalid / empty input gracefully
  if (text == null) return "";
  if (typeof text !== "string") return "";
  if (text.trim() === "") return "";

  // Step 1: NFD decomposition — splits precomposed characters into base + combining marks
  const decomposed = text.normalize("NFD");

  // Step 2: Walk the decomposed string, stripping polytonic marks only after Greek bases
  let result = "";
  let lastBaseIsGreek = false;

  for (const char of decomposed) {
    const cp = char.codePointAt(0)!;

    if (isCombiningMark(cp)) {
      // We are on a combining mark — decide whether to keep or strip it
      if (lastBaseIsGreek && POLYTONIC_MARKS.has(char)) {
        // Strip this polytonic mark from a Greek character
        continue;
      }
      // Keep the mark (e.g. diaeresis U+0308, acute U+0301, or marks on non-Greek text)
      result += char;
    } else {
      // Base character — track whether it is Greek
      lastBaseIsGreek = isGreekCodePoint(cp);
      result += char;
    }
  }

  // Step 3: NFC recomposition
  return result.normalize("NFC");
}
