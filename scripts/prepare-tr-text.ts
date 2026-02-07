#!/usr/bin/env npx tsx
/**
 * Download, clean, and structure Scrivener's Textus Receptus 1894 Greek text
 * for audio-text alignment with the Karvounakis recordings.
 *
 * Source: ManolisMariakakis/Narration-of-the-Greek-New-Testament-TR-Scrivener-1894
 * License: Public Domain (Scrivener's TR 1894 text is out of copyright)
 *
 * Usage:
 *   npx tsx scripts/prepare-tr-text.ts
 *   npx tsx scripts/prepare-tr-text.ts --dry-run
 */

import { writeFileSync, mkdirSync } from "fs";
import path from "path";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TR_SOURCE_URL =
  "https://raw.githubusercontent.com/ManolisMariakakis/Narration-of-the-Greek-New-Testament-TR-Scrivener-1894/main/tr1894.txt";

const OUTPUT_DIR = path.resolve(
  __dirname,
  "../data/tts-training/karvounakis",
);
const OUTPUT_FILE = path.join(OUTPUT_DIR, "tr-text.json");

/**
 * Mapping from 3-letter abbreviation in the source to standard book names.
 * The source uses abbreviations like MAT, MRK, LUK, JHN, ACT, ROM, etc.
 */
export const BOOK_ABBREV_TO_NAME: Record<string, string> = {
  MAT: "Matthew",
  MRK: "Mark",
  LUK: "Luke",
  JHN: "John",
  ACT: "Acts",
  ROM: "Romans",
  "1CO": "1 Corinthians",
  "2CO": "2 Corinthians",
  GAL: "Galatians",
  EPH: "Ephesians",
  PHP: "Philippians",
  COL: "Colossians",
  "1TH": "1 Thessalonians",
  "2TH": "2 Thessalonians",
  "1TI": "1 Timothy",
  "2TI": "2 Timothy",
  TIT: "Titus",
  PHM: "Philemon",
  HEB: "Hebrews",
  JAS: "James",
  "1PE": "1 Peter",
  "2PE": "2 Peter",
  "1JN": "1 John",
  "2JN": "2 John",
  "3JN": "3 John",
  JUD: "Jude",
  REV: "Revelation",
};

/** All 27 NT books in canonical order. */
export const NT_BOOKS = Object.values(BOOK_ABBREV_TO_NAME);

/**
 * Expected approximate verse counts per book for validation.
 * These are widely accepted totals for the Textus Receptus.
 */
