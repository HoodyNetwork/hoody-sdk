// The terminal Hub's one keymap. It binds the SAME declarations the web binds:
// - the shell's global keys: TABLE (shell/shortcuts.pure.ts) and the jumps (shell/keys.pure.ts), parsed here from
//   their key strings ('Mod K', 'Alt R', '?', ['g', 'h']); a row's action comes from its `msg`;
// - every page's keys: the usePageShortcuts store and its one matching rule (shell/pageShortcuts.pure.ts).
// The order is the web's (shell/keys.ts), in two phases because a terminal has no DOM event path:
//   capture (before the focused control, keymap.capture): Ctrl-C and Ctrl-Z (the terminal's own), the lock, Mod
//     chords (Mod K), a text field (then only a page chord marked whileTyping), Alt chords (Alt R / Alt C), other page
//     chords;
//   bubble (after the focused control declined the key, keymap.bubble): Esc cancelling a realm switch, the `g` jump,
//     the single shell keys (/ ? [), `q` (terminal: quit), then the page's single keys. A focused text field takes
//     every printable key, so none of these runs while typing (q types a q in a search field), as on the web.
// An open overlay (prim/Overlay.ts Layer) has every key before this keymap sees any.
// `Mod` is Ctrl. Terminal conflicts and their fallbacks are listed in TERMINAL_KEYS (shown by the `?` sheet).
import type { PageManifest } from '@kit/page';
import { JUMP_MS, JUMPS } from '../../shell/keys.pure';
import { findPageShortcut, type KeyLike } from '../../shell/pageShortcuts.pure';
import { TABLE, type Label } from '../../shell/shortcuts.pure';
import type { HubKey } from './hubKey';
import type termStrings from './strings.en.json';

/** What a shell row does. */
export type ShellCommand = 'palette' | 'search' | 'help' | 'sidebar' | 'ask' | 'realm' | 'computer';

/** TABLE rows the terminal binds, by their `msg`. A row missing here (and not a jump) is not bound in the terminal. */
export const COMMAND_OF: Readonly<Partial<Record<Label, ShellCommand>>> = {
  'keys.palette': 'palette',
  'keys.search': 'search',
  'keys.help': 'help',
  'keys.sidebar': 'sidebar',
  'keys.realm': 'realm',
  'keys.computer': 'computer',
  'keys.ask': 'ask',
};
/** A TABLE row whose chord a terminal cannot take as the web does, and the one it binds instead. Mod J (Ctrl+J) is a
 *  line feed in a terminal (the composer's new line), so Agent is Alt+J (ESC j: every xterm-class terminal sends it). */
export const TERM_CHORDS: Readonly<Partial<Record<Label, readonly string[]>>> = {
  'keys.ask': ['Alt J'],
};
/** The Ask dock's chord as the `?` sheet and the palette write it. */
export const ASK_CHORD = 'Alt+J';
/** TABLE rows the terminal does not bind, and why (the `?` sheet leaves them out). */
export const UNBOUND: Readonly<Partial<Record<Label, string>>> = {};
/** TABLE rows a component binds itself (lists and tables), not the shell keymap. */
export const COMPONENT_GROUPS: readonly string[] = ['lists'];

export interface ShellActions {
  palette(): void;
  /** Focus the shown page's search field; false when it has none. */
  search(): boolean;
  help(): void;
  sidebar(): void;
  ask?(): void;
  realm(): void;
  computer(): void;
  go(path: string): void;
  /** `q`: leave the Hub (asks first when work runs or something is unsaved). */
  quit(): void;
  /** Ctrl-C: the first asks like `q`, a second one within INTERRUPT_MS leaves without asking. */
  interrupt(): void;
  /** Ctrl-Z: suspend to the shell, where the host can. */
  suspend?(): void;
  /** While a realm switch runs: Esc cancels it. True when it cancelled one. */
  cancelSwitch?(): boolean;
  pages(): readonly PageManifest[];
  /** The lock screen is up: no app key runs. */
  locked(): boolean;
}

/** A parsed key of a TABLE string ('Mod K' → ctrl + KeyK). */
interface Chord { ctrl: boolean; alt: boolean; shift: boolean; key: string; code: string }

/** Parses one TABLE key string. 'Mod' is Ctrl in a terminal. */
export function parseChord(s: string): Chord {
  const parts = s.split(' ');
  const last = parts[parts.length - 1] ?? '';
  const mods = new Set(parts.slice(0, -1));
  const code = /^[A-Za-z]$/.test(last) ? `Key${last.toUpperCase()}` : '';
  return { ctrl: mods.has('Mod') || mods.has('Ctrl'), alt: mods.has('Alt'), shift: mods.has('Shift'), key: last, code };
}

