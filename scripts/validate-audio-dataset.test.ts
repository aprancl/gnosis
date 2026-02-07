import { describe, it, expect } from "vitest";
import {
  parseWavHeader,
  readPcmSamples,
  computeRms,
  estimateSnr,
  detectClipping,
  detectLeadingSilence,
  detectTrailingSilence,
  parseMetadataCsv,
  validateMetadataCompleteness,
  validateSegment,
  buildWavBuffer,
  generateSummaryText,
  formatDuration,
} from "./validate-audio-dataset";
import type {
  WavHeader,
  ValidateOptions,
  ValidationReport,
  SegmentResult,
} from "./validate-audio-dataset";

// ---------------------------------------------------------------------------
// Helper: default options for tests
// ---------------------------------------------------------------------------

function defaultOptions(overrides?: Partial<ValidateOptions>): ValidateOptions {
  return {
    datasetPath: "/tmp/test-dataset",
    source: "karvounakis",
    snrThreshold: 20,
    clipThreshold: 32767,
    silenceThreshold: 100,
    minDuration: 1,
    maxDuration: 20,
    vocabMinDuration: 0.5,
    maxLeadingTrailingSilence: 2,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Helper: generate sine wave samples
// ---------------------------------------------------------------------------

function generateSineWave(
  frequency: number,
  durationSeconds: number,
  sampleRate: number = 22050,
  amplitude: number = 10000,
): Int16Array {
  const numSamples = Math.floor(sampleRate * durationSeconds);
  const samples = new Int16Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    samples[i] = Math.round(
      amplitude * Math.sin((2 * Math.PI * frequency * i) / sampleRate),
    );
  }
  return samples;
}

// ---------------------------------------------------------------------------
// WAV Header Parsing
// ---------------------------------------------------------------------------

describe("parseWavHeader", () => {
  it("parses a valid 22050 Hz, 16-bit, mono WAV header", () => {
    const samples = new Int16Array(22050); // 1 second of silence
    const buffer = buildWavBuffer({
      sampleRate: 22050,
      bitDepth: 16,
      channels: 1,
      samples,
    });

    const header = parseWavHeader(buffer);

    expect(header.sampleRate).toBe(22050);
    expect(header.bitDepth).toBe(16);
    expect(header.channels).toBe(1);
    expect(header.dataSize).toBe(22050 * 2); // 16-bit = 2 bytes per sample
    expect(header.duration).toBeCloseTo(1.0, 2);
  });

  it("parses a 44100 Hz, 16-bit, stereo WAV header", () => {
    const samples = new Int16Array(44100 * 2); // 1 sec stereo
    const buffer = buildWavBuffer({
      sampleRate: 44100,
      bitDepth: 16,
      channels: 2,
      samples,
    });

    const header = parseWavHeader(buffer);

    expect(header.sampleRate).toBe(44100);
    expect(header.channels).toBe(2);
    expect(header.duration).toBeCloseTo(1.0, 2);
  });

  it("throws on buffer too small", () => {
    expect(() => parseWavHeader(Buffer.alloc(10))).toThrow(
      "Buffer too small",
    );
  });

  it("throws on invalid RIFF header", () => {
    const buffer = Buffer.alloc(44);
    buffer.write("XXXX", 0);
    expect(() => parseWavHeader(buffer)).toThrow("Invalid RIFF header");
  });

  it("throws on invalid WAVE format", () => {
    const buffer = Buffer.alloc(44);
    buffer.write("RIFF", 0);
    buffer.writeUInt32LE(36, 4);
    buffer.write("XXXX", 8);
    expect(() => parseWavHeader(buffer)).toThrow("Invalid WAVE format");
  });

  it("computes duration correctly for different lengths", () => {
    // 5 seconds at 22050 Hz mono 16-bit
    const sampleCount = 22050 * 5;
    const samples = new Int16Array(sampleCount);
    const buffer = buildWavBuffer({ samples });

    const header = parseWavHeader(buffer);
    expect(header.duration).toBeCloseTo(5.0, 2);
  });
});

// ---------------------------------------------------------------------------
// SNR Computation
// ---------------------------------------------------------------------------

describe("estimateSnr", () => {
  it("returns 0 for empty samples", () => {
    expect(estimateSnr(new Int16Array(0))).toBe(0);
  });

  it("returns 0 for all-zero samples", () => {
    expect(estimateSnr(new Int16Array(1000))).toBe(0);
  });

  it("returns high SNR for speech-like signal with silent gaps", () => {
    // Simulate speech: signal with silent gaps between "words"
    const sampleRate = 22050;
    const samples = new Int16Array(sampleRate * 2); // 2 seconds
    // Three "words" with silent gaps
    for (let word = 0; word < 3; word++) {
      const start = Math.floor(word * sampleRate * 0.5);
      const end = start + Math.floor(sampleRate * 0.3);
      for (let i = start; i < end && i < samples.length; i++) {
        samples[i] = Math.round(
          10000 * Math.sin((2 * Math.PI * 440 * i) / sampleRate),
        );
      }
    }
    const snr = estimateSnr(samples);
    // Signal with clean silent gaps should have high SNR (noise floor near 0)
    expect(snr).toBe(Infinity);
  });

  it("returns lower SNR for noisy signal", () => {
    // Create a uniformly noisy signal (noise everywhere, including "quiet" frames)
    const samples = new Int16Array(22050 * 2);
    for (let i = 0; i < samples.length; i++) {
      samples[i] = Math.round((Math.random() - 0.5) * 2000);
    }
    const snr = estimateSnr(samples);
    // Pure noise should have very low SNR (quietest frames similar to loudest)
    expect(snr).toBeLessThan(10);
  });

  it("returns Infinity for signal with silent frames", () => {
    // A signal where the quietest frames are true silence (zero)
    // should produce Infinity SNR since noise floor is 0
    const sampleRate = 22050;
    const samples = new Int16Array(sampleRate * 2); // 2 seconds
    // First 1.8 seconds: sine wave signal
    for (let i = 0; i < sampleRate * 1.8; i++) {
      samples[i] = Math.round(
        10000 * Math.sin((2 * Math.PI * 440 * i) / sampleRate),
      );
    }
    // Last 0.2 seconds: complete silence (already zeros)
    const snr = estimateSnr(samples);
    expect(snr).toBe(Infinity);
  });
});

// ---------------------------------------------------------------------------
// RMS Computation
// ---------------------------------------------------------------------------

describe("computeRms", () => {
  it("returns 0 for empty array", () => {
    expect(computeRms(new Int16Array(0))).toBe(0);
  });

  it("returns correct RMS for known values", () => {
    // RMS of [3, 4] = sqrt((9+16)/2) = sqrt(12.5) ~ 3.536
    const rms = computeRms(new Int16Array([3, 4]));
    expect(rms).toBeCloseTo(3.536, 2);
  });

  it("returns amplitude/sqrt(2) for sine wave", () => {
    const amplitude = 10000;
    const samples = generateSineWave(440, 1.0, 22050, amplitude);
    const rms = computeRms(samples);
    const expected = amplitude / Math.sqrt(2);
    expect(rms).toBeCloseTo(expected, -2); // within 1%
  });
});

// ---------------------------------------------------------------------------
// Clipping Detection
// ---------------------------------------------------------------------------

describe("detectClipping", () => {
  it("returns 0 for quiet signal", () => {
    const samples = new Int16Array([100, -100, 200, -200, 0]);
    expect(detectClipping(samples)).toBe(0);
  });

  it("detects positive clipping at default threshold", () => {
    const samples = new Int16Array([0, 32767, 100, 32767, -32768]);
    expect(detectClipping(samples)).toBe(3); // 2 positive + 1 negative
  });

  it("detects clipping at custom threshold", () => {
    const samples = new Int16Array([0, 30000, 31000, 32000, -30000]);
    // Threshold 30000: |30000|, |31000|, |32000|, |-30000| = 4 clips
    expect(detectClipping(samples, 30000)).toBe(4);
  });

  it("returns 0 for empty array", () => {
    expect(detectClipping(new Int16Array(0))).toBe(0);
  });

  it("handles all-clipped signal", () => {
    const samples = new Int16Array(100);
    samples.fill(32767);
    expect(detectClipping(samples)).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// Silence Detection
// ---------------------------------------------------------------------------

describe("detectLeadingSilence", () => {
  it("returns 0 when signal starts immediately", () => {
    const samples = new Int16Array([1000, 2000, 3000, 0, 0]);
    const duration = detectLeadingSilence(samples, 22050, 100, 1);
    expect(duration).toBe(0);
  });

  it("detects leading silence", () => {
    const sampleRate = 22050;
    const silenceSamples = sampleRate * 3; // 3 seconds of silence
    const samples = new Int16Array(silenceSamples + 1000);
    // Fill first 3 seconds with silence (zeros)
    // Then add signal
    for (let i = silenceSamples; i < samples.length; i++) {
      samples[i] = 5000;
    }

    const duration = detectLeadingSilence(samples, sampleRate, 100, 256);
    expect(duration).toBeCloseTo(3.0, 0);
  });

  it("returns full duration for all-silent signal", () => {
    const sampleRate = 22050;
    const samples = new Int16Array(sampleRate); // 1 second of zeros
    const duration = detectLeadingSilence(samples, sampleRate, 100, 256);
    expect(duration).toBeCloseTo(1.0, 0);
  });
});

describe("detectTrailingSilence", () => {
  it("returns 0 when signal ends at the end", () => {
    const samples = new Int16Array([0, 0, 1000, 2000, 3000]);
    const duration = detectTrailingSilence(samples, 22050, 100, 1);
    expect(duration).toBe(0);
  });

  it("detects trailing silence", () => {
    const sampleRate = 22050;
    const signalSamples = 1000;
    const silenceSamples = sampleRate * 3; // 3 seconds of trailing silence
    const samples = new Int16Array(signalSamples + silenceSamples);
    for (let i = 0; i < signalSamples; i++) {
      samples[i] = 5000;
    }
    // Rest is zeros (silence)

    const duration = detectTrailingSilence(samples, sampleRate, 100, 256);
    expect(duration).toBeCloseTo(3.0, 0);
  });

  it("returns full duration for all-silent signal", () => {
    const sampleRate = 22050;
    const samples = new Int16Array(sampleRate);
    const duration = detectTrailingSilence(samples, sampleRate, 100, 256);
    expect(duration).toBeCloseTo(1.0, 0);
  });
});

// ---------------------------------------------------------------------------
// Duration Validation
// ---------------------------------------------------------------------------

describe("duration validation", () => {
  it("flags segments shorter than 1s as warning (vocabulary)", () => {
    const samples = generateSineWave(440, 0.7, 22050, 5000);
    const buffer = buildWavBuffer({ samples });
    const result = validateSegment(buffer, "short.wav", defaultOptions());

    const durationIssue = result.issues.find(
      (i) => i.type === "duration_vocabulary",
    );
    expect(durationIssue).toBeDefined();
    expect(durationIssue!.severity).toBe("warning");
    expect(result.passed).toBe(true); // warnings don't fail
  });

  it("flags segments shorter than 0.5s as error", () => {
    const samples = generateSineWave(440, 0.3, 22050, 5000);
    const buffer = buildWavBuffer({ samples });
    const result = validateSegment(buffer, "very-short.wav", defaultOptions());

    const durationIssue = result.issues.find(
      (i) => i.type === "duration_short",
    );
    expect(durationIssue).toBeDefined();
    expect(durationIssue!.severity).toBe("error");
    expect(result.passed).toBe(false);
  });

  it("flags segments longer than 20s as error", () => {
    const samples = generateSineWave(440, 21.0, 22050, 5000);
    const buffer = buildWavBuffer({ samples });
    const result = validateSegment(buffer, "long.wav", defaultOptions());

    const durationIssue = result.issues.find(
      (i) => i.type === "duration_long",
    );
    expect(durationIssue).toBeDefined();
    expect(durationIssue!.severity).toBe("error");
  });

  it("passes segments between 1s and 20s", () => {
    const samples = generateSineWave(440, 5.0, 22050, 5000);
    const buffer = buildWavBuffer({ samples });
    const result = validateSegment(buffer, "good.wav", defaultOptions());

    const durationIssues = result.issues.filter(
      (i) =>
        i.type === "duration_short" ||
        i.type === "duration_long" ||
        i.type === "duration_vocabulary",
    );
    expect(durationIssues).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Metadata Completeness
// ---------------------------------------------------------------------------

describe("parseMetadataCsv", () => {
  it("parses LJSpeech-format metadata", () => {
    const content = "segment_001|Hello world\nsegment_002|Testing one two\n";
    const entries = parseMetadataCsv(content);

    expect(entries).toHaveLength(2);
    expect(entries[0].filename).toBe("segment_001");
    expect(entries[0].transcription).toBe("Hello world");
    expect(entries[1].filename).toBe("segment_002");
    expect(entries[1].transcription).toBe("Testing one two");
  });

  it("handles empty content", () => {
    expect(parseMetadataCsv("")).toHaveLength(0);
    expect(parseMetadataCsv("  \n  \n")).toHaveLength(0);
  });

  it("skips lines without pipe separator", () => {
    const content = "good_line|transcript\nbad line no pipe\n";
    const entries = parseMetadataCsv(content);
    expect(entries).toHaveLength(1);
  });

  it("handles transcriptions with pipe characters", () => {
    const content = "segment|text with | in it\n";
    const entries = parseMetadataCsv(content);
    expect(entries[0].transcription).toBe("text with | in it");
  });
});

describe("validateMetadataCompleteness", () => {
  it("returns no issues when WAVs and metadata match", () => {
    const wavFiles = ["segment_001.wav", "segment_002.wav"];
    const metadata = [
      { filename: "segment_001", transcription: "hello" },
      { filename: "segment_002", transcription: "world" },
    ];

    const issues = validateMetadataCompleteness(wavFiles, metadata);
    expect(issues).toHaveLength(0);
  });

  it("detects WAV files without transcript", () => {
    const wavFiles = ["segment_001.wav", "segment_002.wav"];
    const metadata = [{ filename: "segment_001", transcription: "hello" }];

    const issues = validateMetadataCompleteness(wavFiles, metadata);
    expect(issues).toHaveLength(1);
    expect(issues[0].type).toBe("missing_transcript");
    expect(issues[0].message).toContain("segment_002");
  });

  it("detects transcript entries without WAV", () => {
    const wavFiles = ["segment_001.wav"];
    const metadata = [
      { filename: "segment_001", transcription: "hello" },
      { filename: "segment_003", transcription: "orphan" },
    ];

    const issues = validateMetadataCompleteness(wavFiles, metadata);
    expect(issues).toHaveLength(1);
    expect(issues[0].type).toBe("missing_wav");
    expect(issues[0].message).toContain("segment_003");
  });

  it("handles metadata filenames with .wav extension", () => {
    const wavFiles = ["segment_001.wav"];
    const metadata = [
      { filename: "segment_001.wav", transcription: "hello" },
    ];

    const issues = validateMetadataCompleteness(wavFiles, metadata);
    expect(issues).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Per-Segment Validation
// ---------------------------------------------------------------------------

describe("validateSegment", () => {
  it("passes a valid 22050 Hz, 16-bit, mono WAV with good duration", () => {
    const samples = generateSineWave(440, 5.0, 22050, 5000);
    const buffer = buildWavBuffer({ samples });
    const result = validateSegment(buffer, "good.wav", defaultOptions());

    expect(result.passed).toBe(true);
    expect(result.header).toBeDefined();
    expect(result.header!.sampleRate).toBe(22050);
  });

  it("flags wrong sample rate", () => {
    const samples = generateSineWave(440, 2.0, 44100, 5000);
    const buffer = buildWavBuffer({ sampleRate: 44100, samples });
    const result = validateSegment(buffer, "bad-rate.wav", defaultOptions());

    expect(result.passed).toBe(false);
    expect(result.issues.some((i) => i.type === "sample_rate")).toBe(true);
  });

  it("flags wrong channel count", () => {
    const numSamples = 22050 * 2 * 2; // 2 seconds, stereo
    const samples = new Int16Array(numSamples);
    for (let i = 0; i < numSamples; i++) {
      samples[i] = Math.round(5000 * Math.sin((2 * Math.PI * 440 * i) / 22050));
    }
    const buffer = buildWavBuffer({ channels: 2, samples });
    const result = validateSegment(buffer, "stereo.wav", defaultOptions());

    expect(result.issues.some((i) => i.type === "channels")).toBe(true);
  });

  it("handles corrupt WAV gracefully", () => {
    const buffer = Buffer.from("This is not a WAV file at all");
    const result = validateSegment(buffer, "corrupt.wav", defaultOptions());

    expect(result.passed).toBe(false);
    expect(result.issues[0].type).toBe("corrupt_wav");
  });

  it("detects clipping", () => {
    const samples = new Int16Array(22050 * 2); // 2 seconds
    for (let i = 0; i < samples.length; i++) {
      samples[i] = i % 2 === 0 ? 32767 : -32768;
    }
    const buffer = buildWavBuffer({ samples });
    const result = validateSegment(buffer, "clipped.wav", defaultOptions());

    expect(result.clippingCount).toBeGreaterThan(0);
    expect(result.issues.some((i) => i.type === "clipping")).toBe(true);
  });

  it("detects low SNR", () => {
    // Create a very quiet, noisy signal
    const samples = new Int16Array(22050 * 2);
    for (let i = 0; i < samples.length; i++) {
      samples[i] = Math.round((Math.random() - 0.5) * 200);
    }
    const buffer = buildWavBuffer({ samples });
    const result = validateSegment(
      buffer,
      "noisy.wav",
      defaultOptions({ snrThreshold: 40 }),
    );

    // Pure noise should have low SNR
    expect(result.snr).toBeDefined();
    expect(result.issues.some((i) => i.type === "snr_low")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Report Generation
// ---------------------------------------------------------------------------

describe("generateSummaryText", () => {
  it("generates a report with correct header info", () => {
    const report: Omit<ValidationReport, "summary"> = {
      datasetPath: "/tmp/test",
      source: "karvounakis",
      snrThreshold: 20,
      clipThreshold: 32767,
      totalFiles: 10,
      passedFiles: 8,
      failedFiles: 1,
      flaggedFiles: 1,
      totalDuration: 3723, // 1h 2m 3s
      segments: [],
      metadataIssues: [],
    };

    const text = generateSummaryText(report);

    expect(text).toContain("Audio Dataset Validation Report");
    expect(text).toContain("/tmp/test");
    expect(text).toContain("karvounakis");
    expect(text).toContain("Total WAV files: 10");
    expect(text).toContain("Passed: 8");
    expect(text).toContain("Failed: 1");
    expect(text).toContain("Flagged (warnings): 1");
    expect(text).toContain("1h 2m 3s");
  });

  it("includes metadata issues section", () => {
    const report: Omit<ValidationReport, "summary"> = {
      datasetPath: "/tmp/test",
      source: "karvounakis",
      snrThreshold: 20,
      clipThreshold: 32767,
      totalFiles: 0,
      passedFiles: 0,
      failedFiles: 0,
      flaggedFiles: 0,
      totalDuration: 0,
      segments: [],
      metadataIssues: [
        {
          type: "missing_transcript",
          severity: "error",
          message: 'WAV file "test.wav" has no transcript entry',
        },
      ],
    };

    const text = generateSummaryText(report);

    expect(text).toContain("Metadata Issues");
    expect(text).toContain("test.wav");
  });

  it("includes failed segments", () => {
    const segment: SegmentResult = {
      filename: "bad.wav",
      passed: false,
      issues: [
        {
          type: "sample_rate",
          severity: "error",
          message: "Sample rate 44100 Hz (expected 22050 Hz)",
        },
      ],
    };

    const report: Omit<ValidationReport, "summary"> = {
      datasetPath: "/tmp/test",
      source: "karvounakis",
      snrThreshold: 20,
      clipThreshold: 32767,
      totalFiles: 1,
      passedFiles: 0,
      failedFiles: 1,
      flaggedFiles: 0,
      totalDuration: 0,
      segments: [segment],
      metadataIssues: [],
    };

    const text = generateSummaryText(report);

    expect(text).toContain("Failed Segments");
    expect(text).toContain("bad.wav");
    expect(text).toContain("44100");
  });
});

describe("formatDuration", () => {
  it("formats seconds only", () => {
    expect(formatDuration(45)).toBe("45s");
  });

  it("formats minutes and seconds", () => {
    expect(formatDuration(125)).toBe("2m 5s");
  });

  it("formats hours, minutes, seconds", () => {
    expect(formatDuration(3723)).toBe("1h 2m 3s");
  });

  it("formats zero", () => {
    expect(formatDuration(0)).toBe("0s");
  });
});

// ---------------------------------------------------------------------------
// buildWavBuffer utility
// ---------------------------------------------------------------------------

describe("buildWavBuffer", () => {
  it("creates a valid WAV buffer that round-trips through parseWavHeader", () => {
    const samples = new Int16Array([1000, -1000, 500, -500, 0]);
    const buffer = buildWavBuffer({
      sampleRate: 22050,
      bitDepth: 16,
      channels: 1,
      samples,
    });

    const header = parseWavHeader(buffer);
    expect(header.sampleRate).toBe(22050);
    expect(header.bitDepth).toBe(16);
    expect(header.channels).toBe(1);
  });

  it("samples can be read back via readPcmSamples", () => {
    const original = new Int16Array([1000, -2000, 3000, -4000]);
    const buffer = buildWavBuffer({ samples: original });
    const read = readPcmSamples(buffer);

    expect(read.length).toBe(original.length);
    for (let i = 0; i < original.length; i++) {
      expect(read[i]).toBe(original[i]);
    }
  });
});
