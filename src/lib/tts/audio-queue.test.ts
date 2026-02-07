/**
 * Tests for AudioQueue - audio chunk queuing and sequential playback.
 *
 * Since the project uses Vitest with node environment (no DOM),
 * these tests verify the queue logic, state management, and callback
 * behavior using mocked Audio elements.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AudioQueue, type AudioQueueState } from "./audio-queue";

// ---------------------------------------------------------------------------
// Mock Audio and URL.createObjectURL/revokeObjectURL
// ---------------------------------------------------------------------------

let mockAudioInstances: MockAudio[] = [];

class MockAudio {
  src = "";
  paused = true;
  onplay: (() => void) | null = null;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  playResolve: (() => void) | null = null;
  playReject: ((err: Error) => void) | null = null;

  constructor(src?: string) {
    if (src) this.src = src;
    mockAudioInstances.push(this);
  }

  play(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.playResolve = resolve;
      this.playReject = reject;
      // Simulate successful play by default
      this.paused = false;
      if (this.onplay) this.onplay();
      resolve();
    });
  }

  pause(): void {
    this.paused = true;
  }

  removeAttribute(_name: string): void {
    // no-op
  }

  // Simulate playback ending
  simulateEnded(): void {
    if (this.onended) this.onended();
  }

  // Simulate playback error
  simulateError(): void {
    if (this.onerror) this.onerror();
  }
}

// Install global mocks
vi.stubGlobal("Audio", MockAudio);
vi.stubGlobal("URL", {
  createObjectURL: vi.fn(() => "blob:mock-url"),
  revokeObjectURL: vi.fn(),
});
vi.stubGlobal("Blob", class MockBlob {
  private parts: unknown[];
  type: string;
  constructor(parts: unknown[] = [], options: { type?: string } = {}) {
    this.parts = parts;
    this.type = options.type || "";
  }
});

beforeEach(() => {
  mockAudioInstances = [];
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AudioQueue", () => {
  describe("state management", () => {
    it("starts in idle state", () => {
      const queue = new AudioQueue();
      expect(queue.getState()).toBe("idle");
    });

    it("reports queue length", () => {
      const queue = new AudioQueue();
      expect(queue.getQueueLength()).toBe(0);
    });

    it("calls onStateChange when state transitions", async () => {
      const states: AudioQueueState[] = [];
      const queue = new AudioQueue({
        onStateChange: (state) => states.push(state),
      });

      const blob = new Blob(["audio"], { type: "audio/mpeg" });
      queue.enqueue(blob as unknown as Blob);

      // Wait for play to start
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(states).toContain("playing");
    });
  });

  describe("sequential playback", () => {
    it("plays first enqueued chunk immediately", async () => {
      const queue = new AudioQueue();
      const blob = new Blob(["audio"], { type: "audio/mpeg" });
      queue.enqueue(blob as unknown as Blob);

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockAudioInstances).toHaveLength(1);
    });

    it("plays next chunk after current one ends", async () => {
      const completeCb = vi.fn();
      const queue = new AudioQueue({ onComplete: completeCb });

      const blob1 = new Blob(["audio1"], { type: "audio/mpeg" });
      const blob2 = new Blob(["audio2"], { type: "audio/mpeg" });

      queue.enqueue(blob1 as unknown as Blob);
      queue.enqueue(blob2 as unknown as Blob);

      // Wait for first chunk to start playing
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(mockAudioInstances).toHaveLength(1);

      // Simulate first chunk ending
      mockAudioInstances[0].simulateEnded();

      // Wait for second chunk to start
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(mockAudioInstances).toHaveLength(2);
    });

    it("calls onComplete when all chunks finish", async () => {
      const completeCb = vi.fn();
      const queue = new AudioQueue({ onComplete: completeCb });

      const blob = new Blob(["audio"], { type: "audio/mpeg" });
      queue.enqueue(blob as unknown as Blob);

      await new Promise((resolve) => setTimeout(resolve, 10));

      // Simulate audio ending
      mockAudioInstances[0].simulateEnded();

      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(completeCb).toHaveBeenCalled();
    });
  });

  describe("stop", () => {
    it("stops current playback and clears queue", async () => {
      const queue = new AudioQueue();

      const blob1 = new Blob(["audio1"], { type: "audio/mpeg" });
      const blob2 = new Blob(["audio2"], { type: "audio/mpeg" });

      queue.enqueue(blob1 as unknown as Blob);
      queue.enqueue(blob2 as unknown as Blob);

      await new Promise((resolve) => setTimeout(resolve, 10));

      queue.stop();

      expect(queue.getState()).toBe("idle");
      expect(queue.getQueueLength()).toBe(0);
    });

    it("ignores enqueue after stop", async () => {
      const queue = new AudioQueue();
      queue.stop();

      const blob = new Blob(["audio"], { type: "audio/mpeg" });
      queue.enqueue(blob as unknown as Blob);

      await new Promise((resolve) => setTimeout(resolve, 10));

      // No audio should be created because aborted=true
      // (the enqueue was called after stop, which sets aborted=true)
      expect(queue.getQueueLength()).toBe(0);
    });

    it("revokes object URL on stop", async () => {
      const queue = new AudioQueue();
      const blob = new Blob(["audio"], { type: "audio/mpeg" });
      queue.enqueue(blob as unknown as Blob);

      await new Promise((resolve) => setTimeout(resolve, 10));

      queue.stop();

      expect(URL.revokeObjectURL).toHaveBeenCalled();
    });
  });

  describe("reset", () => {
    it("allows reuse after stop + reset", async () => {
      const queue = new AudioQueue();
      queue.stop();
      queue.reset();

      const blob = new Blob(["audio"], { type: "audio/mpeg" });
      queue.enqueue(blob as unknown as Blob);

      await new Promise((resolve) => setTimeout(resolve, 10));

      // Should create a new audio element since reset clears aborted flag
      expect(mockAudioInstances.length).toBeGreaterThan(0);
    });
  });

  describe("error handling", () => {
    it("calls onError and continues to next chunk on playback error", async () => {
      const errorCb = vi.fn();
      const completeCb = vi.fn();
      const queue = new AudioQueue({
        onError: errorCb,
        onComplete: completeCb,
      });

      const blob1 = new Blob(["audio1"], { type: "audio/mpeg" });
      const blob2 = new Blob(["audio2"], { type: "audio/mpeg" });

      queue.enqueue(blob1 as unknown as Blob);
      queue.enqueue(blob2 as unknown as Blob);

      await new Promise((resolve) => setTimeout(resolve, 10));

      // Simulate error on first chunk
      mockAudioInstances[0].simulateError();

      await new Promise((resolve) => setTimeout(resolve, 10));

      // Should have called onError
      expect(errorCb).toHaveBeenCalled();

      // Should continue to second chunk
      expect(mockAudioInstances).toHaveLength(2);
    });
  });
});
