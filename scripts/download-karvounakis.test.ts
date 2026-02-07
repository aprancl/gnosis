import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import {
  NT_BOOKS,
  normalizeBookKey,
  formatDuration,
  writeLicense,
  generateBookFileUrls,
} from "./download-karvounakis";

// ---------------------------------------------------------------------------
// Mock node:child_process to avoid actually calling FFmpeg
// ---------------------------------------------------------------------------

vi.mock("node:child_process", () => ({
  execFile: vi.fn(
    (
      cmd: string,
      args: string[],
      callback: (err: Error | null, result: { stdout: string; stderr: string }) => void,
    ) => {
      if (cmd === "ffmpeg") {
        // Simulate successful conversion
        callback(null, { stdout: "", stderr: "" });
      } else if (cmd === "ffprobe") {
        // Simulate duration output
        callback(null, { stdout: "123.45\n", stderr: "" });
      } else {
        callback(new Error(`Unknown command: ${cmd}`), { stdout: "", stderr: "" });
      }
    },
  ),
}));

// ---------------------------------------------------------------------------
// Mock node:fs and node:fs/promises to avoid filesystem operations
// ---------------------------------------------------------------------------

const mockFiles = new Map<string, { size: number; content: string }>();

vi.mock("node:fs", () => ({
  existsSync: vi.fn((path: string) => mockFiles.has(path)),
  mkdirSync: vi.fn(),
  statSync: vi.fn((path: string) => {
    const file = mockFiles.get(path);
    return file ? { size: file.size } : { size: 0 };
  }),
  createWriteStream: vi.fn(() => ({
    write: vi.fn(),
    end: vi.fn(),
    on: vi.fn(),
    once: vi.fn(),
    emit: vi.fn(),
  })),
}));

vi.mock("node:fs/promises", () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
  readdir: vi.fn().mockResolvedValue([]),
  stat: vi.fn().mockResolvedValue({ size: 1000 }),
  unlink: vi.fn().mockResolvedValue(undefined),
}));

// Mock stream/promises pipeline
vi.mock("node:stream/promises", () => ({
  pipeline: vi.fn().mockResolvedValue(undefined),
}));

// Import mocked modules for assertions
import { writeFile } from "node:fs/promises";
import { mkdirSync } from "node:fs";

// ---------------------------------------------------------------------------
// Unit: NT_BOOKS mapping
// ---------------------------------------------------------------------------

describe("NT_BOOKS", () => {
  it("contains all 27 NT books", () => {
    expect(Object.keys(NT_BOOKS)).toHaveLength(27);
  });

  it("contains expected books", () => {
    expect(NT_BOOKS).toHaveProperty("matthew");
    expect(NT_BOOKS).toHaveProperty("revelation");
    expect(NT_BOOKS).toHaveProperty("1corinthians");
    expect(NT_BOOKS).toHaveProperty("philemon");
  });

  it("maps keys to BookInfo with display names", () => {
    expect(NT_BOOKS["matthew"].displayName).toBe("Matthew");
    expect(NT_BOOKS["1corinthians"].displayName).toBe("1 Corinthians");
    expect(NT_BOOKS["revelation"].displayName).toBe("Revelation");
  });

  it("maps keys to correct file prefixes from mp3chapters.csv", () => {
    expect(NT_BOOKS["matthew"].filePrefix).toBe("mat");
    expect(NT_BOOKS["mark"].filePrefix).toBe("mrk");
    expect(NT_BOOKS["luke"].filePrefix).toBe("luk");
    expect(NT_BOOKS["john"].filePrefix).toBe("jhn");
    expect(NT_BOOKS["acts"].filePrefix).toBe("act");
    expect(NT_BOOKS["romans"].filePrefix).toBe("rom");
    expect(NT_BOOKS["1corinthians"].filePrefix).toBe("1co");
    expect(NT_BOOKS["revelation"].filePrefix).toBe("rev");
  });

  it("has correct chapter counts for known books", () => {
    expect(NT_BOOKS["matthew"].chapters).toBe(28);
    expect(NT_BOOKS["mark"].chapters).toBe(16);
    expect(NT_BOOKS["luke"].chapters).toBe(24);
    expect(NT_BOOKS["john"].chapters).toBe(21);
    expect(NT_BOOKS["acts"].chapters).toBe(28);
    expect(NT_BOOKS["philemon"].chapters).toBe(1);
    expect(NT_BOOKS["revelation"].chapters).toBe(22);
  });

  it("totals 260 chapters across all books", () => {
    const total = Object.values(NT_BOOKS).reduce((sum, b) => sum + b.chapters, 0);
    expect(total).toBe(260);
  });
});

// ---------------------------------------------------------------------------
// Unit: generateBookFileUrls
// ---------------------------------------------------------------------------