function chordMatches(c: Chord, k: KeyLike): boolean {
  if (c.ctrl || c.alt) {
    // A chord is matched by code (layout-free), modifiers exact (Shift ignored on Ctrl: terminals drop it).
    const code = c.code || '';
    return k.ctrlKey === c.ctrl && k.altKey === c.alt && !k.metaKey && (code ? k.code === code : k.key === c.key) && (c.ctrl || k.shiftKey === c.shift);
  }
  // A single printed key: by what it prints, no Ctrl/Alt.
  return !k.ctrlKey && !k.altKey && !k.metaKey && k.key === c.key;
}

interface Row { msg: Label; group: string; keys: readonly Chord[]; command?: ShellCommand; jump?: string }

/** The shell rows the terminal binds, parsed once. */
export const SHELL_ROWS: readonly Row[] = TABLE.flatMap((g) =>
  g.rows.flatMap((r): Row[] => {
    if (COMPONENT_GROUPS.includes(g.id)) return [];
    const keys = (TERM_CHORDS[r.msg] ?? r.keys).map(parseChord);
    const jump = keys.length === 2 ? JUMPS[r.keys[1] ?? ''] : undefined;
    const command = COMMAND_OF[r.msg];
    if (!command && !jump) return [];
    return [{ msg: r.msg, group: g.id, keys, ...(command ? { command } : {}), ...(jump ? { jump } : {}) }];
  }),
);

/** The terminal's own keys and limits, listed after the shared groups by the `?` sheet (shortcuts.term.ts). A row's
 *  word is one of the table's `keys.*` entries (the table also holds plural pairs, which are not a key by themselves). */
export const TERMINAL_ROWS: readonly { keys: readonly string[]; msg: Extract<keyof typeof termStrings, `keys.${string}`> }[] = [
  { keys: ['q'], msg: 'keys.quit' },
  { keys: ['Ctrl C'], msg: 'keys.interrupt' },
  { keys: ['Ctrl Z'], msg: 'keys.suspend' },
  { keys: ['Tab', 'Shift Tab'], msg: 'keys.focus' },
  { keys: ['F6', 'Shift F6'], msg: 'keys.region' },
  { keys: ['Ctrl M', 'Ctrl I', 'Ctrl ['], msg: 'keys.conflict.ctrlM' },
  { keys: ['Ctrl S', 'Ctrl Q'], msg: 'keys.conflict.flow' },
];

/** Two Ctrl-C within this long leave without asking. */
export const INTERRUPT_MS = 2000;

/** A transient line for the status bar: a pending `g`, "Ctrl-C again to quit", a hint. */
export interface StatusNote { text: string; until: number }

export interface ShellKeymap {
  setActions(a: ShellActions): () => void;
  /** Before the focused control. `typing`: a text field has the keyboard. True: the key was taken. */
  capture(k: HubKey, typing: boolean): boolean;
  /** After the focused control declined it. */
  bubble(k: HubKey, typing: boolean): boolean;
  /** Moves on every poke (a status line keyed on it re-reads the focus). */
  version(): number;
  /** The first key of a sequence waiting for its second (['g']), else null. */
  pending(): readonly string[] | null;
  /** Shows a transient note in the status line. */
  note(text: string, ms?: number): void;
  status(): StatusNote | null;
  subscribe(l: () => void): () => void;
  /** Tells subscribers that something they read besides the keymap may have moved (the focus, after a key). */
  poke(): void;
}

