import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import {
  loadSourceDataset,
  mergeMetadata,
  extractUniqueWords,
  generateCombinedMetadataCsv,
  linkWavFiles,
  computeStatsFromMetadataOnly,
  validateCombinedDataset,
  assembleDataset,
  parseCliArgs,
  SOURCE_DIRS,
} from "./assemble-dataset";
import type { SourceDataset, DatasetStats } from "./assemble-dataset";
import { buildWavBuffer } from "./validate-audio-dataset";
import type { MetadataEntry } from "./validate-audio-dataset";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const TMP_DIR = join(__dirname, "..", ".tmp-assemble-test");

function setupTmpDir(): void {
  rmSync(TMP_DIR, { recursive: true, force: true });
  mkdirSync(TMP_DIR, { recursive: true });
}

function teardownTmpDir(): void {
  rmSync(TMP_DIR, { recursive: true, force: true });
}

/** Create a minimal valid WAV file (1s of sine wave at 22050 Hz, 16-bit, mono). */
function createTestWav(dir: string, filename: string): void {
  const sampleRate = 22050;
  const duration = 2; // seconds
  const numSamples = sampleRate * duration;
  const samples = new Int16Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    samples[i] = Math.round(
      5000 * Math.sin((2 * Math.PI * 440 * i) / sampleRate),
    );
  }
  const buffer = buildWavBuffer({ sampleRate, bitDepth: 16, channels: 1, samples });
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, filename), buffer);
}

/** Create a source dataset directory with metadata and WAV files. */
function createSourceDataset(
  baseDir: string,
  name: string,
  entries: { filename: string; transcription: string }[],
): string {
  const dir = join(baseDir, name);
  mkdirSync(join(dir, "wavs"), { recursive: true });

  // Write metadata.csv
  const metaCsv = entries.map((e) => `${e.filename}|${e.transcription}`).join("\n") + "\n";
  writeFileSync(join(dir, "metadata.csv"), metaCsv, "utf-8");

  // Create WAV files
  for (const entry of entries) {
    const wavFilename = entry.filename.endsWith(".wav")
      ? entry.filename
      : entry.filename + ".wav";
    createTestWav(join(dir, "wavs"), wavFilename);
  }

  return dir;
}

// ---------------------------------------------------------------------------
// Unit: loadSourceDataset
// ---------------------------------------------------------------------------

