#!/usr/bin/env npx tsx
/**
 * Assemble a combined PoC dataset in LJSpeech format from Karvounakis
 * public-domain audio (~20 hrs) and KEP self-recordings (~30 min).
 *
 * Produces:
 *   data/tts-training/combined/
 *     metadata.csv          Combined metadata (filename|transcription)
 *     wavs/                 Symlinks (or copies) of all WAV segments
 *     stats.json            Dataset statistics
 *
 * Usage:
 *   npx tsx scripts/assemble-dataset.ts
 *   npx tsx scripts/assemble-dataset.ts --dry-run
 *   npx tsx scripts/assemble-dataset.ts --source karvounakis
 *   npx tsx scripts/assemble-dataset.ts --source kep-self
 *   npx tsx scripts/assemble-dataset.ts --output ./data/tts-training/combined
 *
 * Source: specs/SPEC-koine-greek-audio-data-collection.md Section 10
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, join, relative, resolve } from "node:path";

import { validateMetadataCsv } from "./segment-karvounakis";
import {
  parseMetadataCsv,
  validateSegment,
  parseWavHeader,
} from "./validate-audio-dataset";
import type {
  MetadataEntry,
  ValidateOptions,
  SegmentResult,
} from "./validate-audio-dataset";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const PROJECT_ROOT = resolve(__dirname, "..");
const DEFAULT_OUTPUT_DIR = join(PROJECT_ROOT, "data/tts-training/combined");

export const SOURCE_DIRS: Record<string, string> = {
  karvounakis: join(PROJECT_ROOT, "data/tts-training/karvounakis"),
  "kep-self": join(PROJECT_ROOT, "data/tts-training/kep-self"),
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SourceDataset {
  name: string;
  dir: string;
  entries: MetadataEntry[];
  wavFiles: string[];
}

export interface DatasetStats {
  totalSegments: number;
  totalDurationSeconds: number;
  totalDurationHours: number;
  uniqueWords: number;
  sources: Record<
    string,
    {
      segments: number;
      durationSeconds: number;
      durationHours: number;
      uniqueWords: number;
    }
  >;
  generatedAt: string;
}

export interface AssemblyResult {
  metadata: MetadataEntry[];
  stats: DatasetStats;
  validationErrors: string[];
  excludedSegments: { filename: string; reason: string }[];
}

// ---------------------------------------------------------------------------
// Source dataset loading
// ---------------------------------------------------------------------------

/**
 * Load a source dataset directory. Reads metadata.csv and discovers WAV files.
 * Returns null if the directory does not exist or has no metadata.
 */
export function loadSourceDataset(
  name: string,
  dir: string,
): SourceDataset | null {
  if (!existsSync(dir)) {
    return null;
  }

  const metadataPath = join(dir, "metadata.csv");
  if (!existsSync(metadataPath)) {
    // Directory exists but no metadata yet -- that is OK (e.g., KEP not recorded)
    return null;
  }

  const metaContent = readFileSync(metadataPath, "utf-8");
  if (!metaContent.trim()) {
    return null;
  }

  const entries = parseMetadataCsv(metaContent);

  // Discover WAV files
  const wavsDir = join(dir, "wavs");
  let wavFiles: string[] = [];
  if (existsSync(wavsDir)) {
    wavFiles = readdirSync(wavsDir)
      .filter((f) => f.toLowerCase().endsWith(".wav"))
      .sort();
  }

  return { name, dir, entries, wavFiles };
}

// ---------------------------------------------------------------------------
// Metadata merging
// ---------------------------------------------------------------------------

/**
 * Merge metadata entries from multiple source datasets into a single list.
 * Detects and reports filename collisions between sources.
 *
 * All text is NFC-normalized.
 */
