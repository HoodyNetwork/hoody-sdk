// Hidden characters in hook text: the Hub's copy of the agent's finding and
// marking of them, for DISPLAY only. The agent refuses to run a hook whose command
// or matcher holds a code point a screen does not show as written, and lists it with every such code point marked (⟨ESC⟩,
// ⟨U+200B⟩). The page marks every hook text it paints again: the agent's marked text is unchanged by it (the marks are visible
// characters), and an older or broken agent's raw hidden character still shows as a mark, never raw. What a write names is the
// text exactly as listed, never this output.
//
// The classes, as the agent's:
// - control: C0 except tab and newline, DEL, C1 (U+0080-U+009F). The agent also marks a byte that is not valid UTF-8 (⟨0x9B⟩);
//   text reaching the page is UTF-16, where the like is a lone surrogate, marked here as its number (⟨U+D800⟩).
// - bidi: U+202A-U+202E, U+2066-U+2069, U+200E, U+200F, U+061C.
// - zero-width: U+200B-U+200D, U+2060, U+FEFF.
// - soft hyphen: U+00AD.

export type HiddenClass = 'control character' | 'bidi control character' | 'zero-width character' | 'soft hyphen';

const OPEN = '⟨';
const CLOSE = '⟩';
/** The C0 controls and DEL people recognise by name; every other hidden code point shows as its number. */
const NAMES: Readonly<Record<number, string>> = { 0x00: 'NUL', 0x07: 'BEL', 0x08: 'BS', 0x0b: 'VT', 0x0c: 'FF', 0x0d: 'CR', 0x1b: 'ESC', 0x7f: 'DEL' };

const isBidi = (c: number): boolean => (c >= 0x202a && c <= 0x202e) || (c >= 0x2066 && c <= 0x2069) || c === 0x200e || c === 0x200f || c === 0x061c;

/** The class of one code point (a lone surrogate counts as a control), or null when it shows as written. */
function classOf(c: number): HiddenClass | null {
  if (c < 0x80) return (c < 0x20 && c !== 0x09 && c !== 0x0a) || c === 0x7f ? 'control character' : null;
  if (c <= 0x9f) return 'control character';
  if (c >= 0xd800 && c <= 0xdfff) return 'control character';
  if (isBidi(c)) return 'bidi control character';
  if ((c >= 0x200b && c <= 0x200d) || c === 0x2060 || c === 0xfeff) return 'zero-width character';
  if (c === 0xad) return 'soft hyphen';
  return null;
}

/** The class of the first code point in `s` a screen would not show as written, or null when it has none. */
export function findHidden(s: string): HiddenClass | null {
  for (const ch of s) {
    const k = classOf(ch.codePointAt(0)!);
    if (k) return k;
  }
  return null;
}

/** `s` without its hidden code points (the classes above); everything else, tab and newline included, is kept. The hook editor starts
 *  a name or description from this, so a save writes clean text and no field holds a character the person cannot see.
 *  The list keeps showing the hook's own text marked. */
export function stripHidden(s: string): string {
  if (!findHidden(s)) return s;
  let out = '';
  for (const ch of s) if (!classOf(ch.codePointAt(0)!)) out += ch;
  return out;
}

/**
 * Whether `s` holds a code point that turns the direction of the text around it: an embedding, override or isolate (U+202A-U+202E,
 * U+2066-U+2069), what makes text read in another order than it runs. A name or description the person types or pastes with one is
 * refused on save, never stripped; a saved one never reaches the field (draftOf strips it). The
 * marks (U+200E, U+200F, U+061C) only set the direction of what they touch, as ZWJ and ZWNJ join or part letters: typed, those are
 * shown marked and kept.
 */
export function turnsDirection(s: string): boolean {
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if ((c >= 0x202a && c <= 0x202e) || (c >= 0x2066 && c <= 0x2069)) return true;
  }
  return false;
}

const hex = (c: number): string => `U+${c.toString(16).toUpperCase().padStart(4, '0')}`;

/** `s` with every hidden code point replaced by a visible mark (a named control by its name, any other by its number), each
 *  between ⟨ and ⟩. Everything else, tab and newline included, is kept. */
export function markHidden(s: string): string {
  if (!findHidden(s)) return s;
  let out = '';
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (!classOf(c)) { out += ch; continue; }
    out += OPEN + (c < 0x80 && NAMES[c] !== undefined ? NAMES[c] : hex(c)) + CLOSE;
  }
  return out;
}
