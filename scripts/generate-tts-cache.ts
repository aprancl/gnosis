#!/usr/bin/env npx tsx
/**
 * Pre-generate and cache TTS audio for all curriculum vocabulary.
 *
 * Loads vocabulary from seed-scenarios.ts, generates SSML via the
 * pronunciation dictionary, synthesizes audio via Google Cloud TTS,
 * and stores results in the S3 audio cache.
 *
 * Usage:
 *   npx tsx scripts/generate-tts-cache.ts
 *   npx tsx scripts/generate-tts-cache.ts --dry-run
 *   npx tsx scripts/generate-tts-cache.ts --concurrency 5
 */

import { seedChapters } from "../src/lib/data/seed-scenarios";
import {
  loadDictionary,
  generateSSML,
} from "../src/lib/tts/pronunciation-dict";
import { synthesize } from "../src/lib/tts/google-cloud";
import type { VoiceModel } from "../src/lib/tts/google-cloud";
import {
  generateCacheKey,
  getCachedAudio,
  setCachedAudio,
  isCacheEnabled,
} from "../src/lib/tts/cache";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DEFAULT_CONCURRENCY = 3;
const DEFAULT_VOICE: VoiceModel = "el-GR-Wavenet-A";
const DICT_VERSION = "1.0.0";
const AUDIO_FORMAT = "mp3" as const;

// ---------------------------------------------------------------------------
// Vocabulary extraction
// ---------------------------------------------------------------------------

/**
 * Extract Greek words from the targetVocabulary arrays of all chapters.
 *
 * Each vocabulary entry has the format:
 *   "greekWord (transliteration) - definition"
 *
 * This function extracts just the Greek word (the part before the first
 * opening parenthesis or dash). Entries with multiple comma-separated words
 * (e.g. number lists) are split into individual words.
 *
 * @returns Deduplicated array of Greek vocabulary words.
 */
export function extractVocabulary(): string[] {
  const words = new Set<string>();

  for (const chapter of seedChapters) {
    for (const entry of chapter.targetVocabulary) {
      // Take everything before the first '(' or ' -'
      let greekPart = entry.split("(")[0].split(" -")[0].trim();

      // Handle entries like "εἷς, δύο, τρεῖς, τέσσαρες, πέντε - ..."
      // which list multiple words separated by commas
      if (greekPart.includes(",")) {
        const parts = greekPart.split(",").map((p) => p.trim());
        for (const part of parts) {
          if (part && /[\u0370-\u03FF\u1F00-\u1FFF]/.test(part)) {
            words.add(part);
          }
        }
      } else if (greekPart && /[\u0370-\u03FF\u1F00-\u1FFF]/.test(greekPart)) {
        words.add(greekPart);
      }
    }
  }

  return Array.from(words);
}

// ---------------------------------------------------------------------------
// Processing pipeline
// ---------------------------------------------------------------------------

export interface ProcessResult {
  word: string;
  status: "cached" | "skipped" | "failed";
  error?: string;
}

/**
 * Process a single vocabulary word through the TTS pipeline:
 * 1. Check if already cached (skip if so)
 * 2. Generate SSML via pronunciation dictionary
 * 3. Synthesize audio via Google Cloud TTS
 * 4. Store in cache
 *
 * @param word - Greek vocabulary word to process.
 * @param dict - Loaded pronunciation dictionary.
 * @param dryRun - If true, log what would happen but don't call TTS or cache.
 * @returns Result indicating cached, skipped, or failed.
 */
