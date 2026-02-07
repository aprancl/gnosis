/**
 * Audio queue utility for streaming TTS playback.
 *
 * Manages a queue of audio chunks (as Blob or ArrayBuffer) and plays them
 * sequentially without gaps. Uses HTML Audio elements for cross-browser
 * compatibility, with seamless transitions between chunks.
 *
 * This is a client-side module ("use client" context).
 */

export type AudioQueueState = "idle" | "playing" | "paused" | "error";

export interface AudioQueueCallbacks {
  /** Called when playback state changes */
  onStateChange?: (state: AudioQueueState) => void;
  /** Called when an error occurs during playback */
  onError?: (error: string) => void;
  /** Called when all queued audio has finished playing */
  onComplete?: () => void;
}

export class AudioQueue {
  private queue: Blob[] = [];
  private currentAudio: HTMLAudioElement | null = null;
  private currentObjectUrl: string | null = null;
  private state: AudioQueueState = "idle";
  private isProcessing = false;
  private aborted = false;
  private callbacks: AudioQueueCallbacks;

  constructor(callbacks: AudioQueueCallbacks = {}) {
    this.callbacks = callbacks;
  }

  /**
   * Add an audio chunk (as Blob) to the playback queue.
   * If not currently playing, starts playback immediately.
   */
  enqueue(audioBlob: Blob): void {
    if (this.aborted) return;
    this.queue.push(audioBlob);

    if (!this.isProcessing) {
      this.processQueue();
    }
  }

  /**
   * Signal that no more chunks will be enqueued.
   * Playback continues until all queued chunks finish.
   */
  markComplete(): void {
    // Nothing to do; processQueue will call onComplete when queue empties
  }

  /**
   * Stop playback immediately and clear the queue.
   */
  stop(): void {
    this.aborted = true;
    this.queue = [];

    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio.removeAttribute("src");
      this.currentAudio = null;
    }

    if (this.currentObjectUrl) {
      URL.revokeObjectURL(this.currentObjectUrl);
      this.currentObjectUrl = null;
    }

    this.isProcessing = false;
    this.setState("idle");
  }

  /**
   * Reset the queue for reuse after stop().
   */
  reset(): void {
    this.stop();
    this.aborted = false;
  }

  /**
   * Get the current playback state.
   */
  getState(): AudioQueueState {
    return this.state;
  }

  /**
   * Get the number of chunks waiting in the queue.
   */
  getQueueLength(): number {
    return this.queue.length;
  }

  private setState(newState: AudioQueueState): void {
    if (this.state !== newState) {
      this.state = newState;
      this.callbacks.onStateChange?.(newState);
    }
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.aborted) return;
    this.isProcessing = true;

    while (this.queue.length > 0 && !this.aborted) {
      const blob = this.queue.shift()!;

      try {
        await this.playBlob(blob);
      } catch (err) {
        if (this.aborted) break;
        const message = err instanceof Error ? err.message : "Audio playback failed";
        this.setState("error");
        this.callbacks.onError?.(message);
        // Continue to next chunk on error
      }
    }

    this.isProcessing = false;

    if (!this.aborted) {
      this.setState("idle");
      this.callbacks.onComplete?.();
    }
  }

  private playBlob(blob: Blob): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (this.aborted) {
        resolve();
        return;
      }

      const url = URL.createObjectURL(blob);
      this.currentObjectUrl = url;

      const audio = new Audio(url);
      this.currentAudio = audio;

      audio.onplay = () => {
        this.setState("playing");
      };

      audio.onended = () => {
        this.cleanupCurrent();
        resolve();
      };

      audio.onerror = () => {
        this.cleanupCurrent();
        reject(new Error("Audio element playback error"));
      };

      audio.play().catch((err) => {
        this.cleanupCurrent();
        reject(err);
      });
    });
  }

  private cleanupCurrent(): void {
    if (this.currentObjectUrl) {
      URL.revokeObjectURL(this.currentObjectUrl);
      this.currentObjectUrl = null;
    }
    this.currentAudio = null;
  }
}
