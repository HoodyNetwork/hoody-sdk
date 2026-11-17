// A list with a class shows the marker its CSS asks for. Guide's `ol.steps { list-style: decimal }` drew its steps with
// no 1. 2. 3.: the translator dropped every list-style, and a list with a class never got a marker. A classed list with
// no list-style (base.css resets lists to none) still has none, and a list with no class keeps its tag's marker.
import { afterAll, beforeAll, expect, test } from 'bun:test';
import type { ReactNode } from 'react';
import { drawTest } from '../prim/testing';
import { Box } from '../prim';
import { setStyleTable } from '../jsx/style';
import { installStyleTable } from '../../../scripts/term/style-table';
import guide from '../../pages/guide/parts/guide.module.css';
import dialog from '../../kit/overlays/Dialog.module.css';

beforeAll(() => { installStyleTable(80); }, 60_000);
afterAll(() => setStyleTable(null));

async function rowsOf(node: ReactNode): Promise<string[]> {
  const t = await drawTest(<Box dir="column" width={60}>{node}</Box>, { width: 60, height: 12 });
  const rows = (await t.settle()).split('\n').map((r) => r.trim()).filter(Boolean);
  t.renderer.destroy();
  return rows;
}

test('Guide steps (ol.steps, list-style: decimal) are numbered', async () => {
  expect(guide.steps).toBeTruthy();
  const rows = await rowsOf(<ol className={guide.steps}><li>Install the skill</li><li>Ask your agent</li><li>Check the result</li></ol>);
  expect(rows).toEqual(['1. Install the skill', '2. Ask your agent', '3. Check the result']);
}, 30_000);

test('a classed list whose CSS asks for no marker has none; an unclassed list keeps its tag marker', async () => {
  expect(await rowsOf(<ol className="no-such-class"><li>One</li><li>Two</li></ol>)).toEqual(['One', 'Two']);
  expect(await rowsOf(<ol><li>One</li><li>Two</li></ol>)).toEqual(['1. One', '2. Two']);
  expect(await rowsOf(<ul><li>One</li></ul>)).toEqual(['• One']);
}, 30_000);

test('list-style: disc on a classed list draws a bullet', async () => {
  const cls = dialog.consequences;
  expect(cls).toBeTruthy();
  const rows = await rowsOf(<ul className={cls}><li>One</li></ul>);
  expect(rows[0]).toBe('• One');
}, 30_000);
