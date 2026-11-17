// MarkdownViewer in the terminal. The compat drawing let the region fill its pane: a short document
// left a blank column of rule under it, a long one pushed what follows the viewer off the screen, `height` capped
// nothing, and the head offered a Download that reads `document`. Each case here fails on it.
import { afterAll, beforeAll, expect, test } from 'bun:test';
import type { ReactNode } from 'react';
import { drawTest } from '../../term/prim/testing';
import { Box, FocusRoot, Text } from '../../term/prim';
import { OverlayHost } from '../../term/prim/Overlay';
import { focusedNode, semanticsOf } from '../../term/prim/semantics';
import { setStyleTable } from '../../term/jsx/style';
import { installStyleTable } from '../../../scripts/term/style-table';
import { MarkdownViewer } from './MarkdownViewer';

// The class styles a page has, so the same test judges the compat drawing fairly when the sibling is taken away.
beforeAll(() => installStyleTable(120));
afterAll(() => setStyleTable(null));

const SHORT = '# Deploy skill\n\nUse this skill to deploy a service.\n\n1. Build the image\n2. Push it\n';
const LONG = SHORT + Array.from({ length: 40 }, (_, i) => `Paragraph ${i + 1} of the long document.\n`).join('\n');

async function draw(node: ReactNode, width: number, height: number) {
  const t = await drawTest(<FocusRoot><OverlayHost><Box dir="column" width={width} height={height}>{node}</Box></OverlayHost></FocusRoot>, { width, height });
  const rows = async () => (await t.settle()).split('\n').map((r) => r.trimEnd());
  return { t, rows };
}
const regionRows = (rows: string[]) => rows.filter((r) => r.startsWith('│')).length;

test('a short document: the region is as tall as the document, and what follows sits right under it', async () => {
  const { t, rows } = await draw(<><MarkdownViewer label="SKILL.md" source={SHORT} /><Text>After the viewer</Text></>, 80, 24);
  const f = await rows();
  expect(f[0]!.startsWith('SKILL.md')).toBe(true);
  expect(f[0]).toContain('Rendered');
  const last = f.findIndex((r) => r.includes('2. Push it'));
  expect(last).toBeGreaterThan(0);
  expect(f[last + 1]).toBe('After the viewer');
  expect(regionRows(f)).toBe(last); // every row from the head's next to the document's last, no blank rule rows
  t.renderer.destroy();
}, 30_000);

test('a long document scrolls inside its region; what follows the viewer stays on screen', async () => {
  const { t, rows } = await draw(<><MarkdownViewer label="SKILL.md" source={LONG} /><Text>After the viewer</Text></>, 80, 24);
  let f = await rows();
  expect(f).toContain('After the viewer');
  expect(regionRows(f)).toBe(16); // 70 % of a 24-row pane
  expect(f.join('\n')).not.toContain('Paragraph 30');
  // one Tab stop past the head's controls: the region; End shows the document's end
  for (let i = 0; i < 6; i++) {
    t.mockInput.pressTab();
    await t.settle();
    if (focusedNode(semanticsOf(t.renderer))?.role === 'region') break;
  }
  const on = focusedNode(semanticsOf(t.renderer));
  expect(`${on?.role}:${on?.name}`).toBe('region:SKILL.md');
  t.mockInput.pressKey('END');
  f = await rows();
  expect(f.join('\n')).toContain('Paragraph 40');
  expect(f).toContain('After the viewer');
  t.renderer.destroy();
}, 30_000);

test('`height` is the region\'s most rows: sm 15, md 30', async () => {
  const sm = await draw(<MarkdownViewer label="SKILL.md" source={LONG} height="sm" />, 80, 60);
  expect(regionRows(await sm.rows())).toBe(15);
  sm.t.renderer.destroy();
  const md = await draw(<MarkdownViewer label="SKILL.md" source={LONG} />, 80, 60);
  expect(regionRows(await md.rows())).toBe(30);
  md.t.renderer.destroy();
}, 30_000);

test('a host that saves no file offers no Download (the web one reads `document`)', async () => {
  const { t, rows } = await draw(<MarkdownViewer label="SKILL.md" source={SHORT} />, 80, 24);
  const f = (await rows()).join('\n');
  expect(f).not.toContain('Download');
  expect(f).toContain('copy');
  t.renderer.destroy();
}, 30_000);

test('under 60 columns the head still shows the name and every action whole', async () => {
  const { t, rows } = await draw(<MarkdownViewer label="SKILL.md" source={SHORT} />, 40, 24);
  const f = await rows();
  const head = f.slice(0, f.findIndex((r) => r.startsWith('│'))).join('\n');
  expect(head).toContain('SKILL.md');
  expect(head).toContain('Rendered');
  expect(head).toContain('Raw');
  expect(head).not.toContain('…');
  t.renderer.destroy();
}, 30_000);
