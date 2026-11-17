// A one-line ellipsis box with inline children (Notifications' Notice and Message cells:
// `<span class="ellipsis"><bdi>…</bdi></span>`, `.ellipsis { display: block; overflow: hidden; text-overflow: ellipsis;
// white-space: nowrap }`). CSS lays the inline children out as ONE line box and cuts it at its end with "…". The compat
// runtime made each inline child an item of the column box, which then wrapped by word and was never cut.
//
// | # | Web behaviour | Test |
// |---|---|---|
// | 1 | Inline child in an ellipsis box: one line, cut at its end with one "…" | 'inline child' |
// | 2 | Text and inline children together: still one line, words apart as written | 'mixed run' |
// | 3 | Two classes (unread title: ellipsis + bold) behave the same | 'unread title' |
// | 4 | Words that fit are not cut | 'fits' |
// | 5 | A block child inside the box still starts its own line | 'block child' |
import { afterAll, beforeAll, expect, test } from 'bun:test';
import type { ReactNode } from 'react';
import { drawTest } from '../prim/testing';
import { Box, FocusRoot } from '../prim';
import { setStyleTable } from '../jsx/style';
import { installStyleTable } from '../../../scripts/term/style-table';
import ib from '../../pages/notifications/parts/Inbox.module.css';

beforeAll(() => installStyleTable(120));
afterAll(() => setStyleTable(null));

async function frame(node: ReactNode, width = 12, height = 4): Promise<string[]> {
  const t = await drawTest(<FocusRoot><Box width={width}>{node}</Box></FocusRoot>, { width: 20, height });
  for (let i = 0; i < 6; i++) await t.renderOnce();
  const rows = t.captureCharFrame().split('\n').map((r) => r.trimEnd());
  t.renderer.destroy();
  return rows;
}
const LONG = 'Your paid server renews soon';

test('inline child: one line, cut at its end with one "…"', async () => {
  const rows = await frame(<span className={ib.ellipsis}><bdi>{LONG}</bdi></span>);
  expect(rows[0]).toBe('Your paid s…');
  expect(rows[1]).toBe('');
  expect(rows.join('\n')).not.toContain('...');
});

test('mixed run: text and an inline child stay on one line', async () => {
  const rows = await frame(<span className={ib.ellipsis}>a <b>{LONG}</b></span>);
  expect(rows[0]).toBe('a Your paid…');
  expect(rows[1]).toBe('');
});

test('unread title: two classes, same one-line cut', async () => {
  const rows = await frame(<span className={`${ib.ellipsis} ${ib.unreadTitle}`}><bdi>{LONG}</bdi></span>);
  expect(rows[0]).toBe('Your paid s…');
  expect(rows[1]).toBe('');
});

test('fits: no cut', async () => {
  const rows = await frame(<span className={ib.ellipsis}><bdi>Short one</bdi></span>);
  expect(rows[0]).toBe('Short one');
});

test('block child: its own line', async () => {
  const rows = await frame(<div className={ib.ellipsis}><bdi>Top</bdi><div>Below</div></div>);
  expect(rows[0]).toBe('Top');
  expect(rows[1]).toBe('Below');
});
