"use client";

/**
 * AudioControls - Accessible TTS playback controls.
 *
 * Provides play/pause toggle, playback speed selector, and replay button.
 * All controls are keyboard-accessible with proper aria-labels.
 * Controls are disabled when no audio is loaded/playing.
 */

import { useTextToSpeech } from "@/hooks/useTextToSpeech";
import { useEffect, useState } from "react";

interface AudioControlsProps {
  /** The text content to speak aloud */
  text: string;
}

const SPEED_OPTIONS = [0.5, 0.75, 1.0, 1.25] as const;

export default function AudioControls({ text }: AudioControlsProps) {
  const {
    isSupported,
    isSpeaking,
    isLoading,
    isPaused,
    playbackRate,
    error,
    speak,
    stop,
    pause,
    resume,
    replay,
    setPlaybackRate,
  } = useTextToSpeech();

  // Show error briefly then auto-dismiss
  const [showError, setShowError] = useState(false);
  // Track whether audio has been played at least once (for replay/controls)
  const [hasPlayed, setHasPlayed] = useState(false);
  // Show speed selector dropdown
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);

  useEffect(() => {
    if (error) {
      setShowError(true);
      const timer = setTimeout(() => setShowError(false), 4000);
      return () => clearTimeout(timer);
    } else {
      setShowError(false);
    }
  }, [error]);

  // Track when audio has been played
  useEffect(() => {
    if (isSpeaking) {
      setHasPlayed(true);
    }
  }, [isSpeaking]);

  if (!isSupported) {
    return null;
  }

  /** Whether audio is actively playing or paused (i.e., an audio session exists) */
  const hasActiveAudio = isSpeaking || isPaused;

  const handlePlayPause = () => {
    if (isLoading) return;

    if (isSpeaking) {
      pause();
    } else if (isPaused) {
      resume();
    } else {
      speak(text);
    }
  };

  const handleStop = () => {
    stop();
  };

  const handleReplay = () => {
    replay();
  };

  const handleSpeedChange = (rate: number) => {
    setPlaybackRate(rate);
    setShowSpeedMenu(false);
  };

  return (
    <div className="relative mt-1 inline-flex items-center gap-1 font-sans text-xs">
      {/* Play / Pause button */}
      <button
        onClick={handlePlayPause}
        disabled={isLoading}
        className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 transition-colors ${
          isLoading
            ? "cursor-wait bg-blue-50 text-blue-400"
            : isSpeaking
              ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
              : isPaused
                ? "bg-amber-50 text-amber-700 hover:bg-amber-100"
                : "text-blue-400 hover:bg-blue-50 hover:text-blue-600"
        }`}
        aria-label={
          isLoading
            ? "Loading audio"
            : isSpeaking
              ? "Pause audio"
              : isPaused
                ? "Resume audio"
                : "Listen to this message"
        }
        title={
          isLoading
            ? "Loading audio..."
            : isSpeaking
              ? "Pause"
              : isPaused
                ? "Resume"
                : "Listen"
        }
      >
        {isLoading ? (
          <>
            <LoadingSpinner />
            <span>Loading...</span>
          </>
        ) : isSpeaking ? (
          <>
            <PauseIcon />
            <span>Pause</span>
          </>
        ) : isPaused ? (
          <>
            <PlayIcon />
            <span>Resume</span>
          </>
        ) : (
          <>
            <SpeakerIcon />
            <span>Listen</span>
          </>
        )}
      </button>

      {/* Stop button - visible when playing or paused */}
      {hasActiveAudio && (
        <button
          onClick={handleStop}
          className="inline-flex items-center rounded-lg px-1.5 py-1 text-red-400 transition-colors hover:bg-red-50 hover:text-red-600"
          aria-label="Stop audio"
          title="Stop"
        >
          <StopIcon />
        </button>
      )}

      {/* Speed selector */}
      {(hasActiveAudio || hasPlayed) && (
        <div className="relative">
          <button
            onClick={() => setShowSpeedMenu((prev) => !prev)}
            className="inline-flex items-center rounded-lg px-1.5 py-1 text-blue-400 transition-colors hover:bg-blue-50 hover:text-blue-600"
            aria-label={`Playback speed: ${playbackRate}x. Click to change.`}
            title={`Speed: ${playbackRate}x`}
            aria-haspopup="true"
            aria-expanded={showSpeedMenu}
          >
            <span className="tabular-nums">{playbackRate}x</span>
          </button>

          {showSpeedMenu && (
            <div
              className="absolute bottom-full left-0 z-20 mb-1 rounded-lg border border-blue-100 bg-white py-1 shadow-lg"
              role="menu"
              aria-label="Playback speed options"
            >
              {SPEED_OPTIONS.map((rate) => (
                <button
                  key={rate}
                  onClick={() => handleSpeedChange(rate)}
                  className={`block w-full px-3 py-1 text-left tabular-nums transition-colors hover:bg-blue-50 ${
                    playbackRate === rate
                      ? "font-medium text-blue-700"
                      : "text-blue-500"
                  }`}
                  role="menuitem"
                  aria-label={`Set speed to ${rate}x`}
                >
                  {rate}x
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Replay button - visible when audio has been played before and not currently active */}
      {hasPlayed && !hasActiveAudio && !isLoading && (
        <button
          onClick={handleReplay}
          className="inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-blue-400 transition-colors hover:bg-blue-50 hover:text-blue-600"
          aria-label="Replay last audio"
          title="Replay"
        >
          <ReplayIcon />
          <span>Replay</span>
        </button>
      )}

      {/* Error toast */}
      {showError && error && (
        <div className="absolute top-full left-0 z-10 mt-1 max-w-48 rounded-md border border-red-200 bg-red-50 px-2 py-1">
          <p className="text-xs text-red-600">{error}</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function LoadingSpinner() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="animate-spin"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

function SpeakerIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="6" y="4" width="4" height="16" />
      <rect x="14" y="4" width="4" height="16" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    </svg>
  );
}

function ReplayIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
    </svg>
  );
}
