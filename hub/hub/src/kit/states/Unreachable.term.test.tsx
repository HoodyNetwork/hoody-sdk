// UnreachableState in the terminal (Unreachable.term.tsx). Each case fails on the compat drawing of Unreachable.tsx
// (class styles installed, so the comparison is the real one): its compact line stayed on one row and cut its controls
// ("Try…  Det…" in a 46-cell pane; with a long name no Try again at all), and md drew Details under the card.
import { afterAll, beforeAll, expect, test } from 'bun:test';
import type { ReactNode } from 'react';
import { drawTest } from '../../term/prim/testing';
import { Box, FocusRoot } from '../../term/prim';
import { OverlayHost } from '../../term/prim/Overlay';
import { getByRole, semanticsOf } from '../../term/prim/semantics';
import { setStyleTable } from '../../term/jsx/style';
import { installStyleTable } from '../../../scripts/term/style-table';
import { UnreachableState } from './Unreachable';

beforeAll(() => installStyleTable(120));
afterAll(() => setStyleTable(null));

const NOW = Date.UTC(2026, 10, 11, 9, 0, 0);

async function draw(node: ReactNode, width: number, height = 12) {
  const t = await drawTest(<FocusRoot><OverlayHost><Box width={width}>{node}</Box></OverlayHost></FocusRoot>, { width, height });
  const frame = await t.settle();
  return { t, rows: frame.split('\n').map((r) => r.trimEnd()).filter((r) => r !== '') };
}

test('compact in a narrow pane: the controls move to the next row whole, never cut', async () => {
  const { t, rows } = await draw(<UnreachableState computer="atlas" size="compact" now={NOW} onRetry={() => {}} error={{ status: 0 }} />, 46);
  expect(rows).toEqual(["! atlas isn't reachable right now", 'Try again  Details']);
  t.renderer.destroy();
});

test('compact with a long name: the title wraps and Try again is still there', async () => {
  const { t, rows } = await draw(<UnreachableState computer="a-computer-with-a-very-long-name-that-goes-on" size="compact" now={NOW} onRetry={() => {}} />, 46);
  expect(rows.join('\n')).not.toContain('…');
  expect(rows[rows.length - 1]).toBe('Try again');
  expect(rows.slice(0, -1).join(' ').replace(/\s+/g, ' ')).toContain("isn't reachable right now");
  t.renderer.destroy();
});

test('compact with room: one line, the title then its controls', async () => {
  const { t, rows } = await draw(<UnreachableState computer="atlas" size="compact" now={NOW} onRetry={() => {}} error={{ status: 0 }} />, 80);
  expect(rows).toEqual(["! atlas isn't reachable right now  Try again  Details"]);
  expect(getByRole(semanticsOf(t.renderer as never), 'status')).toBeTruthy();
  t.renderer.destroy();
});

test('md: Details sits in the card, in the one action row', async () => {
  const { t, rows } = await draw(<UnreachableState computer="atlas" lastSeen={NOW - 180_000} now={NOW} onRetry={() => {}} error={{ status: 0 }} secondary="Open Computers" />, 50);
  const actions = rows.find((r) => r.includes('Try again'))!;
  expect(actions).toMatch(/^│ \[↻ Try again\]  Open Computers  Details +│$/);
  expect(rows[rows.length - 1]).toMatch(/^└─+┘$/);
  t.renderer.destroy();
});
