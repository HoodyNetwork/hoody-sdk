// Kbd.term: the web component's observable behaviours, each held here.
// - Kbd: one key as a chip, [j]
// - Shortcut: one chip per combination, keys joined by '+' and named for a PC keyboard: 'Mod+K' → [Ctrl+K]; alternatives
//   side by side ([j] [k]); a lone '+' key is written 'Plus'
// - shortcutKeys / formatShortcut: the platform names (Mod is Ctrl in a terminal; the Apple table still answers when
//   asked for it); isApplePlatform is false here
// - ariaKeyshortcuts: the WAI-ARIA spelling, unchanged from the web
import { expect, test } from 'bun:test';
import { drawTest } from '../../term/prim/testing';
import { Box } from '../../term/prim';
import { Kbd, Shortcut, ariaKeyshortcuts, formatShortcut, isApplePlatform, shortcutKeys } from './Kbd';

test('Kbd and Shortcut draw', async () => {
  const t = await drawTest(
    <Box dir="column">
      <Kbd>j</Kbd>
      <Shortcut keys="Mod+K" />
      <Shortcut keys={['j', 'k']} />
      <Shortcut keys="Alt+Shift+Enter" />
    </Box>,
    { width: 40, height: 5 },
  );
  const f = t.captureCharFrame();
  expect(f).toContain('[j]');
  expect(f).toContain('[Ctrl+K]');
  expect(f).toContain('[j] [k]');
  expect(f).toContain('[Alt+Shift+Enter]');
  t.renderer.destroy();
});

test('names and spellings', () => {
  expect(isApplePlatform()).toBe(false);
  expect(shortcutKeys('Mod+K')).toEqual(['Ctrl', 'K']);
  expect(shortcutKeys('ctrl+plus')).toEqual(['Ctrl', '+']);
  expect(shortcutKeys('Mod+K', true)).toEqual(['⌘', 'K']);
  expect(formatShortcut('Mod+Esc')).toBe('Ctrl+Esc');
  expect(formatShortcut('Mod+K', true)).toBe('⌘K');
  expect(ariaKeyshortcuts('Mod+J')).toBe('Control+J');
  expect(ariaKeyshortcuts(['Mod+J', 'Esc'], true)).toBe('Meta+J Escape');
});
