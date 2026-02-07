import { describe, it, expect } from "vitest";
import {
  makeSegmentFilename,
  makeSegmentId,
  normalizePunctuation,
  splitIntoSentences,
  parseSilenceDetectOutput,
  silencesToSegmentBoundaries,
  adjustSegmentDurations,
  getChapterVerses,
  getBookChapters,
  alignSegmentsToVerses,
  generateMetadataCsv,
  validateMetadataCsv,
} from "./segment-karvounakis";
import type { SegmentInfo } from "./segment-karvounakis";
import type { TRVerse } from "./prepare-tr-text";

// ---------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------

const SAMPLE_VERSES: TRVerse[] = [
  {
    book: "Matthew",
    chapter: 1,
    verse: 1,
    text: "\u0392\u03af\u03b2\u03bb\u03bf\u03c2 \u03b3\u03b5\u03bd\u03ad\u03c3\u03b5\u03c9\u03c2 \u1f38\u03b7\u03c3\u03bf\u1fe6 \u03a7\u03c1\u03b9\u03c3\u03c4\u03bf\u1fe6, \u03c5\u1f31\u03bf\u1fe6 \u0394\u03b1\u03b2\u1f76\u03b4, \u03c5\u1f31\u03bf\u1fe6 \u1f08\u03b2\u03c1\u03b1\u03ac\u03bc.",
  },
  {
    book: "Matthew",
    chapter: 1,
    verse: 2,
    text: "\u1f08\u03b2\u03c1\u03b1\u1f70\u03bc \u1f10\u03b3\u03ad\u03bd\u03bd\u03b7\u03c3\u03b5 \u03c4\u1f78\u03bd \u1f38\u03c3\u03b1\u03ac\u03ba\u00b7 \u1f38\u03c3\u03b1\u1f70\u03ba \u03b4\u1f72 \u1f10\u03b3\u03ad\u03bd\u03bd\u03b7\u03c3\u03b5 \u03c4\u1f78\u03bd \u1f38\u03b1\u03ba\u03ce\u03b2\u00b7",
  },
  {
    book: "Matthew",
    chapter: 1,
    verse: 3,
    text: "\u1f38\u03b1\u03ba\u1f7c\u03b2 \u03b4\u1f72 \u1f10\u03b3\u03ad\u03bd\u03bd\u03b7\u03c3\u03b5 \u03c4\u1f78\u03bd \u1f38\u03bf\u03cd\u03b4\u03b1\u03bd.",
  },
  {
    book: "Matthew",
    chapter: 2,
    verse: 1,
    text: "\u03a4\u03bf\u1fe6 \u03b4\u1f72 \u1f38\u03b7\u03c3\u03bf\u1fe6 \u03b3\u03b5\u03bd\u03bd\u03b7\u03b8\u03ad\u03bd\u03c4\u03bf\u03c2.",
  },
  {
    book: "Mark",
    chapter: 1,
    verse: 1,
    text: "\u1f08\u03c1\u03c7\u1f74 \u03c4\u03bf\u1fe6 \u03b5\u1f50\u03b1\u03b3\u03b3\u03b5\u03bb\u03af\u03bf\u03c5 \u1f38\u03b7\u03c3\u03bf\u1fe6 \u03a7\u03c1\u03b9\u03c3\u03c4\u03bf\u1fe6.",
  },
];

// ---------------------------------------------------------------------------
// Unit: Filename convention
// ---------------------------------------------------------------------------

describe("makeSegmentFilename", () => {
  it("generates correct filename format", () => {
    const result = makeSegmentFilename("Matthew", 1, 1, 0);
    expect(result).toBe("karvounakis_matthew_001_001_00.wav");
  });

  it("handles multi-word book names", () => {
    const result = makeSegmentFilename("1 Corinthians", 3, 16, 2);
    expect(result).toBe("karvounakis_1corinthians_003_016_02.wav");
  });

  it("pads numbers correctly", () => {
    const result = makeSegmentFilename("Revelation", 22, 21, 0);
    expect(result).toBe("karvounakis_revelation_022_021_00.wav");
  });
});

