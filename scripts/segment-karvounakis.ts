#!/usr/bin/env npx tsx
/**
 * Audio segmentation and TR alignment pipeline for the Karvounakis
 * Greek NT recordings. Segments chapter-level WAV files into 5-15 second
 * clips aligned with Textus Receptus verse/sentence text, producing
 * LJSpeech format output.
 *
 * Strategy:
 *  1. Load TR text (verse-level) from tr-text.json
 *  2. For each chapter WAV, detect silences via FFmpeg silencedetect
 *  3. Map silence boundaries to verse boundaries (sequential assumption)
 *  4. Split audio at those boundaries using FFmpeg
 *  5. Enforce 5-15s range: split long segments at sentence boundaries,
 *     combine short adjacent segments
 *  6. Generate metadata.csv in LJSpeech format
 *
 * Usage:
 *   npx tsx scripts/segment-karvounakis.ts
 *   npx tsx scripts/segment-karvounakis.ts --dry-run
 *   npx tsx scripts/segment-karvounakis.ts --books matthew,john
 *
 * Source: specs/SPEC-koine-greek-audio-data-collection.md Section 5.2, 9.1
 */

import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { promisify } from "node:util";

import { NT_BOOKS } from "./download-karvounakis";
import { normalizeGreekText } from "./prepare-tr-text";
import type { TRVerse, TROutput } from "./prepare-tr-text";

const execFileAsync = promisify(execFile);

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const PROJECT_ROOT = resolve(__dirname, "..");
const DATA_DIR = join(PROJECT_ROOT, "data/tts-training/karvounakis");
const WAVS_INPUT_DIR = join(DATA_DIR, "wavs");
const WAVS_OUTPUT_DIR = join(DATA_DIR, "wavs");
const TR_TEXT_PATH = join(DATA_DIR, "tr-text.json");
const METADATA_PATH = join(DATA_DIR, "metadata.csv");

const MIN_SEGMENT_DURATION = 5;
const MAX_SEGMENT_DURATION = 15;
const VERY_LONG_THRESHOLD = 20;
const VERY_SHORT_THRESHOLD = 2;

/** Silence detection parameters for FFmpeg silencedetect */
const SILENCE_NOISE_DB = -35;
const SILENCE_MIN_DURATION = 0.3;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SilenceInterval {
  start: number;
  end: number;
  duration: number;
}

export interface SegmentInfo {
  /** Output filename without extension */
  id: string;
  /** Full output filename with .wav */
  filename: string;
  /** Book slug */
  book: string;
  /** Chapter number */
  chapter: number;
  /** Verse number (primary verse for multi-verse segments) */
  verse: number;
  /** Sub-segment index within a verse (0 = whole verse or first part) */
  segment: number;
  /** Start time in seconds within the chapter audio */
  startTime: number;
  /** End time in seconds within the chapter audio */
  endTime: number;
  /** Duration in seconds */
  duration: number;
  /** Aligned TR transcript text */
  transcript: string;
  /** Whether this segment has known alignment issues */
  hasDiscrepancy: boolean;
  /** Description of any discrepancy */
  discrepancyNote?: string;
}

export interface AlignmentResult {
  segments: SegmentInfo[];
  errors: AlignmentError[];
  stats: {
    totalSegments: number;
    totalDuration: number;
    inRangeCount: number;
    tooShortCount: number;
    tooLongCount: number;
    discrepancyCount: number;
  };
}

export interface AlignmentError {
  book: string;
  chapter: number;
  verse?: number;
  message: string;
}

export interface ChapterAudio {
  book: string;
  chapter: number;
  filePath: string;
  duration: number;
}

// ---------------------------------------------------------------------------
// Filename convention
// ---------------------------------------------------------------------------

/**
 * Generate a consistent segment filename.
 * Convention: karvounakis_{book}_{chapter}_{verse}_{segment}.wav
 */
export function makeSegmentFilename(
  book: string,
  chapter: number,
  verse: number,
  segment: number,
): string {
  const bookSlug = book.toLowerCase().replace(/\s+/g, "");
  const ch = String(chapter).padStart(3, "0");
  const vs = String(verse).padStart(3, "0");
  const sg = String(segment).padStart(2, "0");
  return `karvounakis_${bookSlug}_${ch}_${vs}_${sg}.wav`;
}

