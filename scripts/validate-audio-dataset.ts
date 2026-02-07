#!/usr/bin/env npx tsx
/**
 * Automated audio quality validation for Piper/VITS TTS training datasets.
 *
 * Validates WAV files against quality standards:
 * - Sample rate (22.05 kHz), bit depth (16-bit), channels (mono)
 * - Duration (1-20s, 0.5s exception for vocabulary)
 * - SNR estimation per segment
 * - Clipping detection
 * - Silence detection (leading/trailing)
 * - Metadata completeness (WAV <-> transcript bidirectional)
 *
 * Usage:
 *   npx tsx scripts/validate-audio-dataset.ts --path ./data/karvounakis
 *   npx tsx scripts/validate-audio-dataset.ts --path ./data/kep-self --source kep-self --snr-threshold 30
 */

import * as fs from "fs";
import * as path from "path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WavHeader {
  sampleRate: number;
  bitDepth: number;
  channels: number;
  dataSize: number;
  /** Duration in seconds */
  duration: number;
}

export interface ValidationIssue {
  type:
    | "sample_rate"
    | "bit_depth"
    | "channels"
    | "duration_short"
    | "duration_long"
    | "duration_vocabulary"
    | "snr_low"
    | "clipping"
    | "leading_silence"
    | "trailing_silence"
    | "missing_transcript"
    | "missing_wav"
    | "corrupt_wav";
  severity: "error" | "warning";
  message: string;
}

export interface SegmentResult {
  filename: string;
  issues: ValidationIssue[];
  passed: boolean;
  header?: WavHeader;
  snr?: number;
  clippingCount?: number;
  leadingSilence?: number;
  trailingSilence?: number;
}

export interface ValidationReport {
  datasetPath: string;
  source: string;
  snrThreshold: number;
  clipThreshold: number;
  totalFiles: number;
  passedFiles: number;
  failedFiles: number;
  flaggedFiles: number;
  totalDuration: number;
  segments: SegmentResult[];
  metadataIssues: ValidationIssue[];
  summary: string;
}

export interface ValidateOptions {
  datasetPath: string;
  source: "karvounakis" | "kep-self";
  snrThreshold: number;
  clipThreshold: number;
  silenceThreshold: number;
  minDuration: number;
  maxDuration: number;
  vocabMinDuration: number;
  maxLeadingTrailingSilence: number;
}

// ---------------------------------------------------------------------------
// WAV Header Parsing
// ---------------------------------------------------------------------------

/**
 * Parse a WAV file header from a Buffer.
 *
 * WAV format: RIFF header (12 bytes) + chunks (fmt, data, etc.)
 * - Bytes 0-3: "RIFF"
 * - Bytes 4-7: file size - 8
 * - Bytes 8-11: "WAVE"
 * - Then chunks: each has 4-byte ID + 4-byte size + data
 *
 * fmt chunk (minimum 16 bytes):
 *   - 2 bytes: audio format (1 = PCM)
 *   - 2 bytes: number of channels
 *   - 4 bytes: sample rate
 *   - 4 bytes: byte rate
 *   - 2 bytes: block align
 *   - 2 bytes: bits per sample
 *
 * data chunk:
 *   - size tells us the PCM data length
 */
export function parseWavHeader(buffer: Buffer): WavHeader {
  if (buffer.length < 44) {
    throw new Error("Buffer too small to be a valid WAV file");
  }

  const riff = buffer.toString("ascii", 0, 4);
  if (riff !== "RIFF") {
    throw new Error(`Invalid RIFF header: got "${riff}"`);
  }

  const wave = buffer.toString("ascii", 8, 12);
  if (wave !== "WAVE") {
    throw new Error(`Invalid WAVE format: got "${wave}"`);
  }

  // Find fmt and data chunks
  let offset = 12;
  let sampleRate = 0;
  let bitDepth = 0;
  let channels = 0;
  let dataSize = 0;
  let foundFmt = false;
  let foundData = false;

  while (offset < buffer.length - 8) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);

    if (chunkId === "fmt ") {
      if (chunkSize < 16) {
        throw new Error("fmt chunk too small");
      }
      const audioFormat = buffer.readUInt16LE(offset + 8);
      if (audioFormat !== 1) {
        throw new Error(`Unsupported audio format: ${audioFormat} (expected PCM = 1)`);
      }
      channels = buffer.readUInt16LE(offset + 10);
      sampleRate = buffer.readUInt32LE(offset + 12);
      // byteRate at offset + 16 (4 bytes)
      // blockAlign at offset + 20 (2 bytes)
      bitDepth = buffer.readUInt16LE(offset + 22);
      foundFmt = true;
    } else if (chunkId === "data") {
      dataSize = chunkSize;
      foundData = true;
    }

    offset += 8 + chunkSize;
    // Chunks are word-aligned (padded to even byte boundary)
    if (chunkSize % 2 !== 0) {
      offset += 1;
    }

    if (foundFmt && foundData) break;
  }

  if (!foundFmt) {
    throw new Error("Missing fmt chunk");
  }
  if (!foundData) {
    throw new Error("Missing data chunk");
  }

  const bytesPerSample = bitDepth / 8;
  const duration = dataSize / (sampleRate * channels * bytesPerSample);

  return { sampleRate, bitDepth, channels, dataSize, duration };
}