describe("makeSegmentId", () => {
  it("returns filename without .wav extension", () => {
    const result = makeSegmentId("Matthew", 1, 1, 0);
    expect(result).toBe("karvounakis_matthew_001_001_00");
    expect(result).not.toContain(".wav");
  });
});

// ---------------------------------------------------------------------------
// Unit: Punctuation normalization
// ---------------------------------------------------------------------------

describe("normalizePunctuation", () => {
  it("normalizes dash characters to em-dash", () => {
    const text = "word\u2013word\u2014word";
    const result = normalizePunctuation(text);
    expect(result).not.toContain("\u2013"); // en-dash gone
    expect(result).toContain("\u2014"); // em-dash remains
  });

  it("normalizes quotation marks", () => {
    const text = "\u201Cword\u201D";
    const result = normalizePunctuation(text);
    expect(result).toBe('"word"');
  });

  it("collapses multiple spaces", () => {
    const text = "word   word";
    const result = normalizePunctuation(text);
    expect(result).toBe("word word");
  });

  it("preserves Greek text unchanged", () => {
    const text =
      "\u0392\u03af\u03b2\u03bb\u03bf\u03c2 \u03b3\u03b5\u03bd\u03ad\u03c3\u03b5\u03c9\u03c2";
    const result = normalizePunctuation(text);
    expect(result).toBe(text);
  });

  it("ensures space after punctuation", () => {
    const text = "word,word";
    const result = normalizePunctuation(text);
    expect(result).toBe("word, word");
  });

  it("removes space before punctuation", () => {
    const text = "word , word";
    const result = normalizePunctuation(text);
    expect(result).toBe("word, word");
  });
});

// ---------------------------------------------------------------------------
// Unit: Sentence splitting
// ---------------------------------------------------------------------------

