/**
 * Rules-based Koine Era Pronunciation (KEP) phonemizer.
 *
 * Converts any Greek text to KEP IPA and wraps every word in SSML
 * <phoneme> tags so Google Cloud TTS produces KEP pronunciation
 * instead of Modern Greek defaults.
 *
 * The pronunciation dictionary (pronunciation-dict.ts) serves as an
 * override layer for irregular words. Words not in the dictionary
 * get systematic rules-based IPA.
 *
 * KEP vs Modern Greek — key differences:
 *   η → /eː/ (not /i/)
 *   υ → /y/  (not /i/)
 *   ω → /oː/ (not /o/)
 *   αι → /ɛ/  (not /e/)
 *   οι → /yː/ (not /i/)
 *   β → /b/   (not /v/)
 *   γ → /g/   (not /ɣ/)
 *   δ → /d/   (not /ð/)
 *   ζ → /zd/  (not /z/)
 *   θ → /tʰ/  (not /θ/)
 *   φ → /pʰ/  (not /f/)
 *   χ → /kʰ/  (not /x/)
 */

import {
  type PronunciationDictionary,
  lookupWord,
  stripPunctuation,
} from "./pronunciation-dict";

// ---------------------------------------------------------------------------
// Phoneme mapping tables
// ---------------------------------------------------------------------------

/**
 * Voiceless consonant letters — used for αυ/ευ/ηυ context rules.
 * Before these (or word-finally), the fricative is voiceless (/f/).
 */
const VOICELESS = new Set([
  "κ", "π", "τ", "θ", "φ", "χ", "ξ", "ψ", "σ", "ς",
]);

/**
 * Diphthong mappings. Order matters — longer sequences first.
 * Context-dependent diphthongs (αυ, ευ, ηυ) are handled separately.
 */
const DIPHTHONGS: [string, string][] = [
  ["ου", "uː"],
  ["αι", "ɛ"],
  ["ει", "iː"],
  ["οι", "yː"],
  ["υι", "yːi"],
];

/**
 * Consonant cluster mappings. Checked before individual consonants.
 */
const CONSONANT_CLUSTERS: [string, string][] = [
  ["γγ", "ŋg"],
  ["γκ", "ŋk"],
  ["γξ", "ŋks"],
  ["γχ", "ŋkʰ"],
  ["μπ", "mb"],
  ["ντ", "nd"],
  ["τσ", "ts"],
  ["τζ", "dz"],
];

/**
 * Individual consonant mappings (KEP pronunciation).
 */
const CONSONANTS: Record<string, string> = {
  β: "b",
  γ: "g",
  δ: "d",
  ζ: "zd",
  θ: "tʰ",
  κ: "k",
  λ: "l",
  μ: "m",
  ν: "n",
  ξ: "ks",
  π: "p",
  ρ: "r",
  σ: "s",
  ς: "s",
  τ: "t",
  φ: "pʰ",
  χ: "kʰ",
  ψ: "ps",
};

/**
 * Individual vowel mappings (KEP pronunciation).
 */
const VOWELS: Record<string, string> = {
  α: "a",
  ε: "e",
  η: "eː",
  ι: "i",
  ο: "o",
  υ: "y",
  ω: "oː",
};

// ---------------------------------------------------------------------------
// Rough breathing detection
// ---------------------------------------------------------------------------

/**
 * Detect rough breathing in a polytonic Greek word.
 * Rough breathing (dasia) means the word starts with an /h/ sound.
 *
 * Checks for:
 * - Combining reversed comma above (U+0314) after NFD decomposition
 * - Precomposed Greek Extended characters with rough breathing (U+1F00-1FFF odd offsets)
 */
