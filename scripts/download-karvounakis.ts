#!/usr/bin/env npx tsx
/**
 * Download Karvounakis Greek NT audio from GitHub mirror and convert
 * to Piper training format (mono WAV, 22.05 kHz, 16-bit signed PCM).
 *
 * Source: ManolisMariakakis/Narration-of-the-Greek-New-Testament-TR-Scrivener-1894
 * License: Public Domain Mark 1.0
 *
 * The GitHub repo stores all MP3s in a flat mp3/ directory with naming
 * convention: {bookPrefix}-{chapter}.mp3 (e.g., mat-1.mp3, mrk-16.mp3).
 *
 * Usage:
 *   npx tsx scripts/download-karvounakis.ts
 *   npx tsx scripts/download-karvounakis.ts --dry-run
 *   npx tsx scripts/download-karvounakis.ts --books matthew,john
 */

import { execFile } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, statSync } from "node:fs";
import { writeFile, readdir, stat, unlink } from "node:fs/promises";
import { join, basename, extname } from "node:path";
import { promisify } from "node:util";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const GITHUB_REPO =
  "ManolisMariakakis/Narration-of-the-Greek-New-Testament-TR-Scrivener-1894";
const GITHUB_RAW_BASE = `https://raw.githubusercontent.com/${GITHUB_REPO}/main`;

const OUTPUT_BASE = "data/tts-training/karvounakis";
const WAVS_DIR = join(OUTPUT_BASE, "wavs");
const DOWNLOAD_DIR = join(OUTPUT_BASE, "downloads");

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

/** NT books in canonical order: bookKey -> { display name, mp3 file prefix, chapter count } */
export interface BookInfo {
  displayName: string;
  filePrefix: string;
  chapters: number;
}

export const NT_BOOKS: Record<string, BookInfo> = {
  matthew:          { displayName: "Matthew",          filePrefix: "mat", chapters: 28 },
  mark:             { displayName: "Mark",             filePrefix: "mrk", chapters: 16 },
  luke:             { displayName: "Luke",             filePrefix: "luk", chapters: 24 },
  john:             { displayName: "John",             filePrefix: "jhn", chapters: 21 },
  acts:             { displayName: "Acts",             filePrefix: "act", chapters: 28 },
  romans:           { displayName: "Romans",           filePrefix: "rom", chapters: 16 },
  "1corinthians":   { displayName: "1 Corinthians",    filePrefix: "1co", chapters: 16 },
  "2corinthians":   { displayName: "2 Corinthians",    filePrefix: "2co", chapters: 13 },
  galatians:        { displayName: "Galatians",        filePrefix: "gal", chapters: 6 },
  ephesians:        { displayName: "Ephesians",        filePrefix: "eph", chapters: 6 },
  philippians:      { displayName: "Philippians",      filePrefix: "php", chapters: 4 },
  colossians:       { displayName: "Colossians",       filePrefix: "col", chapters: 4 },
  "1thessalonians": { displayName: "1 Thessalonians",  filePrefix: "1th", chapters: 5 },
  "2thessalonians": { displayName: "2 Thessalonians",  filePrefix: "2th", chapters: 3 },
  "1timothy":       { displayName: "1 Timothy",        filePrefix: "1ti", chapters: 6 },
  "2timothy":       { displayName: "2 Timothy",        filePrefix: "2ti", chapters: 4 },
  titus:            { displayName: "Titus",            filePrefix: "tit", chapters: 3 },
  philemon:         { displayName: "Philemon",         filePrefix: "phm", chapters: 1 },
  hebrews:          { displayName: "Hebrews",          filePrefix: "heb", chapters: 13 },
  james:            { displayName: "James",            filePrefix: "jas", chapters: 5 },
  "1peter":         { displayName: "1 Peter",          filePrefix: "1pe", chapters: 5 },
  "2peter":         { displayName: "2 Peter",          filePrefix: "2pe", chapters: 3 },
  "1john":          { displayName: "1 John",           filePrefix: "1jn", chapters: 5 },
  "2john":          { displayName: "2 John",           filePrefix: "2jn", chapters: 1 },
  "3john":          { displayName: "3 John",           filePrefix: "3jn", chapters: 1 },
  jude:             { displayName: "Jude",             filePrefix: "jud", chapters: 1 },
  revelation:       { displayName: "Revelation",       filePrefix: "rev", chapters: 22 },
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DownloadResult {
  file: string;
  book: string;
  status: "downloaded" | "skipped" | "failed";
  error?: string;
}

export interface ConversionResult {
  inputFile: string;
  outputFile: string;
  book: string;
  status: "converted" | "skipped" | "failed";
  durationSeconds?: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// File URL generation
// ---------------------------------------------------------------------------

/**
 * Generate download URLs for all chapters of a book.
 * Files are in the flat mp3/ directory: {prefix}-{chapter}.mp3
 */
export function generateBookFileUrls(bookInfo: BookInfo): string[] {
  const urls: string[] = [];
  for (let ch = 1; ch <= bookInfo.chapters; ch++) {
    const fileName = `${bookInfo.filePrefix}-${ch}.mp3`;
    urls.push(`${GITHUB_RAW_BASE}/mp3/${fileName}`);
  }
  return urls;
}

// ---------------------------------------------------------------------------
// Download with resume support and retries
// ---------------------------------------------------------------------------

/**
 * Sleep for the given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Download a file with resume support. If the file already exists with
 * the expected size, it is skipped.
 */
export async function downloadFile(
  url: string,
  destPath: string,
): Promise<{ downloaded: boolean; skipped: boolean }> {
  // Check if file already exists
  if (existsSync(destPath)) {
    // Try to get expected size via HEAD request
    try {
      const head = await fetch(url, { method: "HEAD" });
      const contentLength = head.headers.get("content-length");
      if (contentLength) {
        const expectedSize = parseInt(contentLength, 10);
        const actualSize = statSync(destPath).size;
        if (actualSize === expectedSize) {
          return { downloaded: false, skipped: true };
        }
        // File exists but wrong size -- remove and re-download
        await unlink(destPath);
      }
    } catch {
      // If HEAD fails, check if file has non-zero size and skip
      const actualSize = statSync(destPath).size;
      if (actualSize > 0) {
        return { downloaded: false, skipped: true };
      }
    }
  }

  // Download the file
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  }

  if (!response.body) {
    throw new Error("Response body is null");
  }

  // Ensure parent directory exists
  const dir = join(destPath, "..");
  mkdirSync(dir, { recursive: true });

  const fileStream = createWriteStream(destPath);
  const readable = Readable.fromWeb(response.body as any);
  await pipeline(readable, fileStream);

  return { downloaded: true, skipped: false };
}

/**
 * Download a file with retries. Retries on failure up to MAX_RETRIES times.
 */
export async function downloadFileWithRetry(
  url: string,
  destPath: string,
): Promise<{ downloaded: boolean; skipped: boolean }> {
  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await downloadFile(url, destPath);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < MAX_RETRIES) {
        console.warn(`    Retry ${attempt}/${MAX_RETRIES} for ${basename(destPath)}: ${lastError.message}`);
        await sleep(RETRY_DELAY_MS * attempt);
      }
    }
  }
  throw lastError;
}

