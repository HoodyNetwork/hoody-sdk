// renderPage's keys.press sends KEYS, never a key's name as text. The engine's mock keyboard types any name it does not
// know letter by letter: press('pageup') typed "pageup" (the bots runtimeRow test never scrolled, and its "g" and "e"
// ran shell shortcuts), press('backspace') and press('return') typed those words.
import { afterEach, expect, test } from 'bun:test';
import { mockKeyOf, renderPage, type PageSession } from './render';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

test('mockKeyOf: a character, a raw sequence and an engine name pass; a known name is translated; another word is refused', () => {
  expect(mockKeyOf('j')).toBe('j');
  expect(mockKeyOf(' ')).toBe(' ');
  expect(mockKeyOf('\x1b[5~')).toBe('\x1b[5~');
  expect(mockKeyOf('HOME')).toBe('HOME');
  expect(mockKeyOf('pageup')).toBe('\x1b[5~');
  expect(mockKeyOf('PageDown')).toBe('\x1b[6~');
  expect(mockKeyOf('backspace')).toBe('BACKSPACE');
  expect(mockKeyOf('return')).toBe('RETURN');
  expect(mockKeyOf('f6')).toBe('F6');
  expect(() => mockKeyOf('pgup')).toThrow(/TERM_KEY_UNKNOWN/);
});

test('keys.press of a named key writes that key\'s bytes to the input, not its name', async () => {
  s = await renderPage({ page: 'support', cols: 80, rows: 24 });
  const stdin = (s.renderer as unknown as { stdin: { on(e: 'data', f: (b: Uint8Array) => void): void } }).stdin;
  const got: string[] = [];
  stdin.on('data', (b) => { got.push(Buffer.from(b).toString('latin1')); });
  for (const name of ['pageup', 'pagedown', 'home', 'end', 'backspace', 'return', 'j']) await s.keys.press(name);
  expect(got).toEqual(['\x1b[5~', '\x1b[6~', '\x1b[H', '\x1b[F', '\b', '\r', 'j']);
  await expect(s.keys.press('pgup')).rejects.toThrow(/TERM_KEY_UNKNOWN/);
}, 120_000);
