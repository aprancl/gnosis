#!/usr/bin/env npx tsx
/**
 * Recording setup validation for KEP self-recording sessions.
 *
 * Tests a sample WAV recording against quality thresholds before committing
 * to a full recording session. Provides actionable feedback for fixing issues.
 *
 * Usage:
 *   npx tsx scripts/validate-recording-setup.ts --file test-recording.wav
 *   npx tsx scripts/validate-recording-setup.ts --file test-recording.wav --verbose
 */

import * as fs from "fs";
import * as path from "path";
import {
  parseWavHeader,
  readPcmSamples,
  estimateSnr,
  detectClipping,
  detectLeadingSilence,
  detectTrailingSilence,
  computeRms,
  type WavHeader,
} from "./validate-audio-dataset";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SetupCheckResult {
  check: string;
  passed: boolean;
  value: string;
  expected: string;
  advice?: string;
}

export interface SetupReport {
  file: string;
  passed: boolean;
  header: WavHeader | null;
  checks: SetupCheckResult[];
  summary: string;
}

// ---------------------------------------------------------------------------
// Thresholds for KEP self-recordings
// ---------------------------------------------------------------------------

export const SETUP_THRESHOLDS = {
  sampleRate: 22050,
  bitDepth: 16,
  channels: 1,
  minSnrDb: 30,
  maxClippingPercent: 0.01,
  /** Peak level range in dBFS */
  minPeakDbfs: -24,
  maxPeakDbfs: -6,
  /** Max acceptable leading/trailing silence in seconds */
  maxSilence: 2.0,
  /** Min recording duration for a valid test (seconds) */
  minTestDuration: 3.0,
};

// ---------------------------------------------------------------------------
// Analysis Functions
// ---------------------------------------------------------------------------

/**
 * Compute peak amplitude in dBFS (decibels relative to full scale).
 * Full scale for 16-bit audio is 32768.
 */
export function peakDbfs(samples: Int16Array): number {
  if (samples.length === 0) return -Infinity;
  let maxAbs = 0;
  for (let i = 0; i < samples.length; i++) {
    const abs = Math.abs(samples[i]);
    if (abs > maxAbs) maxAbs = abs;
  }
  if (maxAbs === 0) return -Infinity;
  return 20 * Math.log10(maxAbs / 32768);
}

/**
 * Compute RMS level in dBFS.
 */
export function rmsDbfs(samples: Int16Array): number {
  const rms = computeRms(samples);
  if (rms === 0) return -Infinity;
  return 20 * Math.log10(rms / 32768);
}

/**
 * Run all setup validation checks on a WAV buffer.
 */