// ---------------------------------------------------------------------------
// Audio conversion via FFmpeg
// ---------------------------------------------------------------------------

/**
 * Convert an audio file to mono WAV at 22.05 kHz, 16-bit signed PCM.
 * Returns the duration in seconds of the output file.
 */
export async function convertToTrainingFormat(
  inputPath: string,
  outputPath: string,
): Promise<number> {
  // Ensure output directory exists
  mkdirSync(join(outputPath, ".."), { recursive: true });

  await execFileAsync("ffmpeg", [
    "-y",
    "-i",
    inputPath,
    "-ac",
    "1", // mono
    "-ar",
    "22050", // 22.05 kHz
    "-acodec",
    "pcm_s16le", // 16-bit signed PCM
    "-f",
    "wav",
    outputPath,
  ]);

  // Get duration via ffprobe
  const duration = await getAudioDuration(outputPath);
  return duration;
}

/**
 * Get the duration of an audio file in seconds using ffprobe.
 */
export async function getAudioDuration(filePath: string): Promise<number> {
  const { stdout } = await execFileAsync("ffprobe", [
    "-v",
    "quiet",
    "-show_entries",
    "format=duration",
    "-of",
    "csv=p=0",
    filePath,
  ]);
  return parseFloat(stdout.trim()) || 0;
}

// ---------------------------------------------------------------------------
// Book processing
// ---------------------------------------------------------------------------

/**
 * Normalize a book key for use as a directory name.
 * e.g., "1 Corinthians" -> "1corinthians"
 */
export function normalizeBookKey(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "");
}

/**
 * Download and convert all audio files for a single NT book.
 */