// ---------------------------------------------------------------------------
// Audio Analysis Utilities
// ---------------------------------------------------------------------------

/**
 * Read 16-bit PCM samples from a WAV data buffer.
 * Returns an array of sample values in [-32768, 32767].
 */
export function readPcmSamples(buffer: Buffer): Int16Array {
  // Find the data chunk
  let offset = 12;
  while (offset < buffer.length - 8) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);

    if (chunkId === "data") {
      const dataStart = offset + 8;
      const dataEnd = Math.min(dataStart + chunkSize, buffer.length);
      const dataBuffer = buffer.subarray(dataStart, dataEnd);
      const sampleCount = Math.floor(dataBuffer.length / 2);
      const samples = new Int16Array(sampleCount);
      for (let i = 0; i < sampleCount; i++) {
        samples[i] = dataBuffer.readInt16LE(i * 2);
      }
      return samples;
    }

    offset += 8 + chunkSize;
    if (chunkSize % 2 !== 0) offset += 1;
  }

  return new Int16Array(0);
}

/**
 * Compute RMS (Root Mean Square) of a sample array.
 */
export function computeRms(samples: Int16Array | number[]): number {
  if (samples.length === 0) return 0;
  let sumSquares = 0;
  for (let i = 0; i < samples.length; i++) {
    sumSquares += samples[i] * samples[i];
  }
  return Math.sqrt(sumSquares / samples.length);
}

/**
 * Estimate Signal-to-Noise Ratio (SNR) in dB.
 *
 * Strategy: Sort samples by absolute amplitude, treat the bottom 10%
 * as "noise floor" and the full signal RMS as the signal level.
 * SNR = 20 * log10(signalRms / noiseRms)
 */
export function estimateSnr(samples: Int16Array): number {
  if (samples.length === 0) return 0;

  const signalRms = computeRms(samples);
  if (signalRms === 0) return 0;

  // Estimate noise floor: divide signal into small frames, use the
  // quietest 10% of frames as the noise estimate. This is more robust
  // than sorting individual samples (which fails for sine waves where
  // samples near zero crossings look like noise).
  const frameSize = Math.min(1024, Math.floor(samples.length / 10));
  if (frameSize === 0) return 0;

  const frameRmsValues: number[] = [];
  for (let i = 0; i < samples.length - frameSize; i += frameSize) {
    let sum = 0;
    for (let j = i; j < i + frameSize; j++) {
      sum += samples[j] * samples[j];
    }
    frameRmsValues.push(Math.sqrt(sum / frameSize));
  }

  if (frameRmsValues.length === 0) return 0;

  frameRmsValues.sort((a, b) => a - b);
  const noiseFrameCount = Math.max(1, Math.floor(frameRmsValues.length * 0.1));
  let noiseRmsSum = 0;
  for (let i = 0; i < noiseFrameCount; i++) {
    noiseRmsSum += frameRmsValues[i];
  }
  const noiseRms = noiseRmsSum / noiseFrameCount;

  if (noiseRms === 0) return Infinity;

  return 20 * Math.log10(signalRms / noiseRms);
}

/**
 * Count clipping events: samples at or beyond the threshold amplitude.
 * For 16-bit audio, max is 32767 (positive) or -32768 (negative).
 */