describe("splitIntoSentences", () => {
  it("splits at period boundaries", () => {
    const text = "First sentence. Second sentence.";
    const parts = splitIntoSentences(text);
    expect(parts.length).toBe(2);
    expect(parts[0]).toBe("First sentence.");
    expect(parts[1]).toBe("Second sentence.");
  });

  it("splits at ano teleia (middle dot) boundaries", () => {
    const text =
      "\u03BB\u03CC\u03B3\u03BF\u03C2\u00B7 \u03B4\u03B5\u03CD\u03C4\u03B5\u03C1\u03BF\u03C2.";
    const parts = splitIntoSentences(text);
    expect(parts.length).toBe(2);
  });

  it("returns single-element array for text with no boundaries", () => {
    const text = "No boundaries here";
    const parts = splitIntoSentences(text);
    expect(parts.length).toBe(1);
    expect(parts[0]).toBe("No boundaries here");
  });

  it("returns empty array for empty text", () => {
    expect(splitIntoSentences("")).toEqual([]);
    expect(splitIntoSentences("  ")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Unit: Silence detection parsing
// ---------------------------------------------------------------------------

describe("parseSilenceDetectOutput", () => {
  it("parses FFmpeg silencedetect output", () => {
    const output = `[silencedetect @ 0x5555] silence_start: 1.234
[silencedetect @ 0x5555] silence_end: 2.345 | silence_duration: 1.111
[silencedetect @ 0x5555] silence_start: 5.678
[silencedetect @ 0x5555] silence_end: 6.789 | silence_duration: 1.111`;

    const intervals = parseSilenceDetectOutput(output);
    expect(intervals.length).toBe(2);
    expect(intervals[0].start).toBeCloseTo(1.234);
    expect(intervals[0].end).toBeCloseTo(2.345);
    expect(intervals[0].duration).toBeCloseTo(1.111);
    expect(intervals[1].start).toBeCloseTo(5.678);
  });

  it("returns empty array for output with no silences", () => {
    const output = "Some random ffmpeg output with no silencedetect info";
    expect(parseSilenceDetectOutput(output)).toEqual([]);
  });

  it("sorts intervals by start time", () => {
    const output = `[silencedetect @ 0x5555] silence_start: 5.0
[silencedetect @ 0x5555] silence_end: 6.0 | silence_duration: 1.0
[silencedetect @ 0x5555] silence_start: 1.0
[silencedetect @ 0x5555] silence_end: 2.0 | silence_duration: 1.0`;

    const intervals = parseSilenceDetectOutput(output);
    expect(intervals[0].start).toBeCloseTo(1.0);
    expect(intervals[1].start).toBeCloseTo(5.0);
  });

  it("handles incomplete silence pairs (start without end)", () => {
    const output = `[silencedetect @ 0x5555] silence_start: 1.0
[silencedetect @ 0x5555] silence_start: 5.0
[silencedetect @ 0x5555] silence_end: 6.0 | silence_duration: 1.0`;

    const intervals = parseSilenceDetectOutput(output);
    // Second start overrides first; only the completed pair is returned
    expect(intervals.length).toBe(1);
    expect(intervals[0].start).toBeCloseTo(5.0);
  });
});

// ---------------------------------------------------------------------------
// Unit: Silence-to-segment boundaries
// ---------------------------------------------------------------------------

describe("silencesToSegmentBoundaries", () => {
  it("creates single segment when no silences detected", () => {
    const boundaries = silencesToSegmentBoundaries([], 60.0);
    expect(boundaries.length).toBe(1);
    expect(boundaries[0].start).toBe(0);
    expect(boundaries[0].end).toBe(60.0);
  });

  it("creates correct segments from silence intervals", () => {
    const silences = [
      { start: 9.5, end: 10.5, duration: 1.0 },
      { start: 19.5, end: 20.5, duration: 1.0 },
    ];

    const boundaries = silencesToSegmentBoundaries(silences, 30.0);
    expect(boundaries.length).toBe(3);

    // First segment: 0 to midpoint of first silence (10.0)
    expect(boundaries[0].start).toBe(0);
    expect(boundaries[0].end).toBeCloseTo(10.0);

    // Second segment: 10.0 to 20.0
    expect(boundaries[1].start).toBeCloseTo(10.0);
    expect(boundaries[1].end).toBeCloseTo(20.0);

    // Third segment: 20.0 to 30.0
    expect(boundaries[2].start).toBeCloseTo(20.0);
    expect(boundaries[2].end).toBe(30.0);
  });

  it("uses midpoints of silence intervals as cut points", () => {
    const silences = [{ start: 8.0, end: 12.0, duration: 4.0 }];

    const boundaries = silencesToSegmentBoundaries(silences, 20.0);
    // Midpoint of silence = 10.0
    expect(boundaries[0].end).toBeCloseTo(10.0);
    expect(boundaries[1].start).toBeCloseTo(10.0);
  });
});

// ---------------------------------------------------------------------------
// Unit: Segment duration adjustment
// ---------------------------------------------------------------------------

describe("adjustSegmentDurations", () => {
  it("keeps segments within range unchanged", () => {
    const segments = [
      { start: 0, end: 10, verseIndices: [0] },
      { start: 10, end: 20, verseIndices: [1] },
    ];

    const result = adjustSegmentDurations(segments, SAMPLE_VERSES, 5, 15);
    expect(result.length).toBe(2);
    expect(result[0].wasSplit).toBe(false);
    expect(result[0].wasMerged).toBe(false);
  });

  it("splits segments exceeding max duration", () => {
    const segments = [{ start: 0, end: 30, verseIndices: [0] }];

    const result = adjustSegmentDurations(segments, SAMPLE_VERSES, 5, 15);
    expect(result.length).toBe(2);
    expect(result[0].wasSplit).toBe(true);
    expect(result[0].end - result[0].start).toBeCloseTo(15);
    expect(result[1].end - result[1].start).toBeCloseTo(15);
  });

  it("merges very short segments with previous", () => {
    const segments = [
      { start: 0, end: 10, verseIndices: [0] },
      { start: 10, end: 11, verseIndices: [1] }, // 1s < 2s threshold
    ];

    const result = adjustSegmentDurations(segments, SAMPLE_VERSES, 5, 15);
    // Should merge second into first
    expect(result.length).toBe(1);
    expect(result[0].end).toBe(11);
    expect(result[0].wasMerged).toBe(true);
  });

  it("does not merge first very short segment (nothing to merge with)", () => {
    const segments = [
      { start: 0, end: 1, verseIndices: [0] }, // 1s, no previous to merge with
      { start: 1, end: 10, verseIndices: [1] },
    ];

    const result = adjustSegmentDurations(segments, SAMPLE_VERSES, 5, 15);
    expect(result.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Unit: Chapter verse helpers
// ---------------------------------------------------------------------------

describe("getChapterVerses", () => {
  it("returns verses for a specific book and chapter", () => {
    const verses = getChapterVerses(SAMPLE_VERSES, "Matthew", 1);
    expect(verses.length).toBe(3);
    expect(verses.every((v) => v.book === "Matthew" && v.chapter === 1)).toBe(
      true,
    );
  });

  it("returns empty array for non-existent chapter", () => {
    const verses = getChapterVerses(SAMPLE_VERSES, "Matthew", 99);
    expect(verses.length).toBe(0);
  });
});

describe("getBookChapters", () => {
  it("returns sorted unique chapters for a book", () => {
    const chapters = getBookChapters(SAMPLE_VERSES, "Matthew");
    expect(chapters).toEqual([1, 2]);
  });

  it("returns empty array for non-existent book", () => {
    const chapters = getBookChapters(SAMPLE_VERSES, "Galatians");
    expect(chapters).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Unit: Segment-to-verse alignment
// ---------------------------------------------------------------------------

describe("alignSegmentsToVerses", () => {
  it("creates 1:1 mapping when segment count equals verse count", () => {
    const boundaries = [
      { start: 0, end: 8 },
      { start: 8, end: 16 },
      { start: 16, end: 24 },
    ];
    const verses = SAMPLE_VERSES.filter(
      (v) => v.book === "Matthew" && v.chapter === 1,
    );

    const { segments, errors } = alignSegmentsToVerses(
      boundaries,
      verses,
      "Matthew",
      1,
    );

    expect(segments.length).toBe(3);
    expect(segments[0].verse).toBe(1);
    expect(segments[1].verse).toBe(2);
    expect(segments[2].verse).toBe(3);
    expect(segments[0].hasDiscrepancy).toBe(false);
  });

  it("handles more verses than segments (combines verses)", () => {
    const boundaries = [
      { start: 0, end: 12 },
      { start: 12, end: 24 },
    ];
    const verses = SAMPLE_VERSES.filter(
      (v) => v.book === "Matthew" && v.chapter === 1,
    );

    const { segments, errors } = alignSegmentsToVerses(
      boundaries,
      verses,
      "Matthew",
      1,
    );

    expect(segments.length).toBe(2);
    expect(segments[0].hasDiscrepancy).toBe(true);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("handles no verses gracefully", () => {
    const boundaries = [{ start: 0, end: 10 }];
    const { segments, errors } = alignSegmentsToVerses(
      boundaries,
      [],
      "Matthew",
      99,
    );

    expect(segments.length).toBe(0);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toContain("No TR verses");
  });

  it("handles no boundaries gracefully", () => {
    const verses = SAMPLE_VERSES.filter(
      (v) => v.book === "Matthew" && v.chapter === 1,
    );
    const { segments, errors } = alignSegmentsToVerses(
      [],
      verses,
      "Matthew",
      1,
    );

    expect(segments.length).toBe(0);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toContain("No audio segments");
  });

  it("uses correct filename convention in segments", () => {
    const boundaries = [{ start: 0, end: 10 }];
    const verses = [SAMPLE_VERSES[0]];

    const { segments } = alignSegmentsToVerses(
      boundaries,
      verses,
      "Matthew",
      1,
    );

    expect(segments[0].filename).toBe("karvounakis_matthew_001_001_00.wav");
    expect(segments[0].id).toBe("karvounakis_matthew_001_001_00");
  });
});

// ---------------------------------------------------------------------------
// Unit: Metadata CSV generation
// ---------------------------------------------------------------------------

describe("generateMetadataCsv", () => {
  it("generates pipe-delimited LJSpeech format", () => {
    const segments: SegmentInfo[] = [
      {
        id: "karvounakis_matthew_001_001_00",
        filename: "karvounakis_matthew_001_001_00.wav",
        book: "matthew",
        chapter: 1,
        verse: 1,
        segment: 0,
        startTime: 0,
        endTime: 10,
        duration: 10,
        transcript:
          "\u0392\u03af\u03b2\u03bb\u03bf\u03c2 \u03b3\u03b5\u03bd\u03ad\u03c3\u03b5\u03c9\u03c2.",
        hasDiscrepancy: false,
      },
    ];

    const csv = generateMetadataCsv(segments);
    const lines = csv.trim().split("\n");

    expect(lines.length).toBe(1);
    expect(lines[0]).toContain("|");
    expect(lines[0].split("|").length).toBe(2);
    expect(lines[0]).toMatch(
      /^karvounakis_matthew_001_001_00\|.+$/,
    );
  });

  it("does not include .wav extension in filename field", () => {
    const segments: SegmentInfo[] = [
      {
        id: "test_001",
        filename: "test_001.wav",
        book: "matthew",
        chapter: 1,
        verse: 1,
        segment: 0,
        startTime: 0,
        endTime: 10,
        duration: 10,
        transcript: "test",
        hasDiscrepancy: false,
      },
    ];

    const csv = generateMetadataCsv(segments);
    expect(csv).not.toContain(".wav|");
    expect(csv.startsWith("test_001|")).toBe(true);
  });

  it("skips segments with empty transcript", () => {
    const segments: SegmentInfo[] = [
      {
        id: "test_001",
        filename: "test_001.wav",
        book: "matthew",
        chapter: 1,
        verse: 1,
        segment: 0,
        startTime: 0,
        endTime: 10,
        duration: 10,
        transcript: "",
        hasDiscrepancy: false,
      },
    ];

    const csv = generateMetadataCsv(segments);
    expect(csv.trim()).toBe("");
  });

  it("handles multiple segments correctly", () => {
    const segments: SegmentInfo[] = [
      {
        id: "seg_001",
        filename: "seg_001.wav",
        book: "matthew",
        chapter: 1,
        verse: 1,
        segment: 0,
        startTime: 0,
        endTime: 10,
        duration: 10,
        transcript: "First verse",
        hasDiscrepancy: false,
      },
      {
        id: "seg_002",
        filename: "seg_002.wav",
        book: "matthew",
        chapter: 1,
        verse: 2,
        segment: 0,
        startTime: 10,
        endTime: 20,
        duration: 10,
        transcript: "Second verse",
        hasDiscrepancy: false,
      },
    ];

    const csv = generateMetadataCsv(segments);
    const lines = csv.trim().split("\n");
    expect(lines.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Unit: Metadata CSV validation
// ---------------------------------------------------------------------------

describe("validateMetadataCsv", () => {
  it("returns no errors for valid metadata", () => {
    const content = "karvounakis_matthew_001_001_00|\u0392\u03af\u03b2\u03bb\u03bf\u03c2.\n";
    const errors = validateMetadataCsv(content);
    expect(errors.length).toBe(0);
  });

  it("detects empty file", () => {
    const errors = validateMetadataCsv("");
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain("empty");
  });

  it("detects missing pipe delimiter", () => {
    const content = "karvounakis_matthew_001_001_00 no pipe\n";
    const errors = validateMetadataCsv(content);
    expect(errors.some((e) => e.includes("pipe delimiter"))).toBe(true);
  });

  it("detects empty filename", () => {
    const content = "|some transcript\n";
    const errors = validateMetadataCsv(content);
    expect(errors.some((e) => e.includes("empty filename"))).toBe(true);
  });

  it("detects empty transcription", () => {
    const content = "karvounakis_matthew_001_001_00|\n";
    const errors = validateMetadataCsv(content);
    expect(errors.some((e) => e.includes("empty transcription"))).toBe(true);
  });

  it("detects duplicate filenames", () => {
    const content =
      "karvounakis_matthew_001_001_00|text1\nkarvounakis_matthew_001_001_00|text2\n";
    const errors = validateMetadataCsv(content);
    expect(errors.some((e) => e.includes("duplicate filename"))).toBe(true);
  });

  it("detects Unicode replacement characters in transcriptions", () => {
    const content = "seg_001|\uFFFDbroken text\n";
    const errors = validateMetadataCsv(content);
    expect(
      errors.some((e) => e.includes("Unicode replacement character")),
    ).toBe(true);
  });

  it("validates UTF-8 Greek text passes cleanly", () => {
    const content =
      "seg_001|\u0392\u03af\u03b2\u03bb\u03bf\u03c2 \u03b3\u03b5\u03bd\u03ad\u03c3\u03b5\u03c9\u03c2 \u1f38\u03b7\u03c3\u03bf\u1fe6 \u03a7\u03c1\u03b9\u03c3\u03c4\u03bf\u1fe6.\n";
    const errors = validateMetadataCsv(content);
    expect(errors.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Integration: Full pipeline data flow (dry-run style)
// ---------------------------------------------------------------------------

describe("pipeline integration (text-only)", () => {
  it("correctly chains verse lookup -> alignment -> metadata generation", () => {
    const matthewCh1 = getChapterVerses(SAMPLE_VERSES, "Matthew", 1);
    expect(matthewCh1.length).toBe(3);

    // Simulate 3 silence-detected boundaries
    const boundaries = [
      { start: 0, end: 8.5 },
      { start: 8.5, end: 17 },
      { start: 17, end: 25 },
    ];

    const { segments } = alignSegmentsToVerses(
      boundaries,
      matthewCh1,
      "Matthew",
      1,
    );
    expect(segments.length).toBe(3);

    // Generate metadata
    const csv = generateMetadataCsv(segments);
    const lines = csv.trim().split("\n");
    expect(lines.length).toBe(3);

    // Validate metadata
    const errors = validateMetadataCsv(csv);
    expect(errors.length).toBe(0);

    // Check pipe-delimited format
    for (const line of lines) {
      const parts = line.split("|");
      expect(parts.length).toBe(2);
      expect(parts[0].length).toBeGreaterThan(0);
      expect(parts[1].length).toBeGreaterThan(0);
    }
  });

  it("segment durations are positive", () => {
    const boundaries = [
      { start: 0, end: 8.5 },
      { start: 8.5, end: 17 },
    ];
    const verses = SAMPLE_VERSES.filter(
      (v) => v.book === "Matthew" && v.chapter === 1,
    ).slice(0, 2);

    const { segments } = alignSegmentsToVerses(
      boundaries,
      verses,
      "Matthew",
      1,
    );

    for (const seg of segments) {
      expect(seg.duration).toBeGreaterThan(0);
      expect(seg.endTime).toBeGreaterThan(seg.startTime);
    }
  });

  it("all transcripts are non-empty UTF-8 Greek text", () => {
    const boundaries = [
      { start: 0, end: 8 },
      { start: 8, end: 16 },
      { start: 16, end: 24 },
    ];
    const verses = getChapterVerses(SAMPLE_VERSES, "Matthew", 1);

    const { segments } = alignSegmentsToVerses(
      boundaries,
      verses,
      "Matthew",
      1,
    );

    for (const seg of segments) {
      expect(seg.transcript.length).toBeGreaterThan(0);
      // Should contain Greek characters
      expect(seg.transcript).toMatch(/[\u0370-\u03FF\u1F00-\u1FFF]/);
      // Should not contain replacement characters
      expect(seg.transcript).not.toContain("\uFFFD");
    }
  });
});

// ---------------------------------------------------------------------------
// Unit: Segment duration validation range
// ---------------------------------------------------------------------------

describe("segment duration validation", () => {
  it("segments from adjustSegmentDurations never exceed 2x max", () => {
    // Even a very long segment should be split to within range
    const segments = [{ start: 0, end: 60, verseIndices: [0] }];
    const result = adjustSegmentDurations(segments, SAMPLE_VERSES, 5, 15);

    for (const seg of result) {
      const dur = seg.end - seg.start;
      // Should be split to roughly 15s each
      expect(dur).toBeLessThanOrEqual(15.01);
    }
  });

  it("documents out-of-range segments as exceptions", () => {
    // A 3s segment that is the only one cannot be merged
    const segments = [{ start: 0, end: 3, verseIndices: [0] }];
    const result = adjustSegmentDurations(segments, SAMPLE_VERSES, 5, 15);

    // It stays as-is since there is nothing to merge with
    expect(result.length).toBe(1);
    expect(result[0].end - result[0].start).toBe(3);
    // It is not flagged as split or merged, it is simply out of range
  });
});