export const EXPECTED_VERSE_COUNTS: Record<string, number> = {
  Matthew: 1071,
  Mark: 678,
  Luke: 1151,
  John: 879,
  Acts: 1007,
  Romans: 433,
  "1 Corinthians": 437,
  "2 Corinthians": 257,
  Galatians: 149,
  Ephesians: 155,
  Philippians: 104,
  Colossians: 95,
  "1 Thessalonians": 89,
  "2 Thessalonians": 47,
  "1 Timothy": 113,
  "2 Timothy": 83,
  Titus: 46,
  Philemon: 25,
  Hebrews: 303,
  James: 108,
  "1 Peter": 105,
  "2 Peter": 61,
  "1 John": 105,
  "2 John": 13,
  "3 John": 14, // Some TR editions count 15 verses; Scrivener 1894 source has 14
  Jude: 25,
  Revelation: 404,
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TRVerse {
  book: string;
  chapter: number;
  verse: number;
  text: string;
}

export interface TROutput {
  metadata: {
    source: string;
    sourceUrl: string;
    license: string;
    generatedAt: string;
    totalVerses: number;
    totalBooks: number;
  };
  verses: TRVerse[];
}

// ---------------------------------------------------------------------------
// Text cleaning and normalization
// ---------------------------------------------------------------------------

/**
 * Apply NFC Unicode normalization and clean up the Greek text.
 *
 * - NFC normalization ensures composed characters (e.g. accented letters)
 * - Strips textual apparatus markers if any (brackets, daggers, etc.)
 * - Normalizes whitespace
 * - Trims leading/trailing whitespace
 */
export function normalizeGreekText(raw: string): string {
  let text = raw;

  // NFC normalize
  text = text.normalize("NFC");

  // Strip textual apparatus markers: square brackets, angle brackets, daggers
  text = text.replace(/[\[\]<>{}]/g, "");
  text = text.replace(/[\u2020\u2021]/g, ""); // dagger, double dagger

  // Normalize whitespace: collapse multiple spaces, trim
  text = text.replace(/\s+/g, " ").trim();

  return text;
}

/**
 * Detect and report non-UTF-8 / problematic characters in a string.
 * Returns an array of issues found, empty if clean.
 */
export function detectEncodingIssues(text: string): string[] {
  const issues: string[] = [];

  // Check for replacement character (indicates encoding problems)
  if (text.includes("\uFFFD")) {
    issues.push("Contains Unicode replacement character U+FFFD");
  }

  // Check for null bytes
  if (text.includes("\0")) {
    issues.push("Contains null byte");
  }

  // Check for characters outside expected ranges
  // Expected: Greek and Coptic (0370-03FF), Greek Extended (1F00-1FFF),
  // Basic Latin (0000-007F), Latin-1 Supplement (00A0-00FF, includes middle dot U+00B7),
  // Latin Extended-A/B (0100-024F), Spacing Modifier Letters (02B0-02FF, includes U+02B9 numeral prime),
  // Combining Diacritical Marks (0300-036F), General Punctuation (2000-206F)
  const unexpectedChar = /[^\u0000-\u00FF\u0100-\u024F\u02B0-\u02FF\u0300-\u036F\u0370-\u03FF\u1F00-\u1FFF\u2000-\u206F]/;
  const match = text.match(unexpectedChar);
  if (match) {
    const code = match[0].codePointAt(0)?.toString(16).toUpperCase();
    issues.push(`Contains unexpected character U+${code}: '${match[0]}'`);
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * Parse the raw TR text file into structured verse objects.
 *
 * Expected format per line:
 *   id@bookChapterNumber@shortDescription@text
 *
 * Where shortDescription is like "MAT.1.1" (BOOK.CHAPTER.VERSE).
 *
 * @param rawText - Full text content of the TR file.
 * @returns Array of parsed verses and any missing verse warnings.
 */
export function parseTRText(rawText: string): {
  verses: TRVerse[];
  warnings: string[];
} {
  const lines = rawText.split("\n").filter((line) => line.trim().length > 0);
  const verses: TRVerse[] = [];
  const warnings: string[] = [];

  // Skip header line
  const startIndex = lines[0]?.startsWith("id@") ? 1 : 0;

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i];
    const parts = line.split("@");

    if (parts.length < 4) {
      warnings.push(`Line ${i + 1}: Unexpected format (fewer than 4 fields)`);
      continue;
    }

    const reference = parts[2]; // e.g., "MAT.1.1"
    const rawText = parts.slice(3).join("@"); // rejoin in case text contains @

    const refParts = reference.split(".");
    if (refParts.length !== 3) {
      warnings.push(
        `Line ${i + 1}: Could not parse reference '${reference}'`,
      );
      continue;
    }

    const [bookAbbrev, chapterStr, verseStr] = refParts;
    const book = BOOK_ABBREV_TO_NAME[bookAbbrev];
    if (!book) {
      warnings.push(
        `Line ${i + 1}: Unknown book abbreviation '${bookAbbrev}'`,
      );
      continue;
    }

    const chapter = parseInt(chapterStr, 10);
    const verse = parseInt(verseStr, 10);

    if (isNaN(chapter) || isNaN(verse)) {
      warnings.push(
        `Line ${i + 1}: Invalid chapter/verse numbers in '${reference}'`,
      );
      continue;
    }

    const text = normalizeGreekText(rawText);
    const encodingIssues = detectEncodingIssues(text);
    if (encodingIssues.length > 0) {
      warnings.push(
        `${book} ${chapter}:${verse}: ${encodingIssues.join("; ")}`,
      );
    }

    verses.push({ book, chapter, verse, text });
  }

  return { verses, warnings };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate that all 27 NT books are present and log book-level stats.
 */
export function validateCompleteness(verses: TRVerse[]): {
  bookCounts: Record<string, number>;
  missingBooks: string[];
  totalVerses: number;
} {
  const bookCounts: Record<string, number> = {};
  for (const v of verses) {
    bookCounts[v.book] = (bookCounts[v.book] || 0) + 1;
  }

  const missingBooks = NT_BOOKS.filter((book) => !bookCounts[book]);

  return {
    bookCounts,
    missingBooks,
    totalVerses: verses.length,
  };
}

// ---------------------------------------------------------------------------
// Download
// ---------------------------------------------------------------------------

/**
 * Fetch the TR text from the GitHub source.
 */
export async function downloadTRText(
  url: string = TR_SOURCE_URL,
): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to download TR text: ${response.status} ${response.statusText}`,
    );
  }
  return response.text();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");

  console.log("=== Textus Receptus 1894 Text Preparation ===");
  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);
  console.log();

  // Download
  console.log(`Downloading TR text from: ${TR_SOURCE_URL}`);
  const rawText = await downloadTRText();
  console.log(`Downloaded ${rawText.length} characters.`);
  console.log();

  // Parse
  console.log("Parsing and normalizing text...");
  const { verses, warnings } = parseTRText(rawText);

  if (warnings.length > 0) {
    console.log(`Warnings (${warnings.length}):`);
    for (const w of warnings) {
      console.log(`  - ${w}`);
    }
    console.log();
  }

  // Validate
  const { bookCounts, missingBooks, totalVerses } =
    validateCompleteness(verses);

  console.log("Book verse counts:");
  for (const book of NT_BOOKS) {
    const count = bookCounts[book] || 0;
    const expected = EXPECTED_VERSE_COUNTS[book] || "?";
    const match = count === expected ? "OK" : `EXPECTED ${expected}`;
    console.log(`  ${book}: ${count} verses [${match}]`);
  }
  console.log();

  console.log(`Total verses: ${totalVerses}`);
  console.log(`Total books: ${Object.keys(bookCounts).length}/27`);

  if (missingBooks.length > 0) {
    console.error(`MISSING BOOKS: ${missingBooks.join(", ")}`);
  }
  console.log();

  // Output
  if (dryRun) {
    console.log("Dry run - not writing output file.");
    console.log(`Would write ${totalVerses} verses to: ${OUTPUT_FILE}`);
  } else {
    const output: TROutput = {
      metadata: {
        source: "Scrivener's Textus Receptus 1894",
        sourceUrl: TR_SOURCE_URL,
        license:
          "Public Domain - Scrivener's TR 1894 text is out of copyright. " +
          "Source data from ManolisMariakakis/Narration-of-the-Greek-New-Testament-TR-Scrivener-1894 (GitHub).",
        generatedAt: new Date().toISOString(),
        totalVerses,
        totalBooks: Object.keys(bookCounts).length,
      },
      verses,
    };

    mkdirSync(OUTPUT_DIR, { recursive: true });
    writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), "utf-8");
    console.log(`Wrote ${totalVerses} verses to: ${OUTPUT_FILE}`);
  }

  console.log();
  console.log("=== Public Domain Documentation ===");
  console.log(
    "Scrivener's Textus Receptus was published in 1894 by F.H.A. Scrivener.",
  );
  console.log(
    "The text itself is in the public domain (published over 100 years ago).",
  );
  console.log(
    "Machine-readable source: github.com/ManolisMariakakis/Narration-of-the-Greek-New-Testament-TR-Scrivener-1894",
  );
  console.log("=== Done ===");
}

// Run main if this is the direct entry point
const isDirectExecution =
  typeof process !== "undefined" &&
  typeof process.argv !== "undefined" &&
  process.argv[1]?.endsWith("prepare-tr-text.ts") === true;

if (isDirectExecution) {
  main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