export function detectClipping(
  samples: Int16Array,
  threshold: number = 32767,
): number {
  let count = 0;
  for (let i = 0; i < samples.length; i++) {
    if (Math.abs(samples[i]) >= threshold) {
      count++;
    }
  }
  return count;
}

/**
 * Detect leading silence duration in seconds.
 * Silence is defined as samples with absolute value below a threshold.
 *
 * @param samples - PCM samples
 * @param sampleRate - Sample rate in Hz
 * @param amplitudeThreshold - Max amplitude to consider as silence (default 100)
 * @param windowSize - Number of samples to check as a window (default 256)
 * @returns Duration of leading silence in seconds
 */
export function detectLeadingSilence(
  samples: Int16Array,
  sampleRate: number,
  amplitudeThreshold: number = 100,
  windowSize: number = 256,
): number {
  let lastSilentSample = 0;
  for (let i = 0; i < samples.length; i += windowSize) {
    const end = Math.min(i + windowSize, samples.length);
    let maxAmp = 0;
    for (let j = i; j < end; j++) {
      maxAmp = Math.max(maxAmp, Math.abs(samples[j]));
    }
    if (maxAmp >= amplitudeThreshold) {
      break;
    }
    lastSilentSample = end;
  }
  return lastSilentSample / sampleRate;
}

/**
 * Detect trailing silence duration in seconds.
 */
export function detectTrailingSilence(
  samples: Int16Array,
  sampleRate: number,
  amplitudeThreshold: number = 100,
  windowSize: number = 256,
): number {
  let lastSilentSample = samples.length;
  for (let i = samples.length; i > 0; i -= windowSize) {
    const start = Math.max(i - windowSize, 0);
    let maxAmp = 0;
    for (let j = start; j < i; j++) {
      maxAmp = Math.max(maxAmp, Math.abs(samples[j]));
    }
    if (maxAmp >= amplitudeThreshold) {
      break;
    }
    lastSilentSample = start;
  }
  return (samples.length - lastSilentSample) / sampleRate;
}

// ---------------------------------------------------------------------------
// Metadata Validation
// ---------------------------------------------------------------------------

export interface MetadataEntry {
  filename: string;
  transcription: string;
}

/**
 * Parse an LJSpeech-style metadata.csv file.
 * Format: filename|transcription (no header row)
 */
export function parseMetadataCsv(content: string): MetadataEntry[] {
  const entries: MetadataEntry[] = [];
  const lines = content.split("\n").filter((line) => line.trim().length > 0);

  for (const line of lines) {
    const pipeIndex = line.indexOf("|");
    if (pipeIndex === -1) continue;

    const filename = line.substring(0, pipeIndex).trim();
    const transcription = line.substring(pipeIndex + 1).trim();
    entries.push({ filename, transcription });
  }

  return entries;
}

/**
 * Check metadata completeness: every WAV has a transcript and vice versa.
 */
