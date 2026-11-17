// A chat opened at 120x40 lost its message box after the terminal shrank to 80x24 (eight empty rows
// at the bottom); opened at 80x24 it was there. The chat frame is `100dvh` of its pane, and the pane it read (the page's
// content region) is as tall as its content: the frame held it at the old height. The region now publishes its width only.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { FIXTURE_REALM } from '../../core/transport';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const PATH = `/ai/c/s-wait?computer=atlas.00a1&realm=${FIXTURE_REALM}`;
const BOX = 'Message your agent';

test('opened at 80x24: the message box is drawn', async () => {
  s = await renderPage({ page: 'ai', path: PATH, cols: 80, rows: 24, settleMs: 3000 });
  expect(await s.settle()).toContain(BOX);
}, 180_000);

test('opened at 120x40, then made shorter only (120x24): the message box is still drawn', async () => {
  s = await renderPage({ page: 'ai', path: PATH, cols: 120, rows: 40, settleMs: 3000 });
  expect(await s.settle()).toContain(BOX);
  await s.resize(120, 24);
  let frame = await s.settle();
  for (let i = 0; i < 20 && !frame.includes(BOX); i++) { await new Promise((r) => setTimeout(r, 100)); frame = await s.settle(); }
  expect(frame).toContain(BOX);
}, 180_000);

test('opened at 120x40, then shrunk to 80x24: the message box is still drawn', async () => {
  s = await renderPage({ page: 'ai', path: PATH, cols: 120, rows: 40, settleMs: 3000 });
  expect(await s.settle()).toContain(BOX);
  await s.resize(80, 24);
  let frame = await s.settle();
  for (let i = 0; i < 20 && !frame.includes(BOX); i++) { await new Promise((r) => setTimeout(r, 100)); frame = await s.settle(); }
  expect(frame).toContain(BOX);
}, 180_000);