export async function processWord(
  word: string,
  dict: ReturnType<typeof loadDictionary>,
  dryRun: boolean,
): Promise<ProcessResult> {
  const cacheKey = generateCacheKey(word, DEFAULT_VOICE, DICT_VERSION);

  // Check if already cached
  if (!dryRun) {
    const existing = await getCachedAudio(cacheKey, AUDIO_FORMAT);
    if (existing) {
      return { word, status: "skipped" };
    }
  }

  if (dryRun) {
    return { word, status: "cached" };
  }

  try {
    // Generate SSML with pronunciation dictionary
    const ssml = generateSSML(word, dict);

    // Synthesize audio
    const result = await synthesize({
      text: ssml,
      ssml: true,
      voice: DEFAULT_VOICE,
      audioEncoding: "MP3",
      speakingRate: 0.85, // Slightly slower for vocabulary learning
    });

    // Store in cache
    await setCachedAudio(cacheKey, result.audioContent, {
      format: AUDIO_FORMAT,
      textLength: word.length,
      provider: DEFAULT_VOICE,
    });

    return { word, status: "cached" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { word, status: "failed", error: message };
  }
}

// ---------------------------------------------------------------------------
// Concurrency-limited runner
// ---------------------------------------------------------------------------

/**
 * Process an array of words with limited concurrency.
 *
 * @param words - Words to process.
 * @param dict - Pronunciation dictionary.
 * @param concurrency - Max parallel requests.
 * @param dryRun - Whether to skip actual TTS calls.
 * @param onProgress - Callback for progress updates.
 * @returns Array of all results.
 */
export async function processWords(
  words: string[],
  dict: ReturnType<typeof loadDictionary>,
  concurrency: number,
  dryRun: boolean,
  onProgress?: (completed: number, total: number, result: ProcessResult) => void,
): Promise<ProcessResult[]> {
  const results: ProcessResult[] = [];
  let completed = 0;
  let index = 0;

  async function worker(): Promise<void> {
    while (index < words.length) {
      const currentIndex = index++;
      const word = words[currentIndex];
      const result = await processWord(word, dict, dryRun);
      results.push(result);
      completed++;
      onProgress?.(completed, words.length, result);
    }
  }

  // Start `concurrency` workers
  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(concurrency, words.length); i++) {
    workers.push(worker());
  }

  await Promise.all(workers);
  return results;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(): { dryRun: boolean; concurrency: number } {
  const args = process.argv.slice(2);
  let dryRun = false;
  let concurrency = DEFAULT_CONCURRENCY;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--dry-run") {
      dryRun = true;
    } else if (args[i] === "--concurrency" && args[i + 1]) {
      concurrency = parseInt(args[i + 1], 10);
      if (isNaN(concurrency) || concurrency < 1) {
        concurrency = DEFAULT_CONCURRENCY;
      }
      i++;
    }
  }

  return { dryRun, concurrency };
}

async function main(): Promise<void> {
  const { dryRun, concurrency } = parseArgs();

  console.log("=== TTS Cache Generator ===");
  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);
  console.log(`Concurrency: ${concurrency}`);
  console.log();

  // Check cache configuration
  if (!dryRun && !isCacheEnabled()) {
    console.warn(
      "WARNING: Cache is not configured (missing TTS_CACHE_* env vars).",
    );
    console.warn("Audio will be generated but not stored.");
    console.log();
  }

  // Extract vocabulary
  const words = extractVocabulary();
  console.log(`Found ${words.length} unique vocabulary words across ${seedChapters.length} chapters.`);
  console.log();

  if (dryRun) {
    console.log("Words that would be processed:");
    for (const word of words) {
      console.log(`  - ${word}`);
    }
    console.log();
  }

  // Load pronunciation dictionary
  const dict = loadDictionary();
  console.log("Pronunciation dictionary loaded.");
  console.log();

  // Process words
  const startTime = Date.now();

  const results = await processWords(
    words,
    dict,
    concurrency,
    dryRun,
    (completed, total, result) => {
      const icon =
        result.status === "cached"
          ? "[+]"
          : result.status === "skipped"
            ? "[=]"
            : "[!]";
      console.log(
        `${icon} ${completed}/${total} ${result.word} - ${result.status}${result.error ? `: ${result.error}` : ""}`,
      );
    },
  );

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  // Summary
  const cached = results.filter((r) => r.status === "cached").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  const failed = results.filter((r) => r.status === "failed").length;

  console.log();
  console.log("=== Summary ===");
  console.log(`Total processed: ${results.length}`);
  console.log(`Cached (new):    ${cached}`);
  console.log(`Skipped (exist): ${skipped}`);
  console.log(`Failed:          ${failed}`);
  console.log(`Time:            ${elapsed}s`);

  if (failed > 0) {
    console.log();
    console.log("Failed words:");
    for (const result of results.filter((r) => r.status === "failed")) {
      console.log(`  - ${result.word}: ${result.error}`);
    }
  }

  // Exit with error code if any failures
  if (failed > 0) {
    process.exit(1);
  }
}

// Run main if this is the direct entry point (not imported by tests)
const isDirectExecution =
  typeof process !== "undefined" &&
  typeof process.argv !== "undefined" &&
  process.argv[1]?.endsWith("generate-tts-cache.ts") === true;

if (isDirectExecution) {
  main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
