/**
 * Tahap 17 — what an agent last *said*, for the office speech bubble.
 *
 * The chat sheet is the full transcript; the office floor is the room. A
 * bubble on the floor answers one question only — "what did this agent just
 * say?" — so this module owns exactly three rules, and both worlds (the 2D
 * sprite in Avatar.tsx and the 3D character in Agent3D.tsx) read them here
 * instead of each inventing its own trimming (Rule 9.1 parity).
 *
 *  1. A bubble is a *line*, not a document: markdown fences, links, emphasis
 *     and block markers are stripped, whitespace collapsed, and the result
 *     clipped to SPEECH_MAX_CHARS with an ellipsis.
 *  2. A bubble is *recent*: it fades out of the office after SPEECH_TTL_MS,
 *     because a floor full of day-old sentences reads as live state when it
 *     is not (Rule C7 honesty).
 *  3. Nothing to say is `null`, never an empty bubble.
 *
 * No React, no timers, no I/O — `at` is passed in so this is pure and
 * testable.
 */

/** Longest bubble text; longer messages are clipped with a single `…`. */
export const SPEECH_MAX_CHARS = 48;
/** How long a bubble stays on the floor. */
export const SPEECH_TTL_MS = 45_000;

export interface SpeechEntry {
  /** Already normalised and clipped — safe to render as one line. */
  text: string;
  /** Epoch ms the entry was recorded (supplied by the caller). */
  at: number;
}

/**
 * Flatten a gateway reply into one plain line. Deliberately conservative:
 * it removes syntax, never invents words.
 */
export function normalizeSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ') // fenced code blocks
    .replace(/`([^`]*)`/g, '$1') // inline code keeps its text
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1') // links & images keep their label
    .replace(/^\s{0,3}([>#]+|[-*+]\s|\d+[.)]\s)/gm, ' ') // block markers
    .replace(/[*_~]/g, '') // emphasis
    .replace(/\s+/g, ' ')
    .trim();
}

/** `null` when there is nothing to say (empty, or only syntax). */
export function toSpeechEntry(text: string, at: number): SpeechEntry | null {
  const normalized = normalizeSpeech(text);
  if (!normalized) return null;
  const clipped =
    normalized.length > SPEECH_MAX_CHARS
      ? `${normalized.slice(0, SPEECH_MAX_CHARS - 1).trimEnd()}…`
      : normalized;
  return { text: clipped, at };
}

/** Fresh = recorded at or before `now`, and younger than `ttl`. */
export function isSpeechFresh(
  entry: SpeechEntry | null | undefined,
  now: number,
  ttl: number = SPEECH_TTL_MS
): boolean {
  if (!entry) return false;
  const age = now - entry.at;
  // A negative age means the clock moved backwards; treat it as fresh rather
  // than dropping the bubble on a device with a corrected clock.
  return age < ttl;
}

/** The line to render right now, or `null` when the bubble has expired. */
export function speechLine(
  entry: SpeechEntry | null | undefined,
  now: number,
  ttl: number = SPEECH_TTL_MS
): string | null {
  if (!isSpeechFresh(entry, now, ttl) || !entry) return null;
  return entry.text;
}
