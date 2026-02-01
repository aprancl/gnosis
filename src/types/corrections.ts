/**
 * Types for the inline correction system.
 *
 * Corrections are extracted from assistant messages where the agent
 * provides grammar/vocabulary feedback inline within its Greek responses.
 */

/** A single correction extracted from an assistant message. */
export interface Correction {
  /** The original (incorrect) form the user wrote */
  original: string;
  /** The corrected form provided by the assistant */
  corrected: string;
  /** Brief explanation of the correction */
  explanation: string;
  /** Character position in the message where the correction annotation starts */
  position: number;
}

/** The result of parsing an assistant message for corrections. */
export interface CorrectionParseResult {
  /** The cleaned message text with correction markers normalized */
  cleanedContent: string;
  /** Array of corrections found in the message */
  corrections: Correction[];
}

/** Serializable corrections data for storage in the database jsonb column. */
export interface CorrectionsData {
  [key: string]: unknown;
  corrections: Correction[];
}
