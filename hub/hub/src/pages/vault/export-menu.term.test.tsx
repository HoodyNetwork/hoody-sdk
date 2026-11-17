// Vault, More vault actions. Export read every value, built the file, then saved it with
// a download link (exportVault.ts saveExport: document.createElement): TERM_GLOBAL after "Save readable file", the
// dialog back at its first step with nothing saved and nothing said. A terminal has no download, so the menu leaves
// Export out there; Import and Clear stay.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { focusedNode, semanticsOf } from '../../term/prim/semantics';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const focused = (p: PageSession): string => {
  const r = p.renderer as unknown as { root: never; stdin: never };
  return focusedNode(semanticsOf({ root: r.root, stdin: r.stdin }))?.name ?? '';
};

test('the vault menu offers no Export in a terminal, and opening it traps nothing', async () => {
  s = await renderPage({ page: 'vault', cols: 120, rows: 40 });
  await s.settle();
  for (let i = 0; i < 160 && focused(s) !== 'More vault actions'; i++) await s.keys.press('tab');
  expect(focused(s)).toBe('More vault actions');
  await s.keys.press('enter');
  const frame = await s.settle();
  expect(frame).toContain('Import entries…');
  expect(frame).toContain('Clear vault…');
  expect(frame).not.toContain('Export vault…');
  expect(s.trapsAt).toEqual([]);
  expect(s.failures).toEqual([]);
}, 240_000);