export function validateMetadataCompleteness(
  wavFiles: string[],
  metadata: MetadataEntry[],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  const metaFilenames = new Set(
    metadata.map((e) => {
      // Handle filenames with or without .wav extension
      const name = e.filename.endsWith(".wav")
        ? e.filename.slice(0, -4)
        : e.filename;
      return name;
    }),
  );

  const wavBasenames = new Set(
    wavFiles.map((f) => path.basename(f, ".wav")),
  );

  // WAV files without transcript entries
  for (const wav of wavBasenames) {
    if (!metaFilenames.has(wav)) {
      issues.push({
        type: "missing_transcript",
        severity: "error",
        message: `WAV file "${wav}.wav" has no transcript entry in metadata.csv`,
      });
    }
  }

  // Transcript entries without WAV files
  for (const meta of metaFilenames) {
    if (!wavBasenames.has(meta)) {
      issues.push({
        type: "missing_wav",
        severity: "error",
        message: `Metadata entry "${meta}" has no corresponding WAV file`,
      });
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Per-Segment Validation
// ---------------------------------------------------------------------------

/**
 * Validate a single WAV file against all quality criteria.
 */
export function validateSegment(
  buffer: Buffer,
  filename: string,
  options: ValidateOptions,
): SegmentResult {
  const issues: ValidationIssue[] = [];
  let header: WavHeader | undefined;
  let snr: number | undefined;
  let clippingCount: number | undefined;
  let leadingSilence: number | undefined;
  let trailingSilence: number | undefined;

  // Parse WAV header
  try {
    header = parseWavHeader(buffer);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    issues.push({
      type: "corrupt_wav",
      severity: "error",
      message: `Corrupt WAV file: ${message}`,
    });
    return { filename, issues, passed: false };
  }

  // Sample rate check
  if (header.sampleRate !== 22050) {
    issues.push({
      type: "sample_rate",
      severity: "error",
      message: `Sample rate ${header.sampleRate} Hz (expected 22050 Hz)`,
    });
  }

  // Bit depth check
  if (header.bitDepth !== 16) {
    issues.push({
      type: "bit_depth",
      severity: "error",
      message: `Bit depth ${header.bitDepth} (expected 16)`,
    });
  }

  // Channels check
  if (header.channels !== 1) {
    issues.push({
      type: "channels",
      severity: "error",
      message: `${header.channels} channels (expected mono/1)`,
    });
  }

  // Duration check
  if (header.duration < options.vocabMinDuration) {
    issues.push({
      type: "duration_short",
      severity: "error",
      message: `Duration ${header.duration.toFixed(2)}s is below minimum ${options.vocabMinDuration}s`,
    });
  } else if (header.duration < options.minDuration) {
    issues.push({
      type: "duration_vocabulary",
      severity: "warning",
      message: `Duration ${header.duration.toFixed(2)}s is below ${options.minDuration}s (acceptable for vocabulary)`,
    });
  }

  if (header.duration > options.maxDuration) {
    issues.push({
      type: "duration_long",
      severity: "error",
      message: `Duration ${header.duration.toFixed(2)}s exceeds maximum ${options.maxDuration}s`,
    });
  }

  // Read PCM samples for audio analysis (only for 16-bit mono)
  if (header.bitDepth === 16) {
    const samples = readPcmSamples(buffer);

    if (samples.length > 0) {
      // SNR estimation
      snr = estimateSnr(samples);
      if (snr < options.snrThreshold) {
        issues.push({
          type: "snr_low",
          severity: "warning",
          message: `SNR ${snr.toFixed(1)} dB is below threshold ${options.snrThreshold} dB`,
        });
      }

      // Clipping detection
      clippingCount = detectClipping(samples, options.clipThreshold);
      if (clippingCount > 0) {
        issues.push({
          type: "clipping",
          severity: "warning",
          message: `${clippingCount} clipped samples detected (threshold: ${options.clipThreshold})`,
        });
      }

      // Silence detection
      leadingSilence = detectLeadingSilence(
        samples,
        header.sampleRate,
        options.silenceThreshold,
      );
      if (leadingSilence > options.maxLeadingTrailingSilence) {
        issues.push({
          type: "leading_silence",
          severity: "warning",
          message: `Leading silence ${leadingSilence.toFixed(2)}s exceeds ${options.maxLeadingTrailingSilence}s`,
        });
      }

      trailingSilence = detectTrailingSilence(
        samples,
        header.sampleRate,
        options.silenceThreshold,
      );
      if (trailingSilence > options.maxLeadingTrailingSilence) {
        issues.push({
          type: "trailing_silence",
          severity: "warning",
          message: `Trailing silence ${trailingSilence.toFixed(2)}s exceeds ${options.maxLeadingTrailingSilence}s`,
        });
      }
    }
  }

  const hasErrors = issues.some((i) => i.severity === "error");

  return {
    filename,
    issues,
    passed: !hasErrors,
    header,
    snr,
    clippingCount,
    leadingSilence,
    trailingSilence,
  };
}

// ---------------------------------------------------------------------------
// Dataset Validation
// ---------------------------------------------------------------------------

/**
 * Validate an entire audio dataset directory.
 */
export async function validateDataset(
  options: ValidateOptions,
): Promise<ValidationReport> {
  const { datasetPath, source, snrThreshold, clipThreshold } = options;

  // Check directory exists
  if (!fs.existsSync(datasetPath)) {
    throw new Error(
      `Dataset directory not found: ${datasetPath}\n` +
        `Expected structure:\n` +
        `  ${datasetPath}/\n` +
        `    wavs/\n` +
        `      segment_001.wav\n` +
        `      ...\n` +
        `    metadata.csv`,
    );
  }

  const wavsDir = path.join(datasetPath, "wavs");
  const metadataPath = path.join(datasetPath, "metadata.csv");

  // Check wavs directory
  if (!fs.existsSync(wavsDir)) {
    throw new Error(
      `WAV directory not found: ${wavsDir}\n` +
        `Expected a "wavs/" subdirectory inside ${datasetPath}`,
    );
  }

  // Collect WAV files
  const wavFiles = fs
    .readdirSync(wavsDir)
    .filter((f) => f.toLowerCase().endsWith(".wav"))
    .sort();

  // Parse metadata
  let metadata: MetadataEntry[] = [];
  let metadataIssues: ValidationIssue[] = [];

  if (fs.existsSync(metadataPath)) {
    const metaContent = fs.readFileSync(metadataPath, "utf-8");
    if (metaContent.trim().length === 0) {
      metadataIssues.push({
        type: "missing_transcript",
        severity: "error",
        message: "metadata.csv is empty",
      });
    } else {
      metadata = parseMetadataCsv(metaContent);
      metadataIssues = validateMetadataCompleteness(wavFiles, metadata);
    }
  } else {
    metadataIssues.push({
      type: "missing_transcript",
      severity: "error",
      message: `metadata.csv not found at ${metadataPath}`,
    });
  }

  // Validate each WAV file
  const segments: SegmentResult[] = [];
  let totalDuration = 0;

  for (const wavFile of wavFiles) {
    const wavPath = path.join(wavsDir, wavFile);
    let buffer: Buffer;

    try {
      buffer = fs.readFileSync(wavPath);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      segments.push({
        filename: wavFile,
        issues: [
          {
            type: "corrupt_wav",
            severity: "error",
            message: `Could not read file: ${message}`,
          },
        ],
        passed: false,
      });
      continue;
    }

    const result = validateSegment(buffer, wavFile, options);
    segments.push(result);

    if (result.header) {
      totalDuration += result.header.duration;
    }
  }

  // Compute summary stats
  const passedFiles = segments.filter((s) => s.passed && s.issues.length === 0).length;
  const failedFiles = segments.filter((s) => !s.passed).length;
  const flaggedFiles = segments.filter((s) => s.passed && s.issues.length > 0).length;

  // Generate summary text
  const summary = generateSummaryText({
    datasetPath,
    source,
    snrThreshold,
    clipThreshold,
    totalFiles: wavFiles.length,
    passedFiles,
    failedFiles,
    flaggedFiles,
    totalDuration,
    segments,
    metadataIssues,
    summary: "",
  });

  return {
    datasetPath,
    source,
    snrThreshold,
    clipThreshold,
    totalFiles: wavFiles.length,
    passedFiles,
    failedFiles,
    flaggedFiles,
    totalDuration,
    segments,
    metadataIssues,
    summary,
  };
}

// ---------------------------------------------------------------------------
// Report Generation
// ---------------------------------------------------------------------------

/**
 * Generate human-readable summary text from a validation report.
 */
export function generateSummaryText(report: Omit<ValidationReport, "summary">): string {
  const lines: string[] = [];

  lines.push("=== Audio Dataset Validation Report ===");
  lines.push(`Dataset: ${report.datasetPath}`);
  lines.push(`Source: ${report.source}`);
  lines.push(`SNR Threshold: ${report.snrThreshold} dB`);
  lines.push(`Clip Threshold: ${report.clipThreshold}`);
  lines.push("");
  lines.push("--- Summary ---");
  lines.push(`Total WAV files: ${report.totalFiles}`);
  lines.push(`Passed: ${report.passedFiles}`);
  lines.push(`Failed: ${report.failedFiles}`);
  lines.push(`Flagged (warnings): ${report.flaggedFiles}`);
  lines.push(`Total duration: ${formatDuration(report.totalDuration)}`);
  lines.push("");

  // Metadata issues
  if (report.metadataIssues.length > 0) {
    lines.push("--- Metadata Issues ---");
    for (const issue of report.metadataIssues) {
      lines.push(`  [${issue.severity.toUpperCase()}] ${issue.message}`);
    }
    lines.push("");
  }

  // Flagged segments (errors)
  const failedSegments = report.segments.filter((s) => !s.passed);
  if (failedSegments.length > 0) {
    lines.push("--- Failed Segments ---");
    for (const seg of failedSegments) {
      lines.push(`  ${seg.filename}:`);
      for (const issue of seg.issues) {
        lines.push(`    [${issue.severity.toUpperCase()}] ${issue.message}`);
      }
    }
    lines.push("");
  }

  // Flagged segments (warnings only)
  const warnSegments = report.segments.filter(
    (s) => s.passed && s.issues.length > 0,
  );
  if (warnSegments.length > 0) {
    lines.push("--- Flagged Segments (Warnings) ---");
    for (const seg of warnSegments) {
      lines.push(`  ${seg.filename}:`);
      for (const issue of seg.issues) {
        lines.push(`    [${issue.severity.toUpperCase()}] ${issue.message}`);
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Format seconds into a human-readable string (e.g., "1h 23m 45s").
 */
export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

// ---------------------------------------------------------------------------
// Synthetic WAV Builder (for testing)
// ---------------------------------------------------------------------------

/**
 * Build a minimal valid WAV buffer with the given parameters.
 * Useful for testing without actual audio files.
 */
export function buildWavBuffer(params: {
  sampleRate?: number;
  bitDepth?: number;
  channels?: number;
  samples?: Int16Array | number[];
}): Buffer {
  const sampleRate = params.sampleRate ?? 22050;
  const bitDepth = params.bitDepth ?? 16;
  const channels = params.channels ?? 1;
  const samples = params.samples ?? new Int16Array([0]);

  const bytesPerSample = bitDepth / 8;
  const blockAlign = channels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * bytesPerSample;
  const fileSize = 36 + dataSize;

  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF header
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(fileSize, 4);
  buffer.write("WAVE", 8);

  // fmt chunk
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16); // chunk size
  buffer.writeUInt16LE(1, 20); // PCM format
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitDepth, 34);

  // data chunk
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  // Write samples
  for (let i = 0; i < samples.length; i++) {
    buffer.writeInt16LE(
      Math.max(-32768, Math.min(32767, Math.round(samples[i] ?? 0))),
      44 + i * 2,
    );
  }

  return buffer;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(): ValidateOptions {
  const args = process.argv.slice(2);
  let datasetPath = "";
  let source: "karvounakis" | "kep-self" = "karvounakis";
  let snrThreshold = 20;
  let clipThreshold = 32767;
  let silenceThreshold = 100;
  let minDuration = 1;
  let maxDuration = 20;
  let vocabMinDuration = 0.5;
  let maxLeadingTrailingSilence = 2;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--path":
        datasetPath = args[++i] || "";
        break;
      case "--source":
        {
          const val = args[++i];
          if (val === "karvounakis" || val === "kep-self") {
            source = val;
          }
        }
        break;
      case "--snr-threshold":
        snrThreshold = parseFloat(args[++i] || "20");
        break;
      case "--clip-threshold":
        clipThreshold = parseInt(args[++i] || "32767", 10);
        break;
      case "--silence-threshold":
        silenceThreshold = parseInt(args[++i] || "100", 10);
        break;
    }
  }

  // Apply source-specific defaults
  if (source === "kep-self" && !args.includes("--snr-threshold")) {
    snrThreshold = 30;
  }

  if (!datasetPath) {
    console.error("Error: --path <dataset_dir> is required");
    console.error(
      "Usage: npx tsx scripts/validate-audio-dataset.ts --path ./data/karvounakis [--source karvounakis|kep-self] [--snr-threshold 20]",
    );
    process.exit(1);
  }

  return {
    datasetPath: path.resolve(datasetPath),
    source,
    snrThreshold,
    clipThreshold,
    silenceThreshold,
    minDuration,
    maxDuration,
    vocabMinDuration,
    maxLeadingTrailingSilence,
  };
}

async function main(): Promise<void> {
  const options = parseArgs();

  console.log("Validating audio dataset...\n");

  try {
    const report = await validateDataset(options);

    // Output JSON report
    console.log(JSON.stringify(report, null, 2));
    console.log("\n");

    // Output human-readable summary
    console.log(report.summary);

    // Exit code based on results
    if (report.failedFiles > 0 || report.metadataIssues.length > 0) {
      process.exit(1);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error: ${message}`);
    process.exit(1);
  }
}

// Run main if this is the direct entry point
const isDirectExecution =
  typeof process !== "undefined" &&
  typeof process.argv !== "undefined" &&
  process.argv[1]?.endsWith("validate-audio-dataset.ts") === true;

if (isDirectExecution) {
  main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
