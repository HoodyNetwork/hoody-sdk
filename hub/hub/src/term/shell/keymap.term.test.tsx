// The terminal keymap (keymap.ts) over the shared declarations (shell/shortcuts.pure.ts TABLE, shell/keys.pure.ts
// JUMPS, the usePageShortcuts store) and the engine-to-web key view (hubKey.ts).
//
// | # | Behaviour | Test |
// |---|---|---|
// | 1 | Mod K is Ctrl+K and opens the palette, also while typing | 'Mod K' |
// | 2 | ? / [ run the shell's single keys; never while typing | 'single shell keys' |
// | 3 | g then a letter jumps to the JUMPS page; the key after g is always taken; a slow second key is plain | 'g jumps' |
// | 4 | q quits outside a field; in a field it is the field's letter | 'q' |
// | 5 | Ctrl-C interrupts in every state, locked and typing included; Ctrl-Z suspends | 'Ctrl-C' |
// | 6 | Alt R / Alt C open the switchers | 'Alt chords' |
// | 7 | Page keys: single keys in bubble, chords in capture, whileTyping only while typing | 'page keys' |
// | 8 | Locked: no app key runs | 'locked' |
// | 9 | Esc cancels a realm switch | 'Esc cancels a switch' |
// | 10 | hubKey: letters, Shift, symbols with their US code, named keys, Alt from meta | 'hubKey' |
// | 11 | Every TABLE row is bound, unbound with a reason, or a component group's | 'TABLE coverage' |
// | 12 | g then a capital letter (Shift or Caps Lock) jumps as its lower case, as on the web (shell/keys.ts) | 'g then a capital' |
import { expect, test } from 'bun:test';
import type { PageManifest } from '@kit/page';
import { addPageShortcutList, type PageShortcut } from '../../shell/pageShortcuts.pure';
import { TABLE } from '../../shell/shortcuts.pure';
import { hubKey, type HubKey } from './hubKey';
import { COMMAND_OF, COMPONENT_GROUPS, createShellKeymap, SHELL_ROWS, UNBOUND, type ShellActions } from './keymap';
import type { Key } from '../prim';

const raw = (name: string, m: { ctrl?: boolean; shift?: boolean; meta?: boolean } = {}): Key =>
  ({ name, ctrl: !!m.ctrl, shift: !!m.shift, meta: !!m.meta, option: false, sequence: name, number: false, raw: name, eventType: 'press', source: 'raw' }) as unknown as Key;
const k = (name: string, m: { ctrl?: boolean; shift?: boolean; meta?: boolean } = {}): HubKey => hubKey(raw(name, m));

const PAGES = [
  { id: 'computers', path: '/computers' },
  { id: 'logs', path: '/logs' },
  { id: 'schedules', path: '/schedules' },
] as unknown as PageManifest[];

function setup(o: { locked?: boolean; switching?: boolean } = {}) {
  let t = 1000;
  const km = createShellKeymap({ now: () => t });
  const log: string[] = [];
  const a: ShellActions = {
    palette: () => log.push('palette'),
    search: () => { log.push('search'); return true; },
    help: () => log.push('help'),
    sidebar: () => log.push('sidebar'),
    realm: () => log.push('realm'),
    computer: () => log.push('computer'),
    go: (p) => log.push('go ' + p),
    quit: () => log.push('quit'),
    interrupt: () => log.push('interrupt'),
    suspend: () => log.push('suspend'),
    cancelSwitch: () => { if (!o.switching) return false; log.push('cancel'); return true; },
    pages: () => PAGES,
    locked: () => o.locked === true,
  };
  km.setActions(a);
  /** Both phases, as the app runs them (capture, then bubble when nothing took it). */
  const press = (key: HubKey, typing = false): boolean => km.capture(key, typing) || km.bubble(key, typing);
  return { km, log, press, tick: (ms: number) => { t += ms; } };
}

test('Mod K', () => {
  const s = setup();
  expect(s.press(k('k', { ctrl: true }))).toBe(true);
  expect(s.press(k('k', { ctrl: true }), true)).toBe(true);
  expect(s.log).toEqual(['palette', 'palette']);
});

test('single shell keys', () => {
  const s = setup();
  s.press(k('?', { shift: true }));
  s.press(k('/'));
  s.press(k('['));
  expect(s.log).toEqual(['help', 'search', 'sidebar']);
  s.log.length = 0;
  for (const n of ['?', '/', '[']) expect(s.press(k(n), true)).toBe(false);
  expect(s.log).toEqual([]);
});

