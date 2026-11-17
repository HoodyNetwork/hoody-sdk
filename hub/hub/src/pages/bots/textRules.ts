// What the Bot's agent accepts as a role and as instructions, checked before the send so the form can name the field
// (the agent's own length limits and its checks of the settings and the instructions).
// The agent stays the authority: these only say sooner what it would refuse (400 bad_request).
// Lengths are counted as the agent counts them: in characters (code points) of the trimmed text.

/** A role's longest length, in characters. */
export const BOT_ROLE_MAX = 1000;
/** The instructions' longest length, in characters. */
export const BOT_INSTRUCTIONS_MAX = 4000;

const points = (s: string): number => Array.from(s).length;

/** The agent refuses a role longer than BOT_ROLE_MAX characters once trimmed. */
export const roleTooLong = (role: string): boolean => points(role.trim()) > BOT_ROLE_MAX;

export type InstructionsProblem = 'control' | 'invisible' | 'too_long' | null;

// Line breaks and tabs are kept by the agent; every other control character is refused.
const KEPT_CONTROL: ReadonlySet<number> = new Set([0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x85]);
// Unicode format characters (zero-width joiner and space, direction marks, the byte order mark): the agent refuses them.
const FORMAT = /\p{Cf}/u;

/** The first thing the agent would refuse in these instructions, in its own order: a control character that is no line
 *  break or tab, an invisible format character, then more than BOT_INSTRUCTIONS_MAX characters. null: sendable. */
export function instructionsProblem(text: string): InstructionsProblem {
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    if ((c <= 0x1f || (c >= 0x7f && c <= 0x9f)) && !KEPT_CONTROL.has(c)) return 'control';
  }
  if (FORMAT.test(text)) return 'invisible';
  return points(text.replace(/\r\n/g, '\n').trim()) > BOT_INSTRUCTIONS_MAX ? 'too_long' : null;
}
