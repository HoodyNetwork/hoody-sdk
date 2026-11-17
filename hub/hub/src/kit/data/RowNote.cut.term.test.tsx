// RowNote `cut` wraps whole in a terminal, also when the words sit in an inline wrapper (`<bdi>`: KeysSection's SSH key
// comment). A terminal has no hover, so it follows the web's `(hover: none)` rule (Display.module.css): a cut note
// wraps instead of ending in a "…" whose words no tooltip can show. Before
// it ended its one line with "…", and the comment could not be read anywhere.
import { expect, test } from 'bun:test';
import { drawTest } from '../../term/prim/testing';
import { Box, FocusRoot } from '../../term/prim';
import { RowNote } from './Display';

const LONG = 'ci-deploy@build-runner-07.acme.example (rotated weekly by the release pipeline)';

for (const [name, note] of [
  ['plain', <RowNote cut>{LONG}</RowNote>],
  ['bdi', <RowNote cut><bdi>{LONG}</bdi></RowNote>],
] as const) test(`a cut note in a narrow box wraps whole (${name})`, async () => {
  const t = await drawTest(<FocusRoot><Box dir="column" width={30} clip>{note}</Box></FocusRoot>, { width: 40, height: 6 });
  const f = await t.settle();
  t.renderer.destroy();
  const lines = f.split('\n').map((l) => l.trimEnd()).filter(Boolean);
  expect(lines.length).toBeGreaterThan(1);
  expect(f).not.toContain('…');
  // Every word shows (a long word breaks where the box ends: compare without the spaces).
  expect(lines.join('').replace(/\s+/g, '')).toBe(LONG.replace(/\s+/g, ''));
}, 30_000);
