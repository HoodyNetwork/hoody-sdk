// The Guide said "Open Agent [Ctrl J]" in the terminal, where the Agent dock opens on Alt+J (Ctrl+J
// is Enter's byte there). The key text now comes from the shortcut list the `?` sheet draws, so both always agree.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

test('Guide: "Open Agent" names the terminal key, never Ctrl J', async () => {
  s = await renderPage({ page: 'guide', cols: 140, rows: 400 });
  const frame = await s.settle();
  expect(frame).toContain('Open Agent');
  // Two shapes of the section draw the key: the button's own key cap, or (the newer Section shape) the note under it.
  expect(frame).toMatch(/Open Agent \[Alt\+J\]|Alt\+J opens or closes the Agent panel/);
  expect(frame).not.toContain('Ctrl J');
  expect(frame).not.toContain('Ctrl+J');
}, 180_000);