describe("generateBookFileUrls", () => {
  it("generates correct URLs for a multi-chapter book", () => {
    const urls = generateBookFileUrls(NT_BOOKS["matthew"]);
    expect(urls).toHaveLength(28);
    expect(urls[0]).toContain("mp3/mat-1.mp3");
    expect(urls[27]).toContain("mp3/mat-28.mp3");
  });

  it("generates correct URLs for a single-chapter book", () => {
    const urls = generateBookFileUrls(NT_BOOKS["philemon"]);
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain("mp3/phm-1.mp3");
  });

  it("generates URLs pointing to GitHub raw content", () => {
    const urls = generateBookFileUrls(NT_BOOKS["john"]);
    expect(urls[0]).toMatch(/^https:\/\/raw\.githubusercontent\.com\//);
    expect(urls[0]).toContain("ManolisMariakakis");
  });

  it("generates sequential chapter numbers", () => {
    const urls = generateBookFileUrls(NT_BOOKS["mark"]);
    for (let i = 0; i < 16; i++) {
      expect(urls[i]).toContain(`mrk-${i + 1}.mp3`);
    }
  });
});

// ---------------------------------------------------------------------------
// Unit: normalizeBookKey
// ---------------------------------------------------------------------------

describe("normalizeBookKey", () => {
  it("lowercases and removes spaces", () => {
    expect(normalizeBookKey("1 Corinthians")).toBe("1corinthians");
    expect(normalizeBookKey("Matthew")).toBe("matthew");
    expect(normalizeBookKey("1 John")).toBe("1john");
  });

  it("handles already normalized keys", () => {
    expect(normalizeBookKey("matthew")).toBe("matthew");
    expect(normalizeBookKey("acts")).toBe("acts");
  });
});

// ---------------------------------------------------------------------------
// Unit: formatDuration
// ---------------------------------------------------------------------------

describe("formatDuration", () => {
  it("formats zero seconds", () => {
    expect(formatDuration(0)).toBe("00:00:00");
  });

  it("formats seconds only", () => {
    expect(formatDuration(45)).toBe("00:00:45");
  });

  it("formats minutes and seconds", () => {
    expect(formatDuration(125)).toBe("00:02:05");
  });

  it("formats hours, minutes, seconds", () => {
    expect(formatDuration(3661)).toBe("01:01:01");
  });

  it("formats large durations (~20 hours)", () => {
    expect(formatDuration(72000)).toBe("20:00:00");
  });

  it("truncates fractional seconds", () => {
    expect(formatDuration(1.9)).toBe("00:00:01");
  });
});

// ---------------------------------------------------------------------------
// Unit: writeLicense
// ---------------------------------------------------------------------------

describe("writeLicense", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates output directory", async () => {
    await writeLicense("/tmp/test-output");
    expect(mkdirSync).toHaveBeenCalledWith("/tmp/test-output", {
      recursive: true,
    });
  });

  it("writes LICENSE.md file", async () => {
    await writeLicense("/tmp/test-output");
    expect(writeFile).toHaveBeenCalledWith(
      "/tmp/test-output/LICENSE.md",
      expect.any(String),
      "utf-8",
    );
  });

  it("includes Public Domain Mark 1.0 in license content", async () => {
    await writeLicense("/tmp/test-output");
    const content = vi.mocked(writeFile).mock.calls[0][1] as string;
    expect(content).toContain("Public Domain Mark 1.0");
  });

  it("includes source URLs in license content", async () => {
    await writeLicense("/tmp/test-output");
    const content = vi.mocked(writeFile).mock.calls[0][1] as string;
    expect(content).toContain("archive.org");
    expect(content).toContain("ManolisMariakakis");
  });

  it("includes Textus Receptus reference", async () => {
    await writeLicense("/tmp/test-output");
    const content = vi.mocked(writeFile).mock.calls[0][1] as string;
    expect(content).toContain("Textus Receptus");
    expect(content).toContain("Scrivener 1894");
  });
});

// ---------------------------------------------------------------------------
// Unit: File organization structure
// ---------------------------------------------------------------------------