/**
 * Generate the segment ID (filename without extension).
 */
export function makeSegmentId(
  book: string,
  chapter: number,
  verse: number,
  segment: number,
): string {
  return makeSegmentFilename(book, chapter, verse, segment).replace(
    /\.wav$/,
    "",
  );
}

// ---------------------------------------------------------------------------
// Punctuation normalization
// ---------------------------------------------------------------------------

/**
 * Normalize punctuation in a Greek transcript for TTS training consistency.
 *
 * - Normalize various dash characters to a standard em-dash
 * - Normalize quotation marks to standard form
 * - Ensure consistent spacing around punctuation
 * - Collapse multiple spaces
 */
export function normalizePunctuation(text: string): string {
  let result = text;

  // Normalize dashes: en-dash, em-dash, figure dash, horizontal bar -> em-dash
  result = result.replace(/[\u2013\u2014\u2015\u2012]/g, "\u2014");

  // Normalize quotation marks
  result = result.replace(/[\u201C\u201D\u201E\u201F]/g, '"');
  result = result.replace(/[\u2018\u2019\u201A\u201B]/g, "'");

  // Ensure space after comma, period, semicolon, colon (Greek uses ; for ?)
  result = result.replace(/([,.\u037E;:])(?=[^\s])/g, "$1 ");

  // Remove space before comma, period, semicolon
  result = result.replace(/\s+([,.\u037E;])/g, "$1");

  // Collapse multiple spaces
  result = result.replace(/\s+/g, " ").trim();

  return result;
}

// ---------------------------------------------------------------------------
// Sentence splitting for long verses
// ---------------------------------------------------------------------------

/**
 * Greek sentence boundary characters.
 * Period (.), middle dot / ano teleia (U+00B7), Greek question mark (;),
 * erotimatiko (U+037E).
 */
const SENTENCE_BOUNDARY_RE = /([.\u00B7;\u037E])\s+/g;

/**
 * Split a Greek text into sentences at natural boundaries.
 * Returns an array of sentence strings.
 */
export function splitIntoSentences(text: string): string[] {
  if (!text.trim()) return [];

  // Split on sentence boundaries, keeping the delimiter with the preceding sentence
  const parts: string[] = [];
  let lastIndex = 0;

  const re = new RegExp(SENTENCE_BOUNDARY_RE.source, "g");
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    const sentence = text.slice(lastIndex, match.index + match[1].length).trim();
    if (sentence) parts.push(sentence);
    lastIndex = match.index + match[0].length;
  }

  // Remaining text after last boundary
  const remaining = text.slice(lastIndex).trim();
  if (remaining) parts.push(remaining);

  return parts.length > 0 ? parts : [text.trim()];
}

// ---------------------------------------------------------------------------
// FFmpeg: Silence detection
// ---------------------------------------------------------------------------

/**
 * Detect silence intervals in an audio file using FFmpeg silencedetect filter.
 * Returns sorted array of silence intervals with start, end, and duration.
 */
export async function detectSilences(
  filePath: string,
  noiseDb: number = SILENCE_NOISE_DB,
  minDuration: number = SILENCE_MIN_DURATION,
): Promise<SilenceInterval[]> {
  const { stderr } = await execFileAsync(
    "ffmpeg",
    [
      "-i",
      filePath,
      "-af",
      `silencedetect=noise=${noiseDb}dB:d=${minDuration}`,
      "-f",
      "null",
      "-",
    ],
    { maxBuffer: 10 * 1024 * 1024 },
  );

  return parseSilenceDetectOutput(stderr);
}

/**
 * Parse FFmpeg silencedetect filter output into structured intervals.
 *
 * Expected format in stderr:
 *   [silencedetect @ ...] silence_start: 1.234
 *   [silencedetect @ ...] silence_end: 2.345 | silence_duration: 1.111
 */