export function validateSetup(
  buffer: Buffer,
  filename: string,
): SetupReport {
  const checks: SetupCheckResult[] = [];
  let header: WavHeader | null = null;

  // Parse WAV header
  try {
    header = parseWavHeader(buffer);
  } catch (err) {
    checks.push({
      check: "WAV Format",
      passed: false,
      value: `Error: ${(err as Error).message}`,
      expected: "Valid WAV file",
      advice: "Ensure the file is a valid WAV (not MP3, FLAC, etc.). Use FFmpeg to convert: ffmpeg -i input.mp3 -ac 1 -ar 22050 -sample_fmt s16 output.wav",
    });
    return {
      file: filename,
      passed: false,
      header: null,
      checks,
      summary: "FAIL: Could not parse WAV header",
    };
  }

  // Check sample rate
  checks.push({
    check: "Sample Rate",
    passed: header.sampleRate === SETUP_THRESHOLDS.sampleRate,
    value: `${header.sampleRate} Hz`,
    expected: `${SETUP_THRESHOLDS.sampleRate} Hz`,
    advice:
      header.sampleRate !== SETUP_THRESHOLDS.sampleRate
        ? `Convert with: ffmpeg -i ${filename} -ar 22050 output.wav`
        : undefined,
  });

  // Check bit depth
  checks.push({
    check: "Bit Depth",
    passed: header.bitDepth === SETUP_THRESHOLDS.bitDepth,
    value: `${header.bitDepth}-bit`,
    expected: `${SETUP_THRESHOLDS.bitDepth}-bit`,
    advice:
      header.bitDepth !== SETUP_THRESHOLDS.bitDepth
        ? `Convert with: ffmpeg -i ${filename} -sample_fmt s16 output.wav`
        : undefined,
  });

  // Check channels
  checks.push({
    check: "Channels",
    passed: header.channels === SETUP_THRESHOLDS.channels,
    value: header.channels === 1 ? "Mono" : `${header.channels} channels`,
    expected: "Mono",
    advice:
      header.channels !== SETUP_THRESHOLDS.channels
        ? `Convert with: ffmpeg -i ${filename} -ac 1 output.wav`
        : undefined,
  });

  // Check duration
  checks.push({
    check: "Duration",
    passed: header.duration >= SETUP_THRESHOLDS.minTestDuration,
    value: `${header.duration.toFixed(1)}s`,
    expected: `>= ${SETUP_THRESHOLDS.minTestDuration}s`,
    advice:
      header.duration < SETUP_THRESHOLDS.minTestDuration
        ? "Record a longer sample (at least 3 seconds) for reliable analysis."
        : undefined,
  });

  // Read PCM samples for audio analysis
  const samples = readPcmSamples(buffer);

  if (samples.length === 0) {
    checks.push({
      check: "Audio Data",
      passed: false,
      value: "No samples",
      expected: "PCM sample data",
      advice: "The WAV file contains no audio data. Check your recording software settings.",
    });
  } else {
    // SNR
    const snr = estimateSnr(samples);
    const snrPassed = snr >= SETUP_THRESHOLDS.minSnrDb;
    checks.push({
      check: "Signal-to-Noise Ratio",
      passed: snrPassed,
      value: Number.isFinite(snr) ? `${snr.toFixed(1)} dB` : "∞ dB",
      expected: `>= ${SETUP_THRESHOLDS.minSnrDb} dB`,
      advice: !snrPassed
        ? "SNR too low. Try: (1) Move to a quieter room, (2) Close windows/doors, (3) Turn off fans/AC, (4) Move microphone closer to your mouth, (5) Use a noise gate in your recording software."
        : undefined,
    });

    // Peak level
    const peak = peakDbfs(samples);
    const peakPassed =
      peak >= SETUP_THRESHOLDS.minPeakDbfs &&
      peak <= SETUP_THRESHOLDS.maxPeakDbfs;
    checks.push({
      check: "Peak Level",
      passed: peakPassed,
      value: Number.isFinite(peak) ? `${peak.toFixed(1)} dBFS` : "-∞ dBFS",
      expected: `${SETUP_THRESHOLDS.minPeakDbfs} to ${SETUP_THRESHOLDS.maxPeakDbfs} dBFS`,
      advice: !peakPassed
        ? peak > SETUP_THRESHOLDS.maxPeakDbfs
          ? "Audio is too loud — lower your mic gain or move further from the microphone."
          : "Audio is too quiet — raise your mic gain or move closer to the microphone."
        : undefined,
    });

    // RMS level (informational)
    const rms = rmsDbfs(samples);
    checks.push({
      check: "RMS Level",
      passed: true, // informational
      value: Number.isFinite(rms) ? `${rms.toFixed(1)} dBFS` : "-∞ dBFS",
      expected: "Informational (no threshold)",
    });

    // Clipping
    const clipCount = detectClipping(samples, 32700);
    const clipPercent = (clipCount / samples.length) * 100;
    const clipPassed = clipPercent <= SETUP_THRESHOLDS.maxClippingPercent;
    checks.push({
      check: "Clipping",
      passed: clipPassed,
      value: clipCount === 0 ? "None" : `${clipCount} samples (${clipPercent.toFixed(3)}%)`,
      expected: `<= ${SETUP_THRESHOLDS.maxClippingPercent}%`,
      advice: !clipPassed
        ? "Clipping detected — lower your microphone gain. Clipping causes distortion that degrades TTS model quality."
        : undefined,
    });

    // Leading silence
    const leadingSilence = detectLeadingSilence(
      samples,
      header.sampleRate,
    );
    checks.push({
      check: "Leading Silence",
      passed: leadingSilence <= SETUP_THRESHOLDS.maxSilence,
      value: `${leadingSilence.toFixed(2)}s`,
      expected: `<= ${SETUP_THRESHOLDS.maxSilence}s`,
      advice:
        leadingSilence > SETUP_THRESHOLDS.maxSilence
          ? "Trim leading silence before recording starts, or start speaking sooner after pressing record."
          : undefined,
    });

    // Trailing silence
    const trailingSilence = detectTrailingSilence(
      samples,
      header.sampleRate,
    );
    checks.push({
      check: "Trailing Silence",
      passed: trailingSilence <= SETUP_THRESHOLDS.maxSilence,
      value: `${trailingSilence.toFixed(2)}s`,
      expected: `<= ${SETUP_THRESHOLDS.maxSilence}s`,
      advice:
        trailingSilence > SETUP_THRESHOLDS.maxSilence
          ? "Trim trailing silence, or stop recording sooner after finishing."
          : undefined,
    });
  }

  const allPassed = checks.every((c) => c.passed);
  const failCount = checks.filter((c) => !c.passed).length;

  const summary = allPassed
    ? "PASS: Recording setup validated. Ready to begin KEP recording session."
    : `FAIL: ${failCount} check(s) failed. Fix the issues above before recording.`;

  return {
    file: filename,
    passed: allPassed,
    header,
    checks,
    summary,
  };
}

