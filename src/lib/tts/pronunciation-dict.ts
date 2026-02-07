/**
 * Koine Greek pronunciation dictionary loader and SSML generator.
 *
 * Loads a JSON dictionary of ~500 common NT Greek words with IPA
 * transcriptions using Buth "Living Koine" pronunciation rules.
 * Provides lookup by Greek word (with or without diacritics) and
 * an SSML generator that wraps matched words with <phoneme> tags.
 */

import { readFileSync } from "fs";
import { join } from "path";
import { polytonicToMonotonic } from "./preprocess";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DictionaryEntry {
  ipa: string;
  polytonic: string;
  inflections: string[];
}

export interface PronunciationDictionary {
  /** Direct lookup by monotonic key */
  entries: Map<string, DictionaryEntry>;
  /** Inflection -> base key mapping */
  inflectionIndex: Map<string, string>;
}

// ---------------------------------------------------------------------------
// Module-level cache
// ---------------------------------------------------------------------------

let cachedDictionary: PronunciationDictionary | null = null;

// ---------------------------------------------------------------------------
// Normalization helpers
// ---------------------------------------------------------------------------

/**
 * Normalize a Greek word for dictionary lookup:
 * - Lowercase
 * - Convert to monotonic (strip breathings, circumflex, iota subscript)
 * - Strip remaining accents (acute/tonos) so keys are plain unaccented Greek
 * - Trim whitespace
 */
export function normalizeForLookup(word: string): string {
  if (!word || typeof word !== "string") return "";
  // Lowercase first, then strip polytonic marks
  const monotonic = polytonicToMonotonic(word.trim().toLowerCase());
  // Also strip the acute/tonos accent (U+0301) to get fully unaccented form
  // NFD decompose -> remove combining acute -> NFC recompose
  const stripped = monotonic
    .normalize("NFD")
    .replace(/\u0301/g, "") // combining acute accent
    .normalize("NFC");
  return stripped;
}

/**
 * Strip punctuation from the edges of a word token, returning
 * [leadingPunct, word, trailingPunct].
 */
export function stripPunctuation(
  token: string
): [string, string, string] {
  // Match leading punctuation (including Greek punctuation marks)
  const leadMatch = token.match(
    /^([.,;:!?·;«»""''()\[\]{}\-\u2014\u2013\u2026\u0387\u037E\u00AB\u00BB]*)/
  );
  const trailMatch = token.match(
    /([.,;:!?·;«»""''()\[\]{}\-\u2014\u2013\u2026\u0387\u037E\u00AB\u00BB]*)$/
  );

  const leading = leadMatch ? leadMatch[1] : "";
  const trailing = trailMatch ? trailMatch[1] : "";

  const inner = token.slice(
    leading.length,
    token.length - (trailing.length || 0) || undefined
  );

  return [leading, inner, trailing];
}

// ---------------------------------------------------------------------------
// Dictionary loading
// ---------------------------------------------------------------------------

/**
 * Parse and validate raw dictionary JSON, building lookup maps.
 */
export function buildDictionary(
  raw: Record<string, unknown>
): PronunciationDictionary {
  const entries = new Map<string, DictionaryEntry>();
  const inflectionIndex = new Map<string, string>();

  for (const [key, value] of Object.entries(raw)) {
    // Skip metadata keys
    if (key.startsWith("_")) continue;

    // Validate entry shape
    if (!value || typeof value !== "object") {
      console.warn(
        `[pronunciation-dict] Skipping malformed entry: "${key}" (not an object)`
      );
      continue;
    }

    const entry = value as Record<string, unknown>;

    if (typeof entry.ipa !== "string" || !entry.ipa) {
      console.warn(
        `[pronunciation-dict] Skipping malformed entry: "${key}" (missing or invalid ipa)`
      );
      continue;
    }

    if (typeof entry.polytonic !== "string") {
      console.warn(
        `[pronunciation-dict] Skipping malformed entry: "${key}" (missing polytonic)`
      );
      continue;
    }

    const dictEntry: DictionaryEntry = {
      ipa: entry.ipa,
      polytonic: entry.polytonic,
      inflections: Array.isArray(entry.inflections)
        ? (entry.inflections as string[]).filter(
            (i) => typeof i === "string"
          )
        : [],
    };

    // Normalize the key for consistent lookup
    const normalizedKey = normalizeForLookup(key);
    if (normalizedKey) {
      entries.set(normalizedKey, dictEntry);
    }

    // Index inflections back to the base key
    for (const inflection of dictEntry.inflections) {
      const normalizedInflection = normalizeForLookup(inflection);
      if (normalizedInflection && !entries.has(normalizedInflection)) {
        inflectionIndex.set(normalizedInflection, normalizedKey);
      }
    }
  }

  return { entries, inflectionIndex };
}

