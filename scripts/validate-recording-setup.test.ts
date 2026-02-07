import { describe, it, expect } from "vitest";
import {
  validateSetup,
  peakDbfs,
  rmsDbfs,
  formatReport,
  SETUP_THRESHOLDS,
  type SetupReport,
} from "./validate-recording-setup";
import { buildWavBuffer } from "./validate-audio-dataset";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a sine wave at a given frequency and amplitude. */
function makeSineWave(opts: {
  frequency?: number;
  amplitude?: number;
  durationSec?: number;
  sampleRate?: number;
}): Int16Array {
  const freq = opts.frequency ?? 440;
  const amp = opts.amplitude ?? 10000;
  const dur = opts.durationSec ?? 5;
  const sr = opts.sampleRate ?? 22050;
  const numSamples = Math.floor(sr * dur);
  const samples = new Int16Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    samples[i] = Math.round(amp * Math.sin((2 * Math.PI * freq * i) / sr));
  }
  return samples;
}

/** Build a valid test WAV buffer with a clean sine signal. */
function makeTestWav(overrides?: {
  sampleRate?: number;
  bitDepth?: number;
  channels?: number;
  amplitude?: number;
  durationSec?: number;
}): Buffer {
  const sampleRate = overrides?.sampleRate ?? 22050;
  const durationSec = overrides?.durationSec ?? 5;
  const amplitude = overrides?.amplitude ?? 10000;
  const samples = makeSineWave({ amplitude, durationSec, sampleRate });
  return buildWavBuffer({
    sampleRate,
    bitDepth: overrides?.bitDepth ?? 16,
    channels: overrides?.channels ?? 1,
    samples,
  });
}

// ---------------------------------------------------------------------------
// peakDbfs
// ---------------------------------------------------------------------------

describe("peakDbfs", () => {
  it("returns -Infinity for empty samples", () => {
    expect(peakDbfs(new Int16Array(0))).toBe(-Infinity);
  });

  it("returns -Infinity for all-zero samples", () => {
    expect(peakDbfs(new Int16Array([0, 0, 0]))).toBe(-Infinity);
  });

  it("returns 0 dBFS for full-scale sample", () => {
    // 32768 is full scale; peak of 32767 is ~-0.0003 dBFS
    const peak = peakDbfs(new Int16Array([32767]));
    expect(peak).toBeCloseTo(0, 0);
  });

  it("returns approximately -6 dBFS for half-amplitude", () => {
    const peak = peakDbfs(new Int16Array([16384]));
    expect(peak).toBeCloseTo(-6.0, 0);
  });
});

// ---------------------------------------------------------------------------
// rmsDbfs
// ---------------------------------------------------------------------------

describe("rmsDbfs", () => {
  it("returns -Infinity for empty samples", () => {
    expect(rmsDbfs(new Int16Array(0))).toBe(-Infinity);
  });

  it("returns finite value for non-zero samples", () => {
    const rms = rmsDbfs(new Int16Array([1000, -1000, 1000, -1000]));
    expect(Number.isFinite(rms)).toBe(true);
    expect(rms).toBeLessThan(0);
  });
});

// ---------------------------------------------------------------------------
// validateSetup
// ---------------------------------------------------------------------------