export function mergeMetadata(
  sources: SourceDataset[],
): {
  merged: MetadataEntry[];
  collisions: { filename: string; sources: string[] }[];
} {
  const merged: MetadataEntry[] = [];
  const seen = new Map<string, string>(); // filename -> source name
  const collisions: { filename: string; sources: string[] }[] = [];

  for (const src of sources) {
    for (const entry of src.entries) {
      // NFC normalize the transcription
      const normalizedTranscription = entry.transcription.normalize("NFC");
      const normalizedFilename = entry.filename.normalize("NFC");

      if (seen.has(normalizedFilename)) {
        const existingSource = seen.get(normalizedFilename)!;
        collisions.push({
          filename: normalizedFilename,
          sources: [existingSource, src.name],
        });
        continue; // Skip the duplicate
      }

      seen.set(normalizedFilename, src.name);
      merged.push({
        filename: normalizedFilename,
        transcription: normalizedTranscription,
      });
    }
  }

  return { merged, collisions };
}

// ---------------------------------------------------------------------------
// Statistics computation
// ---------------------------------------------------------------------------

/**
 * Extract unique Greek words from transcription text.
 * Splits on whitespace and strips trailing punctuation.
 */
export function extractUniqueWords(transcriptions: string[]): Set<string> {
  const words = new Set<string>();
  for (const text of transcriptions) {
    const tokens = text
      .normalize("NFC")
      .split(/\s+/)
      .map((w) => w.replace(/[.,;\u00B7\u037E:'"!?\u2014\-()]+$/g, "").trim())
      .filter((w) => w.length > 0);
    for (const t of tokens) {
      words.add(t);
    }
  }
  return words;
}

/**
 * Compute duration of a WAV file from its on-disk header.
 * Returns 0 if the file cannot be read or parsed.
 */
export function getWavDuration(wavPath: string): number {
  try {
    const buf = readFileSync(wavPath);
    const header = parseWavHeader(buf);
    return header.duration;
  } catch {
    return 0;
  }
}

/**
 * Compute dataset statistics from source datasets.
 */
export function computeStats(
  sources: SourceDataset[],
  merged: MetadataEntry[],
): DatasetStats {
  const perSource: DatasetStats["sources"] = {};

  for (const src of sources) {
    const wavsDir = join(src.dir, "wavs");
    let durationSeconds = 0;

    for (const wavFile of src.wavFiles) {
      durationSeconds += getWavDuration(join(wavsDir, wavFile));
    }

    const transcriptions = src.entries.map((e) => e.transcription);
    const uniqueWords = extractUniqueWords(transcriptions);

    perSource[src.name] = {
      segments: src.entries.length,
      durationSeconds,
      durationHours: durationSeconds / 3600,
      uniqueWords: uniqueWords.size,
    };
  }

  const allTranscriptions = merged.map((e) => e.transcription);
  const allUniqueWords = extractUniqueWords(allTranscriptions);

  const totalDurationSeconds = Object.values(perSource).reduce(
    (sum, s) => sum + s.durationSeconds,
    0,
  );

  return {
    totalSegments: merged.length,
    totalDurationSeconds,
    totalDurationHours: totalDurationSeconds / 3600,
    uniqueWords: allUniqueWords.size,
    sources: perSource,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Compute dataset statistics without reading WAV files (for dry-run or tests).
 * Uses entry count only; durations default to 0.
 */
export function computeStatsFromMetadataOnly(
  sources: SourceDataset[],
  merged: MetadataEntry[],
): DatasetStats {
  const perSource: DatasetStats["sources"] = {};

  for (const src of sources) {
    const transcriptions = src.entries.map((e) => e.transcription);
    const uniqueWords = extractUniqueWords(transcriptions);

    perSource[src.name] = {
      segments: src.entries.length,
      durationSeconds: 0,
      durationHours: 0,
      uniqueWords: uniqueWords.size,
    };
  }

  const allTranscriptions = merged.map((e) => e.transcription);
  const allUniqueWords = extractUniqueWords(allTranscriptions);

  return {
    totalSegments: merged.length,
    totalDurationSeconds: 0,
    totalDurationHours: 0,
    uniqueWords: allUniqueWords.size,
    sources: perSource,
    generatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Metadata CSV generation
// ---------------------------------------------------------------------------

/**
 * Generate combined metadata.csv content in LJSpeech format.
 * Format: filename|transcription (no header, pipe-delimited)
 */
export function generateCombinedMetadataCsv(entries: MetadataEntry[]): string {
  const lines: string[] = [];
  for (const entry of entries) {
    if (!entry.filename || !entry.transcription) continue;
    // Ensure filename has no .wav extension (LJSpeech convention)
    const name = entry.filename.replace(/\.wav$/i, "");
    lines.push(`${name}|${entry.transcription}`);
  }
  return lines.length > 0 ? lines.join("\n") + "\n" : "";
}

// ---------------------------------------------------------------------------
// WAV file linking
// ---------------------------------------------------------------------------

/**
 * Link (symlink with copy fallback) WAV files from source datasets into the
 * combined wavs/ directory. Returns a list of files that could not be linked.
 */
export function linkWavFiles(
  sources: SourceDataset[],
  outputWavsDir: string,
  dryRun: boolean,
): { linked: string[]; errors: { filename: string; reason: string }[] } {
  const linked: string[] = [];
  const errors: { filename: string; reason: string }[] = [];

  if (!dryRun) {
    mkdirSync(outputWavsDir, { recursive: true });
  }

  for (const src of sources) {
    const srcWavsDir = join(src.dir, "wavs");
    if (!existsSync(srcWavsDir)) continue;

    for (const wavFile of src.wavFiles) {
      const srcPath = join(srcWavsDir, wavFile);
      const destPath = join(outputWavsDir, wavFile);

      if (dryRun) {
        linked.push(wavFile);
        continue;
      }

      if (existsSync(destPath)) {
        // Already exists; skip
        linked.push(wavFile);
        continue;
      }

      try {
        // Try symlink first (relative path for portability)
        const relPath = relative(outputWavsDir, srcPath);
        symlinkSync(relPath, destPath);
        linked.push(wavFile);
      } catch {
        // Fallback to copy
        try {
          copyFileSync(srcPath, destPath);
          linked.push(wavFile);
        } catch (copyErr) {
          const msg =
            copyErr instanceof Error ? copyErr.message : String(copyErr);
          errors.push({ filename: wavFile, reason: msg });
        }
      }
    }
  }

  return { linked, errors };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Run quality validation on the combined dataset.
 * Validates each WAV file individually; excludes failures and logs them.
 */
export function validateCombinedDataset(
  outputDir: string,
  entries: MetadataEntry[],
): { passed: SegmentResult[]; excluded: { filename: string; reason: string }[] } {
  const passed: SegmentResult[] = [];
  const excluded: { filename: string; reason: string }[] = [];

  const wavsDir = join(outputDir, "wavs");
  if (!existsSync(wavsDir)) {
    return { passed, excluded };
  }

  const defaultOptions: ValidateOptions = {
    datasetPath: outputDir,
    source: "karvounakis",
    snrThreshold: 20,
    clipThreshold: 32767,
    silenceThreshold: 100,
    minDuration: 0.5,
    maxDuration: 20,
    vocabMinDuration: 0.3,
    maxLeadingTrailingSilence: 2,
  };

  for (const entry of entries) {
    const wavFilename = entry.filename.endsWith(".wav")
      ? entry.filename
      : entry.filename + ".wav";
    const wavPath = join(wavsDir, wavFilename);

    if (!existsSync(wavPath)) {
      excluded.push({
        filename: entry.filename,
        reason: "WAV file not found",
      });
      continue;
    }

    try {
      const buffer = readFileSync(wavPath);
      const result = validateSegment(buffer, wavFilename, defaultOptions);

      if (result.passed) {
        passed.push(result);
      } else {
        const reasons = result.issues
          .filter((i) => i.severity === "error")
          .map((i) => i.message)
          .join("; ");
        excluded.push({ filename: entry.filename, reason: reasons });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      excluded.push({ filename: entry.filename, reason: msg });
    }
  }

  return { passed, excluded };
}

// ---------------------------------------------------------------------------
// Assembly orchestration
// ---------------------------------------------------------------------------

/**
 * Assemble the combined dataset. This is the main logic function.
 */
export function assembleDataset(options: {
  sources: string[];
  outputDir: string;
  dryRun: boolean;
  skipValidation: boolean;
}): AssemblyResult {
  const { sources: sourceNames, outputDir, dryRun, skipValidation } = options;

  // 1. Load source datasets
  const loadedSources: SourceDataset[] = [];
  for (const name of sourceNames) {
    const dir = SOURCE_DIRS[name];
    if (!dir) {
      console.warn(`Unknown source: ${name}, skipping.`);
      continue;
    }

    const dataset = loadSourceDataset(name, dir);
    if (dataset) {
      loadedSources.push(dataset);
      console.log(
        `Loaded ${name}: ${dataset.entries.length} entries, ${dataset.wavFiles.length} WAV files`,
      );
    } else {
      console.warn(
        `Source '${name}' not available (directory missing or no metadata.csv). Skipping.`,
      );
    }
  }

  if (loadedSources.length === 0) {
    console.warn("No source datasets available. Producing empty dataset.");
    return {
      metadata: [],
      stats: {
        totalSegments: 0,
        totalDurationSeconds: 0,
        totalDurationHours: 0,
        uniqueWords: 0,
        sources: {},
        generatedAt: new Date().toISOString(),
      },
      validationErrors: [],
      excludedSegments: [],
    };
  }

  // 2. Merge metadata
  const { merged, collisions } = mergeMetadata(loadedSources);

  if (collisions.length > 0) {
    console.warn(`Filename collisions detected (${collisions.length}):`);
    for (const c of collisions) {
      console.warn(`  ${c.filename} appears in: ${c.sources.join(", ")}`);
    }
  }

  console.log(`Combined metadata: ${merged.length} entries`);

  // 3. Validate metadata format
  const metadataCsv = generateCombinedMetadataCsv(merged);
  const metaValidationErrors = validateMetadataCsv(metadataCsv);

  if (metaValidationErrors.length > 0) {
    console.warn("Metadata validation issues:");
    for (const err of metaValidationErrors) {
      console.warn(`  - ${err}`);
    }
  }

  // 4. Link WAV files
  const wavsDir = join(outputDir, "wavs");
  const linkResult = linkWavFiles(loadedSources, wavsDir, dryRun);

  if (linkResult.errors.length > 0) {
    console.warn(`WAV linking errors: ${linkResult.errors.length}`);
    for (const e of linkResult.errors) {
      console.warn(`  ${e.filename}: ${e.reason}`);
    }
  }

  console.log(
    `WAV files: ${linkResult.linked.length} linked${dryRun ? " (dry-run)" : ""}`,
  );

  // 5. Run validation on combined dataset
  let excludedSegments: { filename: string; reason: string }[] = [];

  if (!skipValidation && !dryRun) {
    const validation = validateCombinedDataset(outputDir, merged);
    excludedSegments = validation.excluded;

    if (excludedSegments.length > 0) {
      console.warn(
        `Validation excluded ${excludedSegments.length} segments:`,
      );
      for (const seg of excludedSegments.slice(0, 10)) {
        console.warn(`  ${seg.filename}: ${seg.reason}`);
      }
      if (excludedSegments.length > 10) {
        console.warn(`  ... and ${excludedSegments.length - 10} more`);
      }
    }

    console.log(
      `Validation: ${merged.length - excludedSegments.length}/${merged.length} segments passed`,
    );
  }

  // 6. Compute statistics
  const stats = dryRun
    ? computeStatsFromMetadataOnly(loadedSources, merged)
    : computeStats(loadedSources, merged);

  // 7. Write output files
  if (!dryRun) {
    mkdirSync(outputDir, { recursive: true });

    // Write metadata.csv
    writeFileSync(join(outputDir, "metadata.csv"), metadataCsv, "utf-8");
    console.log(`Wrote metadata.csv: ${merged.length} entries`);

    // Write stats.json
    writeFileSync(
      join(outputDir, "stats.json"),
      JSON.stringify(stats, null, 2) + "\n",
      "utf-8",
    );
    console.log(`Wrote stats.json`);

    // Write excluded segments log
    if (excludedSegments.length > 0) {
      const excludedLog = excludedSegments
        .map((s) => `${s.filename}: ${s.reason}`)
        .join("\n");
      writeFileSync(
        join(outputDir, "excluded-segments.log"),
        excludedLog + "\n",
        "utf-8",
      );
      console.log(
        `Wrote excluded-segments.log: ${excludedSegments.length} entries`,
      );
    }
  } else {
    console.log("[DRY-RUN] Would write to:", outputDir);
    console.log(`[DRY-RUN] metadata.csv: ${merged.length} entries`);
    console.log(`[DRY-RUN] stats.json: ${JSON.stringify(stats, null, 2)}`);
  }

  return {
    metadata: merged,
    stats,
    validationErrors: metaValidationErrors,
    excludedSegments,
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

interface CLIArgs {
  dryRun: boolean;
  source: string[];
  output: string;
  skipValidation: boolean;
}

export function parseCliArgs(argv: string[]): CLIArgs {
  const args = argv.slice(2);
  let dryRun = false;
  let source: string[] = ["karvounakis", "kep-self"];
  let output = DEFAULT_OUTPUT_DIR;
  let skipValidation = false;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--dry-run":
        dryRun = true;
        break;
      case "--source":
        {
          const val = args[++i];
          if (val === "both") {
            source = ["karvounakis", "kep-self"];
          } else if (val) {
            source = [val];
          }
        }
        break;
      case "--output":
        output = resolve(args[++i] || DEFAULT_OUTPUT_DIR);
        break;
      case "--skip-validation":
        skipValidation = true;
        break;
    }
  }

  return { dryRun, source, output, skipValidation };
}

async function main(): Promise<void> {
  const cliArgs = parseCliArgs(process.argv);

  console.log("=== PoC Dataset Assembly ===");
  console.log(`Mode: ${cliArgs.dryRun ? "DRY RUN" : "LIVE"}`);
  console.log(`Sources: ${cliArgs.source.join(", ")}`);
  console.log(`Output: ${cliArgs.output}`);
  console.log();

  const result = assembleDataset({
    sources: cliArgs.source,
    outputDir: cliArgs.output,
    dryRun: cliArgs.dryRun,
    skipValidation: cliArgs.skipValidation,
  });

  // Print summary
  console.log();
  console.log("=== Dataset Statistics ===");
  console.log(`Total segments:  ${result.stats.totalSegments}`);
  console.log(
    `Total duration:  ${result.stats.totalDurationHours.toFixed(2)} hours (${result.stats.totalDurationSeconds.toFixed(0)}s)`,
  );
  console.log(`Unique words:    ${result.stats.uniqueWords}`);

  for (const [name, srcStats] of Object.entries(result.stats.sources)) {
    console.log(
      `  ${name}: ${srcStats.segments} segments, ${srcStats.durationHours.toFixed(2)} hours, ${srcStats.uniqueWords} unique words`,
    );
  }

  if (result.validationErrors.length > 0) {
    console.log(`Metadata issues: ${result.validationErrors.length}`);
  }
  if (result.excludedSegments.length > 0) {
    console.log(`Excluded:        ${result.excludedSegments.length}`);
  }

  console.log();
  console.log("=== Done ===");
}

// Run main if this is the direct entry point
const isDirectExecution =
  typeof process !== "undefined" &&
  typeof process.argv !== "undefined" &&
  process.argv[1]?.endsWith("assemble-dataset.ts") === true;

if (isDirectExecution) {
  main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