/**
 * Load the pronunciation dictionary from the JSON file.
 * The dictionary is cached in memory after the first load.
 *
 * @param dictPath - Optional custom path to dictionary JSON file.
 *   Defaults to the bundled `data/pronunciation-dict.json`.
 * @returns The loaded and indexed pronunciation dictionary.
 * @throws Error if the dictionary file is missing or unreadable.
 */
export function loadDictionary(dictPath?: string): PronunciationDictionary {
  if (cachedDictionary) return cachedDictionary;

  const filePath =
    dictPath ?? join(__dirname, "data", "pronunciation-dict.json");

  let rawJson: string;
  try {
    rawJson = readFileSync(filePath, "utf-8");
  } catch (err) {
    const message =
      err instanceof Error ? err.message : String(err);
    throw new Error(
      `[pronunciation-dict] Failed to load dictionary file at "${filePath}": ${message}`
    );
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(rawJson) as Record<string, unknown>;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : String(err);
    throw new Error(
      `[pronunciation-dict] Failed to parse dictionary JSON: ${message}`
    );
  }

  cachedDictionary = buildDictionary(parsed);
  return cachedDictionary;
}

/**
 * Clear the cached dictionary (useful for testing).
 */
export function clearDictionaryCache(): void {
  cachedDictionary = null;
}

// ---------------------------------------------------------------------------
// Lookup
// ---------------------------------------------------------------------------

/**
 * Look up a Greek word in the dictionary, returning the matching entry
 * or undefined if not found. Handles both polytonic and monotonic input.
 */
export function lookupWord(
  dict: PronunciationDictionary,
  word: string
): DictionaryEntry | undefined {
  const normalized = normalizeForLookup(word);
  if (!normalized) return undefined;

  // Direct match
  const direct = dict.entries.get(normalized);
  if (direct) return direct;

  // Inflection match
  const baseKey = dict.inflectionIndex.get(normalized);
  if (baseKey) {
    return dict.entries.get(baseKey);
  }

  return undefined;
}

// ---------------------------------------------------------------------------
// SSML generation
// ---------------------------------------------------------------------------

/**
 * Generate SSML from Greek text, wrapping words found in the dictionary
 * with `<phoneme>` tags using IPA pronunciation.
 *
 * Words not in the dictionary pass through unchanged.
 * Punctuation adjacent to words is preserved outside the phoneme tags.
 *
 * @param text - Input Greek text.
 * @param dict - Loaded pronunciation dictionary.
 * @returns SSML string with `<phoneme>` tags for matched words.
 */
export function generateSSML(
  text: string,
  dict: PronunciationDictionary
): string {
  if (!text || typeof text !== "string") return "<speak></speak>";

  // Split on whitespace while preserving whitespace tokens
  const tokens = text.split(/(\s+)/);

  const parts: string[] = [];

  for (const token of tokens) {
    // Whitespace token — pass through
    if (/^\s+$/.test(token)) {
      parts.push(token);
      continue;
    }

    // Empty token — skip
    if (!token) continue;

    const [leading, word, trailing] = stripPunctuation(token);

    if (!word) {
      // Token was all punctuation
      parts.push(token);
      continue;
    }

    const entry = lookupWord(dict, word);

    if (entry) {
      parts.push(
        `${leading}<phoneme alphabet="ipa" ph="${entry.ipa}">${word}</phoneme>${trailing}`
      );
    } else {
      parts.push(token);
    }
  }

  return `<speak>${parts.join("")}</speak>`;
}