export function hasRoughBreathing(word: string): boolean {
  if (!word) return false;

  // Check NFD form for combining rough breathing mark
  const nfd = word.normalize("NFD");
  if (nfd.includes("\u0314")) return true;

  // Check for precomposed rough breathing characters in Greek Extended block
  // In U+1F00-1F6F, odd code points have rough breathing
  // e.g., ἁ=1F01, ἃ=1F03, ἅ=1F05, ἇ=1F07, Ἁ=1F09, etc.
  for (const char of word) {
    const cp = char.codePointAt(0)!;
    if (cp >= 0x1f00 && cp <= 0x1f6f && cp % 2 === 1) return true;
    // Also check vowels with rough breathing + accent (U+1F80-1FFF ranges)
    if (cp >= 0x1f80 && cp <= 0x1faf && cp % 2 === 1) return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Core phonemizer
// ---------------------------------------------------------------------------

/**
 * Check if a character is a Greek letter (lowercase).
 */
function isGreekLetter(ch: string): boolean {
  const cp = ch.codePointAt(0)!;
  // Basic Greek lowercase: α(0x03B1) through ω(0x03C9), plus ς(0x03C2)
  return (cp >= 0x03b1 && cp <= 0x03c9) || cp === 0x03c2;
}

/**
 * Strip all diacritics from a Greek word, returning plain lowercase Greek.
 * Used internally for grapheme-to-phoneme processing.
 */
export function stripToBaseGreek(word: string): string {
  return word
    .normalize("NFD")
    .replace(/[\u0300-\u036f\u0342\u0345\u1dc0-\u1dff]/g, "")
    .normalize("NFC")
    .toLowerCase();
}

/**
 * Convert a single Greek word to KEP IPA using rules-based mapping.
 *
 * @param polytonicWord - Greek word (may include polytonic diacritics)
 * @returns KEP IPA string
 */
export function greekToKEPIpa(polytonicWord: string): string {
  if (!polytonicWord) return "";

  const ipa: string[] = [];

  // Detect rough breathing before stripping diacritics
  const addH = hasRoughBreathing(polytonicWord);

  // Strip to plain lowercase Greek for rule application
  const word = stripToBaseGreek(polytonicWord);

  if (addH) {
    ipa.push("h");
  }

  let i = 0;
  while (i < word.length) {
    const ch = word[i];

    // Skip non-Greek characters (pass through)
    if (!isGreekLetter(ch)) {
      ipa.push(ch);
      i++;
      continue;
    }

    // --- Context-dependent diphthongs: αυ, ευ, ηυ ---
    if (
      (ch === "α" || ch === "ε" || ch === "η") &&
      i + 1 < word.length &&
      word[i + 1] === "υ"
    ) {
      const vowelBase = ch === "α" ? "a" : ch === "ε" ? "e" : "eː";
      // Check what follows the υ
      const next = i + 2 < word.length ? word[i + 2] : null;
      const isVoiceless = next === null || VOICELESS.has(next);
      ipa.push(vowelBase + (isVoiceless ? "f" : "v"));
      i += 2;
      continue;
    }

    // --- Standard diphthongs ---
    let matchedDiphthong = false;
    if (i + 1 < word.length) {
      const digraph = word[i] + word[i + 1];
      for (const [pattern, phoneme] of DIPHTHONGS) {
        if (digraph === pattern) {
          ipa.push(phoneme);
          i += 2;
          matchedDiphthong = true;
          break;
        }
      }
    }
    if (matchedDiphthong) continue;

    // --- Consonant clusters ---
    let matchedCluster = false;
    if (i + 1 < word.length) {
      const digraph = word[i] + word[i + 1];
      for (const [pattern, phoneme] of CONSONANT_CLUSTERS) {
        if (digraph === pattern) {
          ipa.push(phoneme);
          i += 2;
          matchedCluster = true;
          break;
        }
      }
    }
    if (matchedCluster) continue;

    // --- Individual consonants ---
    if (CONSONANTS[ch]) {
      ipa.push(CONSONANTS[ch]);
      i++;
      continue;
    }

    // --- Individual vowels ---
    if (VOWELS[ch]) {
      ipa.push(VOWELS[ch]);
      i++;
      continue;
    }

    // Unknown character — pass through
    ipa.push(ch);
    i++;
  }

  return ipa.join("");
}

// ---------------------------------------------------------------------------
// SSML generation
// ---------------------------------------------------------------------------

/**
 * Generate SSML from Greek text with KEP pronunciation for ALL words.
 *
 * For each Greek word:
 * 1. Check the pronunciation dictionary (manual overrides for irregular words)
 * 2. If not in dictionary, apply rules-based KEP phonemizer
 * 3. Wrap in <phoneme> tag with IPA
 *
 * Non-Greek text passes through unchanged.
 *
 * @param text - Input Greek text (polytonic or monotonic)
 * @param dict - Optional pronunciation dictionary for overrides
 * @returns SSML string with <phoneme> tags for all Greek words
 */
export function generateKEPSSML(
  text: string,
  dict?: PronunciationDictionary,
): string {
  if (!text || typeof text !== "string") return "<speak></speak>";

  const tokens = text.split(/(\s+)/);
  const parts: string[] = [];

  for (const token of tokens) {
    // Whitespace — pass through
    if (/^\s+$/.test(token)) {
      parts.push(token);
      continue;
    }

    if (!token) continue;

    const [leading, word, trailing] = stripPunctuation(token);

    if (!word) {
      parts.push(token);
      continue;
    }

    // Check if this word contains Greek characters
    const hasGreek = [...stripToBaseGreek(word)].some(isGreekLetter);

    if (!hasGreek) {
      // Non-Greek word — pass through
      parts.push(token);
      continue;
    }

    // 1. Check dictionary override first
    let ipa: string | undefined;
    if (dict) {
      const entry = lookupWord(dict, word);
      if (entry) {
        ipa = entry.ipa;
      }
    }

    // 2. If not in dictionary, apply rules-based phonemizer
    if (!ipa) {
      ipa = greekToKEPIpa(word);
    }

    // 3. Wrap in SSML phoneme tag
    if (ipa) {
      parts.push(
        `${leading}<phoneme alphabet="ipa" ph="${ipa}">${word}</phoneme>${trailing}`,
      );
    } else {
      parts.push(token);
    }
  }

  return `<speak>${parts.join("")}</speak>`;
}