describe("validateSetup", () => {
  it("passes for a clean 22050Hz mono 16-bit WAV with good signal", () => {
    const wav = makeTestWav({ amplitude: 10000, durationSec: 5 });
    const report = validateSetup(wav, "test.wav");
    // All format checks should pass. SNR may or may not pass for a pure sine
    // (frame-based SNR on sine waves can be low), so check the format checks individually.
    const formatChecks = report.checks.filter((c) =>
      ["Sample Rate", "Bit Depth", "Channels", "Duration"].includes(c.check),
    );
    for (const check of formatChecks) {
      expect(check.passed).toBe(true);
    }
    expect(report.header).not.toBeNull();
    expect(report.header!.sampleRate).toBe(22050);
  });

  it("fails for invalid WAV data", () => {
    const garbage = Buffer.from("not a wav file at all!!");
    const report = validateSetup(garbage, "garbage.wav");
    expect(report.passed).toBe(false);
    expect(report.checks[0].check).toBe("WAV Format");
    expect(report.checks[0].passed).toBe(false);
  });

  it("fails for wrong sample rate", () => {
    const wav = makeTestWav({ sampleRate: 44100 });
    const report = validateSetup(wav, "test.wav");
    const srCheck = report.checks.find((c) => c.check === "Sample Rate");
    expect(srCheck).toBeDefined();
    expect(srCheck!.passed).toBe(false);
    expect(srCheck!.value).toContain("44100");
  });

  it("fails for wrong bit depth", () => {
    // buildWavBuffer writes the header bit depth but data is still 16-bit layout
    // The check only looks at header values, so this tests header validation
    const wav = makeTestWav({ bitDepth: 24 });
    const report = validateSetup(wav, "test.wav");
    const bdCheck = report.checks.find((c) => c.check === "Bit Depth");
    expect(bdCheck).toBeDefined();
    expect(bdCheck!.passed).toBe(false);
  });

  it("fails for stereo", () => {
    const wav = makeTestWav({ channels: 2 });
    const report = validateSetup(wav, "test.wav");
    const chCheck = report.checks.find((c) => c.check === "Channels");
    expect(chCheck).toBeDefined();
    expect(chCheck!.passed).toBe(false);
    expect(chCheck!.value).toContain("2");
  });

  it("fails for too-short recording", () => {
    const wav = makeTestWav({ durationSec: 1.0 });
    const report = validateSetup(wav, "test.wav");
    const durCheck = report.checks.find((c) => c.check === "Duration");
    expect(durCheck).toBeDefined();
    expect(durCheck!.passed).toBe(false);
  });

  it("detects clipping at near-max amplitude", () => {
    const wav = makeTestWav({ amplitude: 32700 });
    const report = validateSetup(wav, "test.wav");
    const clipCheck = report.checks.find((c) => c.check === "Clipping");
    expect(clipCheck).toBeDefined();
    // At 32700 amplitude, sine peak reaches 32700 which triggers clipping threshold
    expect(clipCheck!.passed).toBe(false);
  });

  it("detects very quiet signal (low peak level)", () => {
    const wav = makeTestWav({ amplitude: 100 });
    const report = validateSetup(wav, "test.wav");
    const peakCheck = report.checks.find((c) => c.check === "Peak Level");
    expect(peakCheck).toBeDefined();
    expect(peakCheck!.passed).toBe(false);
    expect(peakCheck!.advice).toContain("too quiet");
  });

  it("includes RMS level as informational (always passes)", () => {
    const wav = makeTestWav();
    const report = validateSetup(wav, "test.wav");
    const rmsCheck = report.checks.find((c) => c.check === "RMS Level");
    expect(rmsCheck).toBeDefined();
    expect(rmsCheck!.passed).toBe(true);
  });

  it("includes leading and trailing silence checks", () => {
    const wav = makeTestWav();
    const report = validateSetup(wav, "test.wav");
    const leadCheck = report.checks.find((c) => c.check === "Leading Silence");
    const trailCheck = report.checks.find((c) => c.check === "Trailing Silence");
    expect(leadCheck).toBeDefined();
    expect(trailCheck).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// formatReport
// ---------------------------------------------------------------------------

describe("formatReport", () => {
  it("includes PASS summary for passing report", () => {
    const report: SetupReport = {
      file: "test.wav",
      passed: true,
      header: {
        sampleRate: 22050,
        bitDepth: 16,
        channels: 1,
        dataSize: 220500,
        duration: 5.0,
      },
      checks: [
        { check: "Sample Rate", passed: true, value: "22050 Hz", expected: "22050 Hz" },
      ],
      summary: "PASS: Recording setup validated. Ready to begin KEP recording session.",
    };
    const output = formatReport(report, false);
    expect(output).toContain("PASS");
    expect(output).toContain("RECORDING SETUP VALIDATION");
  });

  it("includes FAIL summary with advice for failing report", () => {
    const report: SetupReport = {
      file: "test.wav",
      passed: false,
      header: null,
      checks: [
        {
          check: "WAV Format",
          passed: false,
          value: "Error: Invalid",
          expected: "Valid WAV file",
          advice: "Use FFmpeg to convert",
        },
      ],
      summary: "FAIL: 1 check(s) failed.",
    };
    const output = formatReport(report, false);
    expect(output).toContain("FAIL");
    expect(output).toContain("FFmpeg");
  });

  it("shows advice for failed checks even when not verbose", () => {
    const report: SetupReport = {
      file: "test.wav",
      passed: false,
      header: {
        sampleRate: 44100,
        bitDepth: 16,
        channels: 1,
        dataSize: 100,
        duration: 1.0,
      },
      checks: [
        {
          check: "Sample Rate",
          passed: false,
          value: "44100 Hz",
          expected: "22050 Hz",
          advice: "Convert with ffmpeg",
        },
      ],
      summary: "FAIL: 1 check(s) failed.",
    };
    const output = formatReport(report, false);
    expect(output).toContain("Convert with ffmpeg");
  });
});