export function parseSilenceDetectOutput(output: string): SilenceInterval[] {
  const intervals: SilenceInterval[] = [];
  const lines = output.split("\n");

  let currentStart: number | null = null;

  for (const line of lines) {
    const startMatch = line.match(/silence_start:\s*([\d.]+)/);
    if (startMatch) {
      currentStart = parseFloat(startMatch[1]);
      continue;
    }

    const endMatch = line.match(
      /silence_end:\s*([\d.]+)\s*\|\s*silence_duration:\s*([\d.]+)/,
    );
    if (endMatch && currentStart !== null) {
      const end = parseFloat(endMatch[1]);
      const duration = parseFloat(endMatch[2]);
      intervals.push({ start: currentStart, end, duration });
      currentStart = null;
    }
  }

  return intervals.sort((a, b) => a.start - b.start);
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
// FFmpeg: Audio splitting
// ---------------------------------------------------------------------------

/**
 * Extract a segment from an audio file using FFmpeg.
 * Outputs mono WAV at 22.05 kHz, 16-bit PCM.
 */
export async function extractAudioSegment(
  inputPath: string,
  outputPath: string,
  startTime: number,
  endTime: number,
): Promise<void> {
  const duration = endTime - startTime;

  mkdirSync(join(outputPath, ".."), { recursive: true });

  await execFileAsync("ffmpeg", [
    "-y",
    "-i",
    inputPath,
    "-ss",
    startTime.toFixed(3),
    "-t",
    duration.toFixed(3),
    "-ac",
    "1",
    "-ar",
    "22050",
    "-acodec",
    "pcm_s16le",
    "-f",
    "wav",
    outputPath,
  ]);
}

// ---------------------------------------------------------------------------
// Silence-to-verse mapping
// ---------------------------------------------------------------------------

/**
 * Given silence intervals and the total audio duration, derive segment
 * boundaries (the speech portions between silences).
 *
 * Uses the midpoint of each silence interval as the cut point.
 */
export function silencesToSegmentBoundaries(
  silences: SilenceInterval[],
  totalDuration: number,
): { start: number; end: number }[] {
  if (silences.length === 0) {
    return [{ start: 0, end: totalDuration }];
  }

  const cutPoints: number[] = [];
  for (const s of silences) {
    const midpoint = (s.start + s.end) / 2;
    cutPoints.push(midpoint);
  }

  const boundaries: { start: number; end: number }[] = [];
  let prevEnd = 0;

  for (const cut of cutPoints) {
    if (cut > prevEnd) {
      boundaries.push({ start: prevEnd, end: cut });
    }
    prevEnd = cut;
  }

  // Final segment
  if (prevEnd < totalDuration) {
    boundaries.push({ start: prevEnd, end: totalDuration });
  }

  return boundaries;
}

// ---------------------------------------------------------------------------
// Segment duration adjustment
// ---------------------------------------------------------------------------

/**
 * Adjust segments to fit within the target duration range.
 *
 * Strategy:
 * - Segments within [MIN, MAX]: keep as-is
 * - Very long segments (> MAX): split at proportional points
 * - Very short segments (< VERY_SHORT_THRESHOLD): merge with adjacent
 * - Short segments (< MIN but >= VERY_SHORT_THRESHOLD): keep but flag
 */
export function adjustSegmentDurations(
  segments: { start: number; end: number; verseIndices: number[] }[],
  verses: TRVerse[],
  minDuration: number = MIN_SEGMENT_DURATION,
  maxDuration: number = MAX_SEGMENT_DURATION,
): { start: number; end: number; verseIndices: number[]; wasSplit: boolean; wasMerged: boolean }[] {
  const adjusted: {
    start: number;
    end: number;
    verseIndices: number[];
    wasSplit: boolean;
    wasMerged: boolean;
  }[] = [];

  for (const seg of segments) {
    const duration = seg.end - seg.start;

    if (duration > maxDuration) {
      // Split long segments proportionally
      const numParts = Math.ceil(duration / maxDuration);
      const partDuration = duration / numParts;

      for (let i = 0; i < numParts; i++) {
        adjusted.push({
          start: seg.start + i * partDuration,
          end: seg.start + (i + 1) * partDuration,
          verseIndices: seg.verseIndices,
          wasSplit: true,
          wasMerged: false,
        });
      }
    } else {
      adjusted.push({ ...seg, wasSplit: false, wasMerged: false });
    }
  }

  // Merge very short segments with adjacent
  const merged: typeof adjusted = [];
  for (let i = 0; i < adjusted.length; i++) {
    const seg = adjusted[i];
    const duration = seg.end - seg.start;

    if (
      duration < VERY_SHORT_THRESHOLD &&
      merged.length > 0 &&
      !seg.wasSplit
    ) {
      // Merge with previous segment
      const prev = merged[merged.length - 1];
      prev.end = seg.end;
      prev.verseIndices = [
        ...new Set([...prev.verseIndices, ...seg.verseIndices]),
      ];
      prev.wasMerged = true;
    } else {
      merged.push({ ...seg });
    }
  }

  return merged;
}

// ---------------------------------------------------------------------------
// Core alignment pipeline
// ---------------------------------------------------------------------------

/**
 * Get verses for a specific book and chapter from the TR text.
 */
export function getChapterVerses(
  allVerses: TRVerse[],
  book: string,
  chapter: number,
): TRVerse[] {
  return allVerses.filter((v) => v.book === book && v.chapter === chapter);
}

/**
 * Get the list of unique chapters for a book.
 */
export function getBookChapters(allVerses: TRVerse[], book: string): number[] {
  const chapters = new Set<number>();
  for (const v of allVerses) {
    if (v.book === book) chapters.add(v.chapter);
  }
  return [...chapters].sort((a, b) => a - b);
}

/**
 * Align silence-based segments to verses for a single chapter.
 *
 * Maps segments to verses sequentially: the first N silences correspond
 * to the first N verse boundaries. If we have more or fewer segments
 * than verses, we log discrepancies.
 */
export function alignSegmentsToVerses(
  boundaries: { start: number; end: number }[],
  chapterVerses: TRVerse[],
  book: string,
  chapter: number,
): { segments: SegmentInfo[]; errors: AlignmentError[] } {
  const segments: SegmentInfo[] = [];
  const errors: AlignmentError[] = [];

  if (chapterVerses.length === 0) {
    errors.push({
      book,
      chapter,
      message: `No TR verses found for ${book} chapter ${chapter}`,
    });
    return { segments, errors };
  }

  if (boundaries.length === 0) {
    errors.push({
      book,
      chapter,
      message: `No audio segments detected for ${book} chapter ${chapter}`,
    });
    return { segments, errors };
  }

  // If segment count matches verse count well, do 1:1 mapping
  // Otherwise, distribute verses across segments proportionally
  const numBoundaries = boundaries.length;
  const numVerses = chapterVerses.length;

  if (numBoundaries === numVerses) {
    // Perfect 1:1 mapping
    for (let i = 0; i < numVerses; i++) {
      const b = boundaries[i];
      const v = chapterVerses[i];
      const duration = b.end - b.start;

      segments.push({
        id: makeSegmentId(book, chapter, v.verse, 0),
        filename: makeSegmentFilename(book, chapter, v.verse, 0),
        book: book.toLowerCase().replace(/\s+/g, ""),
        chapter,
        verse: v.verse,
        segment: 0,
        startTime: b.start,
        endTime: b.end,
        duration,
        transcript: normalizePunctuation(v.text),
        hasDiscrepancy: false,
      });
    }
  } else {
    // Proportional mapping: distribute verses across segments
    const ratio = numVerses / numBoundaries;
    const hasDiscrepancy = true;
    const note =
      numBoundaries < numVerses
        ? `Fewer segments (${numBoundaries}) than verses (${numVerses}); some segments contain multiple verses`
        : `More segments (${numBoundaries}) than verses (${numVerses}); some verses split across segments`;

    if (numBoundaries < numVerses) {
      // More verses than segments: combine verses into segments
      for (let i = 0; i < numBoundaries; i++) {
        const b = boundaries[i];
        const startVerse = Math.floor(i * ratio);
        const endVerse = Math.min(Math.floor((i + 1) * ratio), numVerses);
        const mappedVerses = chapterVerses.slice(startVerse, endVerse);
        const duration = b.end - b.start;

        const transcript = mappedVerses
          .map((v) => normalizePunctuation(v.text))
          .join(" ");

        segments.push({
          id: makeSegmentId(book, chapter, mappedVerses[0].verse, 0),
          filename: makeSegmentFilename(
            book,
            chapter,
            mappedVerses[0].verse,
            0,
          ),
          book: book.toLowerCase().replace(/\s+/g, ""),
          chapter,
          verse: mappedVerses[0].verse,
          segment: 0,
          startTime: b.start,
          endTime: b.end,
          duration,
          transcript,
          hasDiscrepancy,
          discrepancyNote: note,
        });
      }
    } else {
      // More segments than verses: some verses map to multiple segments
      const verseRatio = numBoundaries / numVerses;
      for (let vi = 0; vi < numVerses; vi++) {
        const v = chapterVerses[vi];
        const startSeg = Math.floor(vi * verseRatio);
        const endSeg = Math.min(
          Math.floor((vi + 1) * verseRatio),
          numBoundaries,
        );

        const sentences = splitIntoSentences(v.text);

        for (let si = startSeg; si < endSeg; si++) {
          const b = boundaries[si];
          const duration = b.end - b.start;
          const segIdx = si - startSeg;

          // Distribute sentences across sub-segments
          const sentenceIdx = Math.min(segIdx, sentences.length - 1);
          const transcript = normalizePunctuation(
            sentences[sentenceIdx] || v.text,
          );

          segments.push({
            id: makeSegmentId(book, chapter, v.verse, segIdx),
            filename: makeSegmentFilename(book, chapter, v.verse, segIdx),
            book: book.toLowerCase().replace(/\s+/g, ""),
            chapter,
            verse: v.verse,
            segment: segIdx,
            startTime: b.start,
            endTime: b.end,
            duration,
            transcript,
            hasDiscrepancy,
            discrepancyNote: note,
          });
        }
      }
    }

    errors.push({
      book,
      chapter,
      message: note,
    });
  }

  return { segments, errors };
}

// ---------------------------------------------------------------------------
// Chapter-level WAV file discovery
// ---------------------------------------------------------------------------

/**
 * Find chapter-level WAV files for a given book.
 * Expected location: data/tts-training/karvounakis/wavs/{book}/
 * Files are named like "Chapter 01.wav" or similar.
 */
export async function findChapterWavFiles(
  bookKey: string,
): Promise<ChapterAudio[]> {
  const bookDir = join(WAVS_INPUT_DIR, bookKey);
  if (!existsSync(bookDir)) return [];

  const files = await readdir(bookDir);
  const wavFiles = files
    .filter((f) => f.toLowerCase().endsWith(".wav"))
    .sort();

  const results: ChapterAudio[] = [];

  for (const file of wavFiles) {
    // Try to extract chapter number from filename
    const chapterMatch = file.match(/(\d+)/);
    if (!chapterMatch) continue;

    const chapter = parseInt(chapterMatch[1], 10);
    const filePath = join(bookDir, file);

    results.push({
      book: bookKey,
      chapter,
      filePath,
      duration: 0, // Will be populated later
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Metadata CSV generation
// ---------------------------------------------------------------------------

/**
 * Generate metadata.csv content in LJSpeech format.
 * Format: filename|transcription (no header, pipe-delimited)
 */
export function generateMetadataCsv(segments: SegmentInfo[]): string {
  const lines: string[] = [];

  for (const seg of segments) {
    // Use filename without extension per LJSpeech convention
    const name = seg.filename.replace(/\.wav$/, "");
    const transcript = seg.transcript;

    if (!name || !transcript) continue;

    lines.push(`${name}|${transcript}`);
  }

  return lines.join("\n") + "\n";
}

/**
 * Validate metadata.csv content.
 * Returns an array of validation error messages.
 */
export function validateMetadataCsv(content: string): string[] {
  const errors: string[] = [];
  const lines = content.split("\n").filter((l) => l.trim().length > 0);

  if (lines.length === 0) {
    errors.push("metadata.csv is empty");
    return errors;
  }

  const seenFilenames = new Set<string>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const pipeIdx = line.indexOf("|");

    if (pipeIdx === -1) {
      errors.push(`Line ${i + 1}: missing pipe delimiter`);
      continue;
    }

    const filename = line.substring(0, pipeIdx).trim();
    const transcription = line.substring(pipeIdx + 1).trim();

    if (!filename) {
      errors.push(`Line ${i + 1}: empty filename`);
    }

    if (!transcription) {
      errors.push(`Line ${i + 1}: empty transcription for '${filename}'`);
    }

    if (seenFilenames.has(filename)) {
      errors.push(`Line ${i + 1}: duplicate filename '${filename}'`);
    }
    seenFilenames.add(filename);

    // Check UTF-8: ensure no replacement characters
    if (transcription.includes("\uFFFD")) {
      errors.push(
        `Line ${i + 1}: contains Unicode replacement character in '${filename}'`,
      );
    }
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Full pipeline: process one book
// ---------------------------------------------------------------------------

/**
 * Process a single book: detect silences, align to verses, split audio.
 */
export async function processBook(
  bookKey: string,
  allVerses: TRVerse[],
  dryRun: boolean,
): Promise<AlignmentResult> {
  const bookName =
    NT_BOOKS[bookKey]?.displayName ||
    Object.values(NT_BOOKS).find(
      (v) => v.displayName.toLowerCase().replace(/\s+/g, "") === bookKey,
    )?.displayName ||
    bookKey;

  const chapters = getBookChapters(allVerses, bookName);
  const allSegments: SegmentInfo[] = [];
  const allErrors: AlignmentError[] = [];

  const chapterFiles = await findChapterWavFiles(bookKey);

  for (const ch of chapters) {
    const chapterVerses = getChapterVerses(allVerses, bookName, ch);

    // Find the WAV file for this chapter
    const chapterFile = chapterFiles.find((f) => f.chapter === ch);

    if (!chapterFile) {
      if (!dryRun) {
        allErrors.push({
          book: bookName,
          chapter: ch,
          message: `No WAV file found for ${bookName} chapter ${ch}`,
        });
      }

      // In dry-run mode, generate segments based on text only
      if (dryRun) {
        for (let i = 0; i < chapterVerses.length; i++) {
          const v = chapterVerses[i];
          // Estimate ~2s per verse for dry run
          const estStart = i * 8;
          const estEnd = (i + 1) * 8;

          allSegments.push({
            id: makeSegmentId(bookName, ch, v.verse, 0),
            filename: makeSegmentFilename(bookName, ch, v.verse, 0),
            book: bookKey,
            chapter: ch,
            verse: v.verse,
            segment: 0,
            startTime: estStart,
            endTime: estEnd,
            duration: estEnd - estStart,
            transcript: normalizePunctuation(v.text),
            hasDiscrepancy: false,
            discrepancyNote: "dry-run estimate",
          });
        }
      }
      continue;
    }

    try {
      // Get audio duration
      const totalDuration = await getAudioDuration(chapterFile.filePath);
      chapterFile.duration = totalDuration;

      // Detect silences
      const silences = await detectSilences(chapterFile.filePath);

      // Convert silences to segment boundaries
      const boundaries = silencesToSegmentBoundaries(silences, totalDuration);

      // Align segments to verses
      const { segments, errors } = alignSegmentsToVerses(
        boundaries,
        chapterVerses,
        bookName,
        ch,
      );

      // Apply duration adjustments
      const withDurationInfo = segments.map((seg) => ({
        start: seg.startTime,
        end: seg.endTime,
        verseIndices: [
          chapterVerses.findIndex(
            (v) => v.verse === seg.verse && v.chapter === seg.chapter,
          ),
        ],
      }));

      const adjustedBounds = adjustSegmentDurations(
        withDurationInfo,
        chapterVerses,
      );

      // Re-map adjusted bounds back to SegmentInfo objects
      const adjustedSegments: SegmentInfo[] = [];
      for (let i = 0; i < adjustedBounds.length; i++) {
        const adj = adjustedBounds[i];
        const origSeg = segments[Math.min(i, segments.length - 1)];
        const duration = adj.end - adj.start;

        const segIdx = adj.wasSplit
          ? adjustedSegments.filter(
              (s) => s.verse === origSeg.verse && s.chapter === origSeg.chapter,
            ).length
          : origSeg.segment;

        adjustedSegments.push({
          id: makeSegmentId(bookName, ch, origSeg.verse, segIdx),
          filename: makeSegmentFilename(bookName, ch, origSeg.verse, segIdx),
          book: bookKey,
          chapter: ch,
          verse: origSeg.verse,
          segment: segIdx,
          startTime: adj.start,
          endTime: adj.end,
          duration,
          transcript: origSeg.transcript,
          hasDiscrepancy:
            origSeg.hasDiscrepancy || adj.wasSplit || adj.wasMerged,
          discrepancyNote: adj.wasSplit
            ? "Split from long segment"
            : adj.wasMerged
              ? "Merged from short segment"
              : origSeg.discrepancyNote,
        });
      }

      // Extract audio segments (if not dry run)
      if (!dryRun) {
        for (const seg of adjustedSegments) {
          const outputPath = join(WAVS_OUTPUT_DIR, seg.filename);
          try {
            await extractAudioSegment(
              chapterFile.filePath,
              outputPath,
              seg.startTime,
              seg.endTime,
            );
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            allErrors.push({
              book: bookName,
              chapter: ch,
              verse: seg.verse,
              message: `Failed to extract segment ${seg.filename}: ${msg}`,
            });
          }
        }
      }

      allSegments.push(...adjustedSegments);
      allErrors.push(...errors);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      allErrors.push({
        book: bookName,
        chapter: ch,
        message: `Error processing ${bookName} chapter ${ch}: ${msg}`,
      });
    }
  }

  // Compute stats
  const stats = {
    totalSegments: allSegments.length,
    totalDuration: allSegments.reduce((sum, s) => sum + s.duration, 0),
    inRangeCount: allSegments.filter(
      (s) =>
        s.duration >= MIN_SEGMENT_DURATION &&
        s.duration <= MAX_SEGMENT_DURATION,
    ).length,
    tooShortCount: allSegments.filter(
      (s) => s.duration < MIN_SEGMENT_DURATION,
    ).length,
    tooLongCount: allSegments.filter(
      (s) => s.duration > MAX_SEGMENT_DURATION,
    ).length,
    discrepancyCount: allSegments.filter((s) => s.hasDiscrepancy).length,
  };

  return { segments: allSegments, errors: allErrors, stats };
}

// ---------------------------------------------------------------------------
// Load TR text
// ---------------------------------------------------------------------------

/**
 * Load the TR text from the JSON file.
 */
export function loadTRText(path: string = TR_TEXT_PATH): TRVerse[] {
  if (!existsSync(path)) {
    throw new Error(
      `TR text file not found: ${path}\n` +
        `Run 'npx tsx scripts/prepare-tr-text.ts' first.`,
    );
  }

  const raw = readFileSync(path, "utf-8");
  const data: TROutput = JSON.parse(raw);
  return data.verses;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

interface CLIArgs {
  dryRun: boolean;
  books: string[] | null;
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

  console.log("=== Karvounakis Audio Segmentation & TR Alignment ===");
  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);
  console.log(`Output: ${DATA_DIR}`);
  console.log();

  // Verify FFmpeg is available (unless dry run)
  if (!dryRun) {
    try {
      await execFileAsync("ffmpeg", ["-version"]);
    } catch {
      console.error("ERROR: FFmpeg is not installed or not in PATH.");
      console.error(
        "Install FFmpeg: sudo apt install ffmpeg (Linux) or brew install ffmpeg (macOS)",
      );
      process.exit(1);
    }
  }

  // Load TR text
  let allVerses: TRVerse[];
  try {
    allVerses = loadTRText();
    console.log(`Loaded ${allVerses.length} TR verses.`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`ERROR: ${msg}`);
    process.exit(1);
  }
  console.log();

  // Determine books to process
  const booksToProcess = filterBooks
    ? Object.entries(NT_BOOKS).filter(([key]) => filterBooks.includes(key))
    : Object.entries(NT_BOOKS);

  const allSegments: SegmentInfo[] = [];
  const allErrors: AlignmentError[] = [];
  let totalStats = {
    totalSegments: 0,
    totalDuration: 0,
    inRangeCount: 0,
    tooShortCount: 0,
    tooLongCount: 0,
    discrepancyCount: 0,
  };

  for (const [bookKey, bookInfo] of booksToProcess) {
    const displayName = bookInfo.displayName;
    console.log(`--- ${displayName} (${bookKey}) ---`);

    const result = await processBook(bookKey, allVerses, dryRun);

    allSegments.push(...result.segments);
    allErrors.push(...result.errors);
    totalStats.totalSegments += result.stats.totalSegments;
    totalStats.totalDuration += result.stats.totalDuration;
    totalStats.inRangeCount += result.stats.inRangeCount;
    totalStats.tooShortCount += result.stats.tooShortCount;
    totalStats.tooLongCount += result.stats.tooLongCount;
    totalStats.discrepancyCount += result.stats.discrepancyCount;

    console.log(
      `  Segments: ${result.stats.totalSegments} ` +
        `(in range: ${result.stats.inRangeCount}, ` +
        `short: ${result.stats.tooShortCount}, ` +
        `long: ${result.stats.tooLongCount})`,
    );

    if (result.errors.length > 0) {
      console.log(`  Alignment issues: ${result.errors.length}`);
      for (const err of result.errors) {
        console.log(`    - ${err.message}`);
      }
    }
    console.log();
  }

  // Generate metadata.csv
  const metadataContent = generateMetadataCsv(allSegments);
  const metadataErrors = validateMetadataCsv(metadataContent);

  if (metadataErrors.length > 0) {
    console.log("Metadata validation issues:");
    for (const err of metadataErrors) {
      console.log(`  - ${err}`);
    }
    console.log();
  }

  if (!dryRun) {
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(METADATA_PATH, metadataContent, "utf-8");
    console.log(`Wrote metadata.csv: ${allSegments.length} entries`);
  } else {
    console.log(
      `[DRY] Would write metadata.csv with ${allSegments.length} entries`,
    );
  }

  // Write alignment errors log
  if (allErrors.length > 0) {
    const errLogPath = join(DATA_DIR, "alignment-errors.log");
    const errContent = allErrors
      .map(
        (e) =>
          `[${e.book}${e.chapter ? ` ${e.chapter}` : ""}${e.verse ? `:${e.verse}` : ""}] ${e.message}`,
      )
      .join("\n");

    if (!dryRun) {
      writeFileSync(errLogPath, errContent + "\n", "utf-8");
      console.log(
        `Wrote alignment-errors.log: ${allErrors.length} issues`,
      );
    } else {
      console.log(
        `[DRY] Would write alignment-errors.log with ${allErrors.length} issues`,
      );
    }
  }

  // Summary
  console.log();
  console.log("=== Summary ===");
  console.log(`Books processed:     ${booksToProcess.length}`);
  console.log(`Total segments:      ${totalStats.totalSegments}`);
  console.log(`In range (5-15s):    ${totalStats.inRangeCount}`);
  console.log(`Too short (<5s):     ${totalStats.tooShortCount}`);
  console.log(`Too long (>15s):     ${totalStats.tooLongCount}`);
  console.log(`Discrepancies:       ${totalStats.discrepancyCount}`);
  console.log(
    `Total duration:      ${(totalStats.totalDuration / 3600).toFixed(1)} hours`,
  );
  console.log(`Alignment errors:    ${allErrors.length}`);
  console.log(`Metadata errors:     ${metadataErrors.length}`);
  console.log();
  console.log("=== Done ===");

  if (allErrors.length > 0) {
    console.log();
    console.log(
      "Note: Alignment errors have been logged for manual review.",
    );
    console.log(
      "These are informational and do not prevent processing.",
    );
  }
}

// Run main if this is the direct entry point
const isDirectExecution =
  typeof process !== "undefined" &&
  typeof process.argv !== "undefined" &&
  process.argv[1]?.endsWith("segment-karvounakis.ts") === true;

if (isDirectExecution) {
  main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
