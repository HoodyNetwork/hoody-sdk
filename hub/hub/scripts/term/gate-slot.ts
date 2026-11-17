// gate-slot.ts: the machine's vitest slots (flock on `<base>.<0-5>.lock`). The base is HUB_GATE_SLOTS, else the one
// line of the host file ~/.config/hoody-hub-term/gate-slots (netns.sh reads the same file before its chroot and exports
// HUB_GATE_SLOTS inside); neither = no slots, no lock. No built-in default. A process that holds a slot says so with
// HUB_GATE_SLOT_HELD=1 in its children's environment (scripts/term/gate-slot.sh sets it; check.ts sets it on the vitest it
// starts), and a runner that sees it takes no second slot: before, a gate run inside a held slot waited 300 s for a slot in
// one run of six, then failed.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const SLOT_HELD = 'HUB_GATE_SLOT_HELD';
export const SLOTS_FILE = path.join('.config', 'hoody-hub-term', 'gate-slots');
type Env = Record<string, string | undefined>;
/** One check for both sources, the same as netns.sh: the value exactly as given (nothing trimmed), an absolute path of
 *  [A-Za-z0-9_./@+,=~-], at most 1024 characters, no "..". */
export const validSlotBase = (v: string): boolean => /^\/[A-Za-z0-9_./@+,=~-]*$/.test(v) && v.length <= 1024 && !v.includes('..');

/** The slot base in use, or undefined (no slots): HUB_GATE_SLOTS, else the host file's first line. A value that fails
 *  validSlotBase throws (netns.sh refuses the same value: TERM_NETNS_GATE_SLOTS_INVALID). */
export function slotBase(env: Env = process.env, readHostFile: () => string | undefined = () => {
  try { return fs.readFileSync(path.join(os.homedir(), SLOTS_FILE), 'utf8'); } catch { return undefined; }
}): string | undefined {
  let v = env.HUB_GATE_SLOTS;
  let from = 'HUB_GATE_SLOTS';
  if (!v) {
    const text = readHostFile();
    if (text === undefined) return undefined;
    v = text.split('\n')[0] ?? '';
    from = `~/${SLOTS_FILE}`;
  }
  if (!validSlotBase(v)) throw new Error(`gate-slot: refused: invalid slot base in ${from}`);
  return v;
}
export const slotHeld = (env: Env = process.env): boolean => env[SLOT_HELD] === '1';
/** The one line naming the slot base in use. */
export const slotLine = (base: string | undefined): string => (base ? `gate-slot: slots ${base}.<0-5>.lock` : 'gate-slot: no slots');

/** `cmd` run inside a gate slot: as is when the caller holds one (or there are no slots / no slot directory), else under flock. */
export function inGateSlot(cmd: readonly string[], env: Env = process.env, pick: () => number = () => Math.floor(Math.random() * 6), exists: (p: string) => boolean = fs.existsSync, base: string | undefined = slotBase(env), say: (line: string) => void = (l) => console.error(l)): string[] {
  if (slotHeld(env)) return [...cmd];
  if (!base || !exists(path.dirname(base))) { say(slotLine(undefined)); return [...cmd]; }
  say(slotLine(base));
  return ['flock', '-w', '300', `${base}.${pick()}.lock`, ...cmd];
}
/** The child's environment: the slot is held from here down. */
export const slotEnv = <T extends Record<string, string | undefined>>(env: T): T & { HUB_GATE_SLOT_HELD: '1' } => ({ ...env, [SLOT_HELD]: '1' }) as T & { HUB_GATE_SLOT_HELD: '1' };