export async function processBook(
  bookKey: string,
  bookInfo: BookInfo,
  dryRun: boolean,
): Promise<{ downloads: DownloadResult[]; conversions: ConversionResult[] }> {
  const downloads: DownloadResult[] = [];
  const conversions: ConversionResult[] = [];

  const downloadDir = join(DOWNLOAD_DIR, bookKey);
  const wavDir = join(WAVS_DIR, bookKey);

  mkdirSync(downloadDir, { recursive: true });
  mkdirSync(wavDir, { recursive: true });

  // Generate expected file URLs from known structure
  const fileUrls = generateBookFileUrls(bookInfo);

  console.log(`  Expected ${fileUrls.length} chapter files (${bookInfo.filePrefix}-1.mp3 .. ${bookInfo.filePrefix}-${bookInfo.chapters}.mp3)`);

  // Download each file
  for (const url of fileUrls) {
    const fileName = decodeURIComponent(basename(new URL(url).pathname));
    const destPath = join(downloadDir, fileName);

    if (dryRun) {
      console.log(`  [DRY] Would download: ${fileName}`);
      downloads.push({ file: fileName, book: bookKey, status: "skipped" });
      continue;
    }

    try {
      const { downloaded, skipped } = await downloadFileWithRetry(url, destPath);
      if (skipped) {
        console.log(`  [=] Skipped (exists): ${fileName}`);
        downloads.push({ file: fileName, book: bookKey, status: "skipped" });
      } else {
        console.log(`  [+] Downloaded: ${fileName}`);
        downloads.push({ file: fileName, book: bookKey, status: "downloaded" });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`  [!] Failed: ${fileName} - ${message}`);
      downloads.push({
        file: fileName,
        book: bookKey,
        status: "failed",
        error: message,
      });
    }
  }

  // Convert downloaded files
  if (!dryRun) {
    let dirEntries: string[];
    try {
      dirEntries = await readdir(downloadDir);
    } catch {
      dirEntries = [];
    }

    const audioFiles = dirEntries.filter((f) =>
      /\.(mp3|wav|ogg|m4a|flac)$/i.test(f),
    );

    for (const audioFile of audioFiles) {
      const inputPath = join(downloadDir, audioFile);
      const outputName = audioFile.replace(/\.[^.]+$/, ".wav");
      const outputPath = join(wavDir, outputName);

      // Skip if WAV already exists and has non-zero size
      if (existsSync(outputPath)) {
        try {
          const s = statSync(outputPath);
          if (s.size > 0) {
            console.log(`  [=] Skipped conversion (exists): ${outputName}`);
            const duration = await getAudioDuration(outputPath).catch(
              () => 0,
            );
            conversions.push({
              inputFile: audioFile,
              outputFile: outputName,
              book: bookKey,
              status: "skipped",
              durationSeconds: duration,
            });
            continue;
          }
        } catch {
          // Fall through to convert
        }
      }

      try {
        console.log(`  [~] Converting: ${audioFile} -> ${outputName}`);
        const duration = await convertToTrainingFormat(inputPath, outputPath);
        console.log(
          `  [+] Converted: ${outputName} (${formatDuration(duration)})`,
        );
        conversions.push({
          inputFile: audioFile,
          outputFile: outputName,
          book: bookKey,
          status: "converted",
          durationSeconds: duration,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`  [!] Conversion failed: ${audioFile} - ${message}`);
        conversions.push({
          inputFile: audioFile,
          outputFile: outputName,
          book: bookKey,
          status: "failed",
          error: message,
        });
      }
    }
  }

  return { downloads, conversions };
}

// ---------------------------------------------------------------------------
// License documentation
// ---------------------------------------------------------------------------

const LICENSE_CONTENT = `# License

## Karvounakis Greek New Testament Audio

**License**: Public Domain Mark 1.0
**License URL**: https://creativecommons.org/publicdomain/mark/1.0/
**Verified**: 2026-02-01

This audio was narrated by Theo Karvounakis and is marked as being in the
public domain under the Public Domain Mark 1.0. This means the work is free
of known copyright restrictions.

### Source
- **Internet Archive**: https://archive.org/details/acts-19-28
- **GitHub Mirror**: https://github.com/ManolisMariakakis/Narration-of-the-Greek-New-Testament-TR-Scrivener-1894

### Text
The audio follows the Textus Receptus (Scrivener 1894 edition), which is
also in the public domain.

### Usage
This audio data has been converted to mono WAV format at 22.05 kHz, 16-bit
signed PCM for use as TTS training data. No copyright restrictions apply
to this audio content.
`;

/**
 * Write the LICENSE.md file documenting the Public Domain Mark 1.0 license.
 */
export async function writeLicense(outputDir: string): Promise<void> {
  mkdirSync(outputDir, { recursive: true });
  await writeFile(join(outputDir, "LICENSE.md"), LICENSE_CONTENT, "utf-8");
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/**
 * Format seconds as HH:MM:SS.
 */
export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

interface CLIArgs {
  dryRun: boolean;
  books: string[] | null; // null = all books
}

function parseArgs(): CLIArgs {
  const args = process.argv.slice(2);
  let dryRun = false;
  let books: string[] | null = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--dry-run") {
      dryRun = true;
    } else if (args[i] === "--books" && args[i + 1]) {
      books = args[i + 1].split(",").map((b) => b.trim().toLowerCase());
      i++;
    }
  }

  return { dryRun, books };
}