test('g jumps', () => {
  const s = setup();
  expect(s.press(k('g'))).toBe(true);
  expect(s.km.pending()).toEqual(['g']);
  s.press(k('l'));
  expect(s.log).toEqual(['go /logs']);
  // A jump to a page this app does not serve still takes the key (b: Bots is not in PAGES).
  s.press(k('g'));
  expect(s.press(k('b'))).toBe(true);
  expect(s.log).toEqual(['go /logs']);
  // Too slow: the second key is a key of its own.
  s.press(k('g'));
  s.tick(1500);
  s.press(k('q'));
  expect(s.log).toEqual(['go /logs', 'quit']);
});

test('g then a capital', () => {
  const s = setup();
  // Shift+L: the engine names it l with Shift (hubKey prints L).
  s.press(k('g'));
  expect(s.press(k('l', { shift: true }))).toBe(true);
  // Caps Lock: a terminal sends the capital itself.
  s.press(k('g'));
  expect(s.press(k('S'))).toBe(true);
  expect(s.log).toEqual(['go /logs', 'go /schedules']);
  expect(s.km.pending()).toBeNull();
});

test('q', () => {
  const s = setup();
  s.press(k('q'));
  expect(s.log).toEqual(['quit']);
  expect(s.press(k('q'), true)).toBe(false);
  expect(s.log).toEqual(['quit']);
  // Shift-Q is not q.
  expect(s.press(k('q', { shift: true }))).toBe(false);
});

test('Ctrl-C', () => {
  const s = setup({ locked: true });
  expect(s.press(k('c', { ctrl: true }), true)).toBe(true);
  expect(s.press(k('z', { ctrl: true }))).toBe(true);
  expect(s.log).toEqual(['interrupt', 'suspend']);
});

test('Alt chords', () => {
  const s = setup();
  s.press(k('r', { meta: true }));
  s.press(k('c', { meta: true }));
  expect(s.log).toEqual(['realm', 'computer']);
});

test('page keys', () => {
  const s = setup();
  const ran: string[] = [];
  const list: { current: PageShortcut[] } = { current: [
    { key: 'n', label: 'New', run: () => ran.push('n') },
    { key: 'KeyB', mods: ['ctrl', 'alt'], whileTyping: true, label: 'Board', run: () => ran.push('ctrl-alt-b') },
    { key: 'KeyE', mods: ['alt'], label: 'Edit', run: () => ran.push('alt-e') },
  ] };
  const off = addPageShortcutList(list);
  try {
    s.press(k('n'));
    expect(s.press(k('n'), true)).toBe(false);
    const ctrlAltB = { ...k('b', { ctrl: true, meta: true }) };
    s.press(ctrlAltB, true);
    s.press(k('e', { meta: true }));
    expect(s.press(k('e', { meta: true }), true)).toBe(false);
    expect(ran).toEqual(['n', 'ctrl-alt-b', 'alt-e']);
  } finally {
    off();
  }
});

test('locked', () => {
  const s = setup({ locked: true });
  for (const key of [k('k', { ctrl: true }), k('?'), k('q'), k('g'), k('r', { meta: true })]) expect(s.press(key)).toBe(false);
  expect(s.log).toEqual([]);
});

test('Esc cancels a switch', () => {
  expect(setup().press(k('escape'))).toBe(false);
  const s = setup({ switching: true });
  expect(s.press(k('escape'))).toBe(true);
  expect(s.log).toEqual(['cancel']);
});

test('hubKey', () => {
  expect(k('a')).toMatchObject({ key: 'a', code: 'KeyA', shiftKey: false });
  expect(k('a', { shift: true })).toMatchObject({ key: 'A', code: 'KeyA', shiftKey: true });
  expect(k('k', { ctrl: true })).toMatchObject({ key: 'k', code: 'KeyK', ctrlKey: true });
  expect(k('?')).toMatchObject({ key: '?', code: 'Slash', shiftKey: true });
  expect(k('[')).toMatchObject({ key: '[', code: 'BracketLeft', shiftKey: false });
  expect(k('return')).toMatchObject({ key: 'Enter', code: 'Enter' });
  expect(k('escape')).toMatchObject({ key: 'Escape' });
  expect(k('space')).toMatchObject({ key: ' ', code: 'Space' });
  expect(k('pagedown')).toMatchObject({ key: 'PageDown' });
  expect(k('r', { meta: true })).toMatchObject({ key: 'r', altKey: true, metaKey: false });
  expect(k('5')).toMatchObject({ key: '5', code: 'Digit5' });
});

test('TABLE coverage', () => {
  for (const g of TABLE) {
    for (const r of g.rows) {
      const bound = SHELL_ROWS.some((x) => x.msg === r.msg);
      const known = bound || r.msg in UNBOUND || COMPONENT_GROUPS.includes(g.id);
      expect(`${g.id} ${r.msg} ${known}`).toBe(`${g.id} ${r.msg} true`);
      if (r.msg in COMMAND_OF) expect(bound).toBe(true);
    }
  }
});