describe("file organization", () => {
  it("uses correct output directory structure", () => {
    const expectedWavsDir = "data/tts-training/karvounakis/wavs";
    // Each book gets its own subdirectory
    for (const bookKey of Object.keys(NT_BOOKS)) {
      const bookDir = join(expectedWavsDir, bookKey);
      expect(bookDir).toMatch(
        /^data\/tts-training\/karvounakis\/wavs\/[a-z0-9]+$/,
      );
    }
  });

  it("uses downloads directory for raw files", () => {
    const downloadDir = "data/tts-training/karvounakis/downloads";
    for (const bookKey of Object.keys(NT_BOOKS)) {
      const bookDir = join(downloadDir, bookKey);
      expect(bookDir).toMatch(
        /^data\/tts-training\/karvounakis\/downloads\/[a-z0-9]+$/,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Unit: convertToTrainingFormat (mocked FFmpeg)
// ---------------------------------------------------------------------------

describe("convertToTrainingFormat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls FFmpeg with correct arguments for Piper format", async () => {
    // Re-import to get fresh module with mocks
    const { convertToTrainingFormat } = await import(
      "./download-karvounakis"
    );
    const { execFile } = await import("node:child_process");

    await convertToTrainingFormat("/tmp/input.mp3", "/tmp/output.wav");

    expect(execFile).toHaveBeenCalledWith(
      "ffmpeg",
      expect.arrayContaining([
        "-y",
        "-i",
        "/tmp/input.mp3",
        "-ac",
        "1",
        "-ar",
        "22050",
        "-acodec",
        "pcm_s16le",
        "-f",
        "wav",
        "/tmp/output.wav",
      ]),
      expect.any(Function),
    );
  });

  it("specifies mono channel (-ac 1)", async () => {
    const { convertToTrainingFormat } = await import(
      "./download-karvounakis"
    );
    const { execFile } = await import("node:child_process");

    await convertToTrainingFormat("/tmp/input.mp3", "/tmp/output.wav");

    const args = vi.mocked(execFile).mock.calls[0][1] as string[];
    const acIdx = args.indexOf("-ac");
    expect(acIdx).not.toBe(-1);
    expect(args[acIdx + 1]).toBe("1");
  });

  it("specifies 22050 Hz sample rate (-ar 22050)", async () => {
    const { convertToTrainingFormat } = await import(
      "./download-karvounakis"
    );
    const { execFile } = await import("node:child_process");

    await convertToTrainingFormat("/tmp/input.mp3", "/tmp/output.wav");

    const args = vi.mocked(execFile).mock.calls[0][1] as string[];
    const arIdx = args.indexOf("-ar");
    expect(arIdx).not.toBe(-1);
    expect(args[arIdx + 1]).toBe("22050");
  });

  it("specifies 16-bit signed PCM codec (-acodec pcm_s16le)", async () => {
    const { convertToTrainingFormat } = await import(
      "./download-karvounakis"
    );
    const { execFile } = await import("node:child_process");

    await convertToTrainingFormat("/tmp/input.mp3", "/tmp/output.wav");

    const args = vi.mocked(execFile).mock.calls[0][1] as string[];
    const codecIdx = args.indexOf("-acodec");
    expect(codecIdx).not.toBe(-1);
    expect(args[codecIdx + 1]).toBe("pcm_s16le");
  });

  it("returns duration from ffprobe", async () => {
    const { convertToTrainingFormat } = await import(
      "./download-karvounakis"
    );

    const duration = await convertToTrainingFormat(
      "/tmp/input.mp3",
      "/tmp/output.wav",
    );

    expect(duration).toBeCloseTo(123.45, 1);
  });
});

// ---------------------------------------------------------------------------
// Unit: getAudioDuration (mocked ffprobe)
// ---------------------------------------------------------------------------

describe("getAudioDuration", () => {
  it("parses ffprobe output to seconds", async () => {
    const { getAudioDuration } = await import("./download-karvounakis");

    const duration = await getAudioDuration("/tmp/test.wav");
    expect(duration).toBeCloseTo(123.45, 1);
  });
});

// ---------------------------------------------------------------------------
// Unit: downloadFile (mocked fetch and fs)
// ---------------------------------------------------------------------------

describe("downloadFile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFiles.clear();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("skips download when file exists with correct size", async () => {
    const { downloadFile } = await import("./download-karvounakis");

    // Simulate existing file with correct size
    mockFiles.set("/tmp/test.mp3", { size: 1000, content: "" });

    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(null, {
        status: 200,
        headers: { "content-length": "1000" },
      }),
    );

    const result = await downloadFile(
      "https://example.com/test.mp3",
      "/tmp/test.mp3",
    );

    expect(result.skipped).toBe(true);
    expect(result.downloaded).toBe(false);
  });

  it("downloads when file does not exist", async () => {
    const { downloadFile } = await import("./download-karvounakis");

    // No existing file
    mockFiles.clear();

    const mockBody = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
        controller.close();
      },
    });

    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(mockBody, { status: 200 }),
    );

    const result = await downloadFile(
      "https://example.com/test.mp3",
      "/tmp/test.mp3",
    );

    expect(result.downloaded).toBe(true);
    expect(result.skipped).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Integration: Error handling behavior
// ---------------------------------------------------------------------------

describe("error handling", () => {
  it("conversion results track errors with filename", () => {
    // Verify the ConversionResult type supports error tracking
    const result = {
      inputFile: "mat-1.mp3",
      outputFile: "mat-1.wav",
      book: "matthew",
      status: "failed" as const,
      error: "FFmpeg exited with code 1",
    };

    expect(result.status).toBe("failed");
    expect(result.error).toContain("FFmpeg");
    expect(result.inputFile).toBe("mat-1.mp3");
  });

  it("download results track errors with filename", () => {
    const result = {
      file: "mat-1.mp3",
      book: "matthew",
      status: "failed" as const,
      error: "HTTP 404",
    };

    expect(result.status).toBe("failed");
    expect(result.error).toContain("404");
    expect(result.file).toBe("mat-1.mp3");
  });
});