async function main(): Promise<void> {
  const { dryRun, books: filterBooks } = parseArgs();

  console.log("=== Karvounakis NT Audio Download & Conversion ===");
  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);
  console.log(`Output: ${OUTPUT_BASE}`);
  console.log();

  // Verify FFmpeg is available
  if (!dryRun) {
    try {
      await execFileAsync("ffmpeg", ["-version"]);
    } catch {
      console.error("ERROR: FFmpeg is not installed or not in PATH.");
      console.error("Install FFmpeg: sudo apt install ffmpeg (Linux) or brew install ffmpeg (macOS)");
      process.exit(1);
    }
  }

  // Write license
  console.log("Writing LICENSE.md...");
  await writeLicense(OUTPUT_BASE);
  console.log();

  // Count total expected files
  const totalExpectedFiles = Object.values(NT_BOOKS).reduce((sum, b) => sum + b.chapters, 0);
  console.log(`Total expected files across all books: ${totalExpectedFiles}`);
  console.log();

  // Process books
  const booksToProcess = filterBooks
    ? Object.entries(NT_BOOKS).filter(([key]) => filterBooks.includes(key))
    : Object.entries(NT_BOOKS);

  const allDownloads: DownloadResult[] = [];
  const allConversions: ConversionResult[] = [];

  for (const [bookKey, bookInfo] of booksToProcess) {
    console.log(`--- ${bookInfo.displayName} (${bookKey}) ---`);

    const { downloads, conversions } = await processBook(
      bookKey,
      bookInfo,
      dryRun,
    );

    allDownloads.push(...downloads);
    allConversions.push(...conversions);
    console.log();
  }

  // Summary
  const totalDuration = allConversions.reduce(
    (sum, c) => sum + (c.durationSeconds || 0),
    0,
  );

  const downloadedCount = allDownloads.filter(
    (d) => d.status === "downloaded",
  ).length;
  const downloadSkipped = allDownloads.filter(
    (d) => d.status === "skipped",
  ).length;
  const downloadFailed = allDownloads.filter(
    (d) => d.status === "failed",
  ).length;

  const convertedCount = allConversions.filter(
    (c) => c.status === "converted",
  ).length;
  const conversionSkipped = allConversions.filter(
    (c) => c.status === "skipped",
  ).length;
  const conversionFailed = allConversions.filter(
    (c) => c.status === "failed",
  ).length;

  console.log("=== Summary ===");
  console.log(`Books processed:     ${booksToProcess.length}`);
  console.log();
  console.log("Downloads:");
  console.log(`  New downloads:     ${downloadedCount}`);
  console.log(`  Skipped (exist):   ${downloadSkipped}`);
  console.log(`  Failed:            ${downloadFailed}`);
  console.log();
  console.log("Conversions:");
  console.log(`  Converted:         ${convertedCount}`);
  console.log(`  Skipped (exist):   ${conversionSkipped}`);
  console.log(`  Failed:            ${conversionFailed}`);
  console.log();
  console.log(`Total audio duration: ${formatDuration(totalDuration)} (${(totalDuration / 3600).toFixed(1)} hours)`);
  console.log();

  if (totalDuration > 0) {
    const expectedHours = 20;
    const actualHours = totalDuration / 3600;
    if (actualHours < expectedHours * 0.5) {
      console.warn(
        `WARNING: Total duration (${actualHours.toFixed(1)} hrs) is significantly less than expected (~${expectedHours} hrs).`,
      );
      console.warn("Some files may be missing or corrupted.");
    } else {
      console.log(
        `Duration looks reasonable (expected ~${expectedHours} hrs, got ${actualHours.toFixed(1)} hrs).`,
      );
    }
  }

  if (downloadFailed > 0) {
    console.log();
    console.log("Failed downloads:");
    for (const d of allDownloads.filter((d) => d.status === "failed")) {
      console.log(`  - ${d.book}/${d.file}: ${d.error}`);
    }
  }

  if (conversionFailed > 0) {
    console.log();
    console.log("Failed conversions:");
    for (const c of allConversions.filter((c) => c.status === "failed")) {
      console.log(`  - ${c.book}/${c.inputFile}: ${c.error}`);
    }
  }

  // Exit with error if any failures
  if (downloadFailed > 0 || conversionFailed > 0) {
    process.exit(1);
  }
}

// Run main if this is the direct entry point
const isDirectExecution =
  typeof process !== "undefined" &&
  typeof process.argv !== "undefined" &&
  process.argv[1]?.endsWith("download-karvounakis.ts") === true;

if (isDirectExecution) {
  main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