// ---------------------------------------------------------------------------
// CLI Output Formatting
// ---------------------------------------------------------------------------

export function formatReport(report: SetupReport, verbose: boolean): string {
  const lines: string[] = [];

  lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  lines.push("RECORDING SETUP VALIDATION");
  lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  lines.push(`File: ${report.file}`);
  if (report.header) {
    lines.push(
      `Duration: ${report.header.duration.toFixed(1)}s | ${report.header.sampleRate} Hz | ${report.header.bitDepth}-bit | ${report.header.channels === 1 ? "Mono" : `${report.header.channels}ch`}`,
    );
  }
  lines.push("");

  for (const check of report.checks) {
    const icon = check.passed ? "[PASS]" : "[FAIL]";
    lines.push(`  ${icon} ${check.check}: ${check.value} (expected: ${check.expected})`);
    if (!check.passed && check.advice) {
      lines.push(`         -> ${check.advice}`);
    } else if (verbose && check.advice) {
      lines.push(`         -> ${check.advice}`);
    }
  }

  lines.push("");
  lines.push(report.summary);
  lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// CLI Entry Point
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): { file: string; verbose: boolean } {
  let file = "";
  let verbose = false;

  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--file" && i + 1 < argv.length) {
      file = argv[++i];
    } else if (argv[i] === "--verbose" || argv[i] === "-v") {
      verbose = true;
    } else if (!argv[i].startsWith("--")) {
      file = argv[i];
    }
  }

  return { file, verbose };
}

async function main(): Promise<void> {
  const { file, verbose } = parseArgs(process.argv);

  if (!file) {
    console.error(
      "Usage: npx tsx scripts/validate-recording-setup.ts --file <test-recording.wav>",
    );
    console.error("");
    console.error("Record a short (5-10 second) test clip of yourself reading Greek,");
    console.error("then run this script to validate your setup before a full session.");
    process.exit(1);
  }

  const filePath = path.resolve(file);

  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  const buffer = fs.readFileSync(filePath);
  const report = validateSetup(buffer, path.basename(filePath));

  console.log(formatReport(report, verbose));

  if (!report.passed) {
    process.exit(1);
  }
}

/* c8 ignore next 5 */
if (process.argv[1]?.endsWith("validate-recording-setup.ts")) {
  main().catch((err) => {
    console.error("Unexpected error:", err);
    process.exit(1);
  });
}