describe("loadSourceDataset", () => {
  beforeEach(setupTmpDir);
  afterEach(teardownTmpDir);

  it("returns null for non-existent directory", () => {
    const result = loadSourceDataset("test", "/nonexistent/path");
    expect(result).toBeNull();
  });

  it("returns null for directory without metadata.csv", () => {
    const dir = join(TMP_DIR, "empty-source");
    mkdirSync(dir, { recursive: true });
    const result = loadSourceDataset("test", dir);
    expect(result).toBeNull();
  });

  it("returns null for empty metadata.csv", () => {
    const dir = join(TMP_DIR, "empty-meta");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "metadata.csv"), "", "utf-8");
    const result = loadSourceDataset("test", dir);
    expect(result).toBeNull();
  });

  it("loads a valid source dataset", () => {
    const dir = createSourceDataset(TMP_DIR, "src1", [
      { filename: "karvounakis_matthew_001_001_00", transcription: "\u0392\u03af\u03b2\u03bb\u03bf\u03c2" },
      { filename: "karvounakis_matthew_001_002_00", transcription: "\u1f08\u03b2\u03c1\u03b1\u03ac\u03bc" },
    ]);

    const result = loadSourceDataset("karvounakis", dir);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("karvounakis");
    expect(result!.entries.length).toBe(2);
    expect(result!.wavFiles.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Unit: mergeMetadata
// ---------------------------------------------------------------------------

describe("mergeMetadata", () => {
  it("merges entries from multiple sources", () => {
    const src1: SourceDataset = {
      name: "karvounakis",
      dir: "/a",
      entries: [
        { filename: "karvounakis_matt_001", transcription: "text1" },
        { filename: "karvounakis_matt_002", transcription: "text2" },
      ],
      wavFiles: [],
    };

    const src2: SourceDataset = {
      name: "kep-self",
      dir: "/b",
      entries: [
        { filename: "kep_vocab_ch1_001", transcription: "text3" },
      ],
      wavFiles: [],
    };

    const { merged, collisions } = mergeMetadata([src1, src2]);
    expect(merged.length).toBe(3);
    expect(collisions.length).toBe(0);
  });

  it("detects filename collisions", () => {
    const src1: SourceDataset = {
      name: "source-a",
      dir: "/a",
      entries: [{ filename: "same_file", transcription: "text1" }],
      wavFiles: [],
    };

    const src2: SourceDataset = {
      name: "source-b",
      dir: "/b",
      entries: [{ filename: "same_file", transcription: "text2" }],
      wavFiles: [],
    };

    const { merged, collisions } = mergeMetadata([src1, src2]);
    expect(merged.length).toBe(1); // second is skipped
    expect(collisions.length).toBe(1);
    expect(collisions[0].filename).toBe("same_file");
    expect(collisions[0].sources).toContain("source-a");
    expect(collisions[0].sources).toContain("source-b");
  });

  it("NFC-normalizes transcriptions", () => {
    // Composed vs decomposed form of Greek letter with accent
    const decomposed = "\u03B1\u0301"; // alpha + combining accent
    const composed = "\u03AC"; // precomposed alpha with accent

    const src: SourceDataset = {
      name: "test",
      dir: "/a",
      entries: [{ filename: "f1", transcription: decomposed }],
      wavFiles: [],
    };

    const { merged } = mergeMetadata([src]);
    expect(merged[0].transcription).toBe(composed);
  });

  it("handles empty sources gracefully", () => {
    const { merged, collisions } = mergeMetadata([]);
    expect(merged.length).toBe(0);
    expect(collisions.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Unit: extractUniqueWords
// ---------------------------------------------------------------------------

describe("extractUniqueWords", () => {
  it("extracts unique words from transcriptions", () => {
    const words = extractUniqueWords([
      "\u0392\u03af\u03b2\u03bb\u03bf\u03c2 \u03b3\u03b5\u03bd\u03ad\u03c3\u03b5\u03c9\u03c2",
      "\u0392\u03af\u03b2\u03bb\u03bf\u03c2 \u1f38\u03b7\u03c3\u03bf\u1fe6",
    ]);

    // "Biblos" appears twice but should be counted once
    expect(words.size).toBe(3);
    expect(words.has("\u0392\u03af\u03b2\u03bb\u03bf\u03c2")).toBe(true);
  });

  it("strips trailing punctuation", () => {
    const words = extractUniqueWords(["word1, word2. word3;"]);
    expect(words.has("word1")).toBe(true);
    expect(words.has("word2")).toBe(true);
    expect(words.has("word3")).toBe(true);
  });

  it("returns empty set for empty input", () => {
    const words = extractUniqueWords([]);
    expect(words.size).toBe(0);
  });

  it("returns empty set for whitespace-only input", () => {
    const words = extractUniqueWords(["   ", "  "]);
    expect(words.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Unit: generateCombinedMetadataCsv
// ---------------------------------------------------------------------------

describe("generateCombinedMetadataCsv", () => {
  it("generates pipe-delimited LJSpeech format", () => {
    const entries: MetadataEntry[] = [
      { filename: "karvounakis_matt_001", transcription: "text1" },
      { filename: "kep_vocab_001", transcription: "text2" },
    ];

    const csv = generateCombinedMetadataCsv(entries);
    const lines = csv.trim().split("\n");
    expect(lines.length).toBe(2);
    expect(lines[0]).toBe("karvounakis_matt_001|text1");
    expect(lines[1]).toBe("kep_vocab_001|text2");
  });

  it("strips .wav extension from filenames", () => {
    const entries: MetadataEntry[] = [
      { filename: "seg_001.wav", transcription: "test" },
    ];
    const csv = generateCombinedMetadataCsv(entries);
    expect(csv).toContain("seg_001|test");
    expect(csv).not.toContain(".wav|");
  });

  it("skips entries with empty filename or transcription", () => {
    const entries: MetadataEntry[] = [
      { filename: "", transcription: "text" },
      { filename: "seg_001", transcription: "" },
      { filename: "seg_002", transcription: "valid" },
    ];
    const csv = generateCombinedMetadataCsv(entries);
    const lines = csv.trim().split("\n");
    expect(lines.length).toBe(1);
    expect(lines[0]).toBe("seg_002|valid");
  });

  it("returns empty string for no valid entries", () => {
    const csv = generateCombinedMetadataCsv([]);
    expect(csv).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Unit: computeStatsFromMetadataOnly
// ---------------------------------------------------------------------------

describe("computeStatsFromMetadataOnly", () => {
  it("computes per-source and total stats", () => {
    const src1: SourceDataset = {
      name: "karvounakis",
      dir: "/a",
      entries: [
        { filename: "f1", transcription: "word1 word2" },
        { filename: "f2", transcription: "word2 word3" },
      ],
      wavFiles: [],
    };

    const src2: SourceDataset = {
      name: "kep-self",
      dir: "/b",
      entries: [
        { filename: "f3", transcription: "word4" },
      ],
      wavFiles: [],
    };

    const merged: MetadataEntry[] = [
      ...src1.entries,
      ...src2.entries,
    ];

    const stats = computeStatsFromMetadataOnly([src1, src2], merged);

    expect(stats.totalSegments).toBe(3);
    expect(stats.uniqueWords).toBe(4);
    expect(stats.sources.karvounakis.segments).toBe(2);
    expect(stats.sources.karvounakis.uniqueWords).toBe(3);
    expect(stats.sources["kep-self"].segments).toBe(1);
    expect(stats.sources["kep-self"].uniqueWords).toBe(1);
    expect(stats.generatedAt).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Unit: linkWavFiles
// ---------------------------------------------------------------------------

describe("linkWavFiles", () => {
  beforeEach(setupTmpDir);
  afterEach(teardownTmpDir);

  it("links WAV files from sources to output directory", () => {
    const srcDir = createSourceDataset(TMP_DIR, "src", [
      { filename: "seg_001", transcription: "t1" },
      { filename: "seg_002", transcription: "t2" },
    ]);

    const src: SourceDataset = {
      name: "test",
      dir: srcDir,
      entries: [],
      wavFiles: ["seg_001.wav", "seg_002.wav"],
    };

    const outputWavsDir = join(TMP_DIR, "output", "wavs");
    const result = linkWavFiles([src], outputWavsDir, false);

    expect(result.linked.length).toBe(2);
    expect(result.errors.length).toBe(0);
    expect(existsSync(join(outputWavsDir, "seg_001.wav"))).toBe(true);
    expect(existsSync(join(outputWavsDir, "seg_002.wav"))).toBe(true);
  });

  it("dry-run mode does not create files", () => {
    const src: SourceDataset = {
      name: "test",
      dir: join(TMP_DIR, "nonexistent"),
      entries: [],
      wavFiles: ["seg_001.wav"],
    };

    const outputWavsDir = join(TMP_DIR, "dry-output", "wavs");
    const result = linkWavFiles([src], outputWavsDir, true);

    // In dry-run mode, files are "linked" but the directory is not created
    expect(existsSync(outputWavsDir)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Unit: validateCombinedDataset
// ---------------------------------------------------------------------------

describe("validateCombinedDataset", () => {
  beforeEach(setupTmpDir);
  afterEach(teardownTmpDir);

  it("passes valid WAV files", () => {
    const dir = join(TMP_DIR, "valid-dataset");
    mkdirSync(join(dir, "wavs"), { recursive: true });
    createTestWav(join(dir, "wavs"), "seg_001.wav");

    const entries: MetadataEntry[] = [
      { filename: "seg_001", transcription: "text" },
    ];

    const result = validateCombinedDataset(dir, entries);
    expect(result.passed.length).toBe(1);
    expect(result.excluded.length).toBe(0);
  });

  it("excludes missing WAV files and logs reason", () => {
    const dir = join(TMP_DIR, "missing-wav");
    mkdirSync(join(dir, "wavs"), { recursive: true });

    const entries: MetadataEntry[] = [
      { filename: "nonexistent_seg", transcription: "text" },
    ];

    const result = validateCombinedDataset(dir, entries);
    expect(result.passed.length).toBe(0);
    expect(result.excluded.length).toBe(1);
    expect(result.excluded[0].reason).toContain("not found");
  });

  it("excludes corrupt WAV files and logs reason", () => {
    const dir = join(TMP_DIR, "corrupt-dataset");
    mkdirSync(join(dir, "wavs"), { recursive: true });
    writeFileSync(join(dir, "wavs", "bad.wav"), "not a wav file");

    const entries: MetadataEntry[] = [
      { filename: "bad", transcription: "text" },
    ];

    const result = validateCombinedDataset(dir, entries);
    expect(result.passed.length).toBe(0);
    expect(result.excluded.length).toBe(1);
  });

  it("returns empty results when wavs directory is missing", () => {
    const dir = join(TMP_DIR, "no-wavs-dir");
    mkdirSync(dir, { recursive: true });

    const entries: MetadataEntry[] = [
      { filename: "seg_001", transcription: "text" },
    ];

    const result = validateCombinedDataset(dir, entries);
    expect(result.passed.length).toBe(0);
    expect(result.excluded.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Unit: parseCliArgs
// ---------------------------------------------------------------------------

describe("parseCliArgs", () => {
  it("parses --dry-run flag", () => {
    const args = parseCliArgs(["node", "script.ts", "--dry-run"]);
    expect(args.dryRun).toBe(true);
  });

  it("parses --source karvounakis", () => {
    const args = parseCliArgs(["node", "script.ts", "--source", "karvounakis"]);
    expect(args.source).toEqual(["karvounakis"]);
  });

  it("parses --source both", () => {
    const args = parseCliArgs(["node", "script.ts", "--source", "both"]);
    expect(args.source).toEqual(["karvounakis", "kep-self"]);
  });

  it("parses --output path", () => {
    const args = parseCliArgs(["node", "script.ts", "--output", "/custom/path"]);
    expect(args.output).toBe("/custom/path");
  });

  it("defaults to both sources", () => {
    const args = parseCliArgs(["node", "script.ts"]);
    expect(args.source).toEqual(["karvounakis", "kep-self"]);
  });

  it("defaults dryRun to false", () => {
    const args = parseCliArgs(["node", "script.ts"]);
    expect(args.dryRun).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Integration: assembleDataset
// ---------------------------------------------------------------------------

describe("assembleDataset (integration)", () => {
  beforeEach(setupTmpDir);
  afterEach(teardownTmpDir);

  it("assembles a combined dataset from two sources", () => {
    // Create source datasets
    const src1Dir = createSourceDataset(TMP_DIR, "src1", [
      { filename: "karvounakis_matt_001", transcription: "\u0392\u03af\u03b2\u03bb\u03bf\u03c2 \u03b3\u03b5\u03bd\u03ad\u03c3\u03b5\u03c9\u03c2" },
      { filename: "karvounakis_matt_002", transcription: "\u1f08\u03b2\u03c1\u03b1\u03ac\u03bc \u1f10\u03b3\u03ad\u03bd\u03bd\u03b7\u03c3\u03b5" },
    ]);

    const src2Dir = createSourceDataset(TMP_DIR, "src2", [
      { filename: "kep_vocab_001", transcription: "\u03bb\u03cc\u03b3\u03bf\u03c2" },
    ]);

    // Override SOURCE_DIRS for test
    const origKarv = SOURCE_DIRS.karvounakis;
    const origKep = SOURCE_DIRS["kep-self"];
    SOURCE_DIRS.karvounakis = src1Dir;
    SOURCE_DIRS["kep-self"] = src2Dir;

    try {
      const outputDir = join(TMP_DIR, "combined");
      const result = assembleDataset({
        sources: ["karvounakis", "kep-self"],
        outputDir,
        dryRun: false,
        skipValidation: false,
      });

      // Verify combined metadata
      expect(result.metadata.length).toBe(3);

      // Verify stats
      expect(result.stats.totalSegments).toBe(3);
      expect(result.stats.uniqueWords).toBeGreaterThan(0);
      expect(result.stats.sources.karvounakis).toBeDefined();
      expect(result.stats.sources["kep-self"]).toBeDefined();

      // Verify files written
      expect(existsSync(join(outputDir, "metadata.csv"))).toBe(true);
      expect(existsSync(join(outputDir, "stats.json"))).toBe(true);
      expect(existsSync(join(outputDir, "wavs"))).toBe(true);

      // Verify metadata.csv content
      const metaCsv = readFileSync(join(outputDir, "metadata.csv"), "utf-8");
      const lines = metaCsv.trim().split("\n");
      expect(lines.length).toBe(3);

      // Verify each line is pipe-delimited
      for (const line of lines) {
        const parts = line.split("|");
        expect(parts.length).toBe(2);
        expect(parts[0].length).toBeGreaterThan(0);
        expect(parts[1].length).toBeGreaterThan(0);
      }

      // Verify stats.json
      const statsJson = JSON.parse(
        readFileSync(join(outputDir, "stats.json"), "utf-8"),
      );
      expect(statsJson.totalSegments).toBe(3);
      expect(statsJson.sources).toBeDefined();

      // Verify WAV files in combined/wavs/
      const wavFiles = readdirSync(join(outputDir, "wavs"));
      expect(wavFiles.length).toBe(3);
    } finally {
      SOURCE_DIRS.karvounakis = origKarv;
      SOURCE_DIRS["kep-self"] = origKep;
    }
  });

  it("handles single source gracefully", () => {
    const srcDir = createSourceDataset(TMP_DIR, "src-single", [
      { filename: "karvounakis_matt_001", transcription: "text1" },
    ]);

    const origKarv = SOURCE_DIRS.karvounakis;
    const origKep = SOURCE_DIRS["kep-self"];
    SOURCE_DIRS.karvounakis = srcDir;
    SOURCE_DIRS["kep-self"] = "/nonexistent";

    try {
      const outputDir = join(TMP_DIR, "single-source");
      const result = assembleDataset({
        sources: ["karvounakis", "kep-self"],
        outputDir,
        dryRun: false,
        skipValidation: true,
      });

      expect(result.metadata.length).toBe(1);
      expect(existsSync(join(outputDir, "metadata.csv"))).toBe(true);
    } finally {
      SOURCE_DIRS.karvounakis = origKarv;
      SOURCE_DIRS["kep-self"] = origKep;
    }
  });

  it("handles no available sources gracefully", () => {
    const origKarv = SOURCE_DIRS.karvounakis;
    const origKep = SOURCE_DIRS["kep-self"];
    SOURCE_DIRS.karvounakis = "/nonexistent1";
    SOURCE_DIRS["kep-self"] = "/nonexistent2";

    try {
      const outputDir = join(TMP_DIR, "empty-output");
      const result = assembleDataset({
        sources: ["karvounakis", "kep-self"],
        outputDir,
        dryRun: true,
        skipValidation: true,
      });

      expect(result.metadata.length).toBe(0);
      expect(result.stats.totalSegments).toBe(0);
    } finally {
      SOURCE_DIRS.karvounakis = origKarv;
      SOURCE_DIRS["kep-self"] = origKep;
    }
  });

  it("dry-run mode does not write files", () => {
    const srcDir = createSourceDataset(TMP_DIR, "src-dry", [
      { filename: "seg_001", transcription: "test" },
    ]);

    const origKarv = SOURCE_DIRS.karvounakis;
    SOURCE_DIRS.karvounakis = srcDir;

    try {
      const outputDir = join(TMP_DIR, "dry-run-output");
      assembleDataset({
        sources: ["karvounakis"],
        outputDir,
        dryRun: true,
        skipValidation: true,
      });

      expect(existsSync(join(outputDir, "metadata.csv"))).toBe(false);
    } finally {
      SOURCE_DIRS.karvounakis = origKarv;
    }
  });
});
