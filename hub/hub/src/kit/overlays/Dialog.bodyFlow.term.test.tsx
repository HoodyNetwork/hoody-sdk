// The dialog body is a block (web: `<div class=body>`): paragraphs in it stack, words and inline parts flow on one line.
// Census cluster 19: the programs system confirm's two paragraphs were laid side by side, the second past the box.
import { expect, test } from 'bun:test';
import { drawTest } from '../../term/prim/testing';
import { FocusRoot } from '../../term/prim';
import { OverlayHost } from '../../term/prim/Overlay';
import { ConfirmDialog } from './Dialog';

const draw = (body: React.ReactNode) =>
  drawTest(<FocusRoot><OverlayHost><ConfirmDialog isOpen onOpenChange={() => {}} title="Restart hoody-agent?" body={body} confirmLabel="Restart it" onConfirm={() => {}} /></OverlayHost></FocusRoot>, { width: 60, height: 20 });

test('paragraphs in a body stack, each inside the box', async () => {
  const t = await draw(<><p>First paragraph here.</p><p>Second paragraph here.</p><p>Third one.</p></>);
  const rows = (await t.settle()).split('\n');
  const at = (s: string) => rows.findIndex((r) => r.includes(s));
  expect(at('First paragraph here.')).toBeGreaterThanOrEqual(0);
  expect(at('Second paragraph here.')).toBeGreaterThan(at('First paragraph here.'));
  expect(at('Third one.')).toBeGreaterThan(at('Second paragraph here.'));
  // Each starts at the same column (the body's left edge), never beside another.
  const col = (s: string) => rows[at(s)]!.indexOf(s);
  expect(col('Second paragraph here.')).toBe(col('First paragraph here.'));
  t.renderer.destroy();
});

test('words and inline parts of a body stay on one line', async () => {
  const t = await draw(<>Payments are held. <b>Billing</b> says why.</>);
  const f = await t.settle();
  expect(f).toContain('Payments are held. Billing says why.');
  t.renderer.destroy();
});

test('a string body still wraps inside the box', async () => {
  const t = await draw('hoody-agent is one of the programs that keep this computer and the Hub working.');
  const rows = (await t.settle()).split('\n');
  const i = rows.findIndex((r) => r.includes('hoody-agent is one of'));
  expect(i).toBeGreaterThanOrEqual(0);
  expect(rows.slice(i, i + 3).join(' ')).toMatch(/computer\s+and the Hub working\.|computer and the Hub working\./);
  for (const r of rows) expect(r.length).toBeLessThanOrEqual(60);
  t.renderer.destroy();
});
