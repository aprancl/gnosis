"use client";

/**
 * ChatInput component - text input with send button and optional voice input
 * for composing messages. Supports Enter to send (Shift+Enter for newline).
 */

import { useState, useRef, useCallback, useMemo } from "react";
import VoiceInput from "./VoiceInput";

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export default function ChatInput({
  onSend,
  disabled = false,
  placeholder = "Type your message in Greek...",
}: ChatInputProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /** Warn when the typed message is too short (under 2 characters). */
  const shortMessageWarning = useMemo(() => {
    const trimmed = value.trim();
    return trimmed.length > 0 && trimmed.length < 2;
  }, [value]);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [value, disabled, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    // Auto-resize textarea
    const textarea = e.target;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
  };

  const handleVoiceTranscript = useCallback(
    (text: string) => {
      if (!disabled && text.trim()) {
        onSend(text.trim());
      }
    },
    [disabled, onSend]
  );

  return (
    <div>
      <div className="flex items-end gap-3 rounded-2xl border border-blue-200 bg-white p-3 shadow-sm">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={placeholder}
          rows={1}
          className="flex-1 resize-none bg-transparent font-serif text-lg text-ink placeholder:text-blue-300 focus:outline-none disabled:opacity-50"
        />
        <VoiceInput onTranscript={handleVoiceTranscript} disabled={disabled} />
        <button
          onClick={handleSend}
          disabled={disabled || !value.trim()}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-700 text-white transition-colors hover:bg-blue-800 disabled:opacity-40 disabled:hover:bg-blue-700"
          aria-label="Send message"
        >
          <SendIcon />
        </button>
      </div>
      {shortMessageWarning && (
        <p className="mt-1 px-1 font-serif text-xs text-amber-600">
          Your message seems very short. Try writing a bit more!
        </p>
      )}
    </div>
  );
}

function SendIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 2 11 13" />
      <path d="M22 2 15 22 11 13 2 9l20-7z" />
    </svg>
  );
}