export function createShellKeymap(o: { now?: () => number } = {}): ShellKeymap {
  const now = o.now ?? Date.now;
  let actions: ShellActions | null = null;
  const listeners = new Set<() => void>();
  let prefix: { key: string; at: number } | null = null;
  let note: StatusNote | null = null;
  let version = 0;
  let noteTimer: ReturnType<typeof setTimeout> | null = null;
  let prefixTimer: ReturnType<typeof setTimeout> | null = null;
  const emit = () => { for (const l of listeners) l(); };
  const setPrefix = (p: typeof prefix) => {
    if (p === prefix) return;
    prefix = p;
    if (prefixTimer) { clearTimeout(prefixTimer); prefixTimer = null; }
    // The status line shows a waiting prefix; it goes when the jump's time is up.
    if (p) { prefixTimer = setTimeout(() => { prefixTimer = null; if (prefix === p) { prefix = null; emit(); } }, JUMP_MS); (prefixTimer as { unref?: () => void }).unref?.(); }
    emit();
  };
  const say = (text: string, ms = 2500) => {
    note = { text, until: now() + ms };
    if (noteTimer) clearTimeout(noteTimer);
    noteTimer = setTimeout(() => { note = null; noteTimer = null; emit(); }, ms);
    (noteTimer as { unref?: () => void }).unref?.();
    emit();
  };

  const run = (a: ShellActions, c: ShellCommand): boolean => {
    switch (c) {
      case 'palette': a.palette(); return true;
      case 'search': a.search(); return true;
      case 'help': a.help(); return true;
      case 'sidebar': a.sidebar(); return true;
      case 'ask': a.ask?.(); return true;
      case 'realm': a.realm(); return true;
      case 'computer': a.computer(); return true;
    }
  };
  const pageChord = (k: HubKey, typing: boolean): boolean => {
    const hit = findPageShortcut(k, { typing, frame: false, controlKeeps: false });
    if (!hit) return false;
    hit.run();
    return true;
  };
  const rowsWith = (pred: (c: Chord) => boolean) => SHELL_ROWS.filter((r) => r.keys.length === 1 && r.command && pred(r.keys[0]!));
  const modRows = rowsWith((c) => c.ctrl);
  const altRows = rowsWith((c) => c.alt && !c.ctrl);
  const plainRows = rowsWith((c) => !c.ctrl && !c.alt);
  const seqRows = SHELL_ROWS.filter((r) => r.keys.length === 2);
  const prefixes = new Set(seqRows.map((r) => r.keys[0]!.key));

  const km: ShellKeymap = {
    setActions(a) {
      actions = a;
      return () => { if (actions === a) actions = null; };
    },
    capture(k, typing) {
      const a = actions;
      if (!a) return false;
      // The terminal's own: Ctrl-C (quit, twice = without asking) and Ctrl-Z (suspend), in every state.
      if (k.ctrlKey && !k.altKey && k.name === 'c') { a.interrupt(); return true; }
      if (k.ctrlKey && !k.altKey && k.name === 'z' && a.suspend) { a.suspend(); return true; }
      // Locked: no app key runs, Mod K included; the lock screen's own keys stay.
      if (a.locked()) return false;
      const mod = k.ctrlKey || k.metaKey;
      for (const r of modRows) if (chordMatches(r.keys[0]!, k)) { setPrefix(null); return run(a, r.command!); }
      if (typing) { setPrefix(null); return pageChord(k, true); }
      if (k.altKey && !mod) for (const r of altRows) if (chordMatches(r.keys[0]!, k)) { setPrefix(null); return run(a, r.command!); }
      if (mod || k.altKey) { setPrefix(null); return pageChord(k, false); }
      return false;
    },
    bubble(k, typing) {
      const a = actions;
      if (!a || a.locked() || typing) return false;
      if (k.ctrlKey || k.altKey || k.metaKey) return false;
      if (k.key === 'Escape' && !k.shiftKey && a.cancelSwitch?.()) { setPrefix(null); return true; }
      if (prefix && now() - prefix.at < JUMP_MS) {
        const first = prefix.key;
        setPrefix(null);
        // The key after the prefix is always the jump's, even when it names no page. A letter counts in lower case
        // (Shift or Caps Lock held), as on the web.
        const second = k.key.length === 1 ? { ...k, key: k.key.toLowerCase() } : k;
        const row = seqRows.find((r) => r.keys[0]!.key === first && chordMatches(r.keys[1]!, second));
        const page = row?.jump ? a.pages().find((p) => p.id === row.jump) : undefined;
        if (page) a.go(page.path);
        return true;
      }
      setPrefix(null);
      if (prefixes.has(k.key) && !k.shiftKey) { setPrefix({ key: k.key, at: now() }); return true; }
      for (const r of plainRows) if (chordMatches(r.keys[0]!, k)) return run(a, r.command!);
      if (k.key === 'q') { a.quit(); return true; }
      return pageChord(k, false);
    },
    version: () => version,
    pending: () => (prefix && now() - prefix.at < JUMP_MS ? [prefix.key] : null),
    note: say,
    status: () => (note && note.until > now() ? note : null),
    subscribe(l) { listeners.add(l); return () => listeners.delete(l); },
    poke: () => { version++; emit(); },
  };
  return km;
}
