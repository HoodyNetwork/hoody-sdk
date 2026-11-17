// Pure reading of the instructions answers (read and write). Strict: a field missing or of the wrong type is a failed
// read (null), never blank instructions (C9). Text and on/off are always read, and written, together.
// The agent's answer is {text, enabled, revision} for GET and for a PUT's 200; the realm is the one the
// call named (the view is keyed by computer and realm), and which fields the realm's settings.local.json sets is told only by a
// PUT's 409 instructions_overridden (details.fields).

export interface Instructions {
  text: string;
  enabled: boolean;
  /** What a change names as expected_revision. */
  revision: string;
}

/** The text and on/off a change sends: always both (the agent requires both, and a shallow merge would lose one). */
export interface InstructionsDraft { text: string; enabled: boolean }

const rec = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const rev = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 256;

/** A GET answer, or a PUT's 200 (the instructions after the write); null when it is not that shape. */
export function instructionsOf(raw: unknown): Instructions | null {
  const o = rec(raw);
  if (!o) return null;
  const { text, enabled, revision } = o;
  if (typeof text !== 'string' || typeof enabled !== 'boolean' || !rev(revision)) return null;
  return { text, enabled, revision };
}

/** The draft holds exactly what `i` holds (text byte for byte, and the switch). */
export const sameAs = (i: InstructionsDraft, d: InstructionsDraft): boolean => i.text === d.text && i.enabled === d.enabled;

/** The fields a 409 instructions_overridden names (details.fields ⊆ text, enabled); null when they cannot be read. */
export function overriddenFields(details: unknown): ('text' | 'enabled')[] | null {
  const f = rec(details)?.fields;
  if (!Array.isArray(f) || f.length === 0 || f.length > 2) return null;
  const out: ('text' | 'enabled')[] = [];
  for (const x of f) {
    if ((x !== 'text' && x !== 'enabled') || out.includes(x)) return null;
    out.push(x);
  }
  return out;
}

/** What agents get: nothing when off or when the text is blank (the agent adds no block then). */
export type Effect = 'given' | 'off' | 'blank';
export function effectOf(i: InstructionsDraft): Effect {
  if (i.text.trim() === '') return 'blank';
  return i.enabled ? 'given' : 'off';
}

/** An agent without the route answers the bare 404 of an unknown path: no error code. Any coded answer is a real refusal. */
export function routeMissing(e: unknown): boolean {
  const x = rec(e);
  return !!x && x.status === 404 && (x.code === null || x.code === undefined || x.code === '');
}
