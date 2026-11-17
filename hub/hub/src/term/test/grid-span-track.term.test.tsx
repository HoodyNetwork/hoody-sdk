// Grid tracks the compat runtime got wrong: each case is the page's real structure
// with the page's own stylesheet (the CSS translator's table at 120 columns).
//
// | # | Web behaviour | Test |
// |---|---|---|
// | 1 | An item spanning every track (`grid-column: 1 / -1`) is as wide as the grid, also when the grid has no more items than tracks (Referrals: one code row in a 3-track list; its link wrapped at the first track's 18 cells) | 'a spanning item takes the whole row' |
// | 1b | The same when the item is a component (Referrals' CodeRow) or spans through a rule its grid hands down (`.create > *`) | 'a spanning component item / a span handed down by the grid' |
// | 1c | An item that is display: none takes no track (Guide Connect: a hidden select made the panel wrap into the 22-cell rail track) | 'a hidden item takes no track' |
// | 2 | A `max-content` column lines up across the grid's rows (Scripts "Your script so far": a `<dl>` whose values started at different x) | 'a content-sized column lines up across rows' |
// | 3 | `repeat(auto-fit, minmax(L, 1fr))` puts items side by side while they fit (Scripts "Or start another way": two option cards stacked with blank rows between) | 'auto-fit cards sit side by side' |
import { afterAll, beforeAll, expect, test } from 'bun:test';
import type { ReactNode } from 'react';
import { drawTest } from '../prim/testing';
import { Box, FocusRoot } from '../prim';
import { setStyleTable } from '../jsx/style';
import { installStyleTable } from '../../../scripts/term/style-table';
import r from '../../pages/referrals/parts/parts.module.css';
import f from '../../pages/scripts/new/Flow.module.css';
import gd from '../../pages/guide/parts/guide.module.css';

beforeAll(() => installStyleTable(120));
afterAll(() => setStyleTable(null));

async function frame(node: ReactNode, width = 90, height = 16): Promise<string[]> {
  const t = await drawTest(<FocusRoot><Box dir="column" width={width}>{node}</Box></FocusRoot>, { width, height });
  for (let i = 0; i < 6; i++) await t.renderOnce();
  const rows = t.captureCharFrame().split('\n').map((x) => x.trimEnd());
  t.renderer.destroy();
  return rows;
}
const rowOf = (rows: string[], word: string): number => rows.findIndex((x) => x.includes(word));

const LINK = 'https://api.hoody.com/auth/signup?ref=maya-builds';
const codeRow = (code: string, tag: string) => (
  <li className={r.row} key={code}>
    <span className={r.code}><span className={r.mono}>{code}</span><span>{tag}</span></span>
    <span className={r.link}>{`${LINK}#${code}`}</span>
  </li>
);

test('a spanning item takes the whole row', async () => {
  for (const items of [[codeRow('maya-builds', 'Your own')], [codeRow('maya-builds', 'Your own'), codeRow('k7m2q9xa', 'Main')]]) {
    const rows = await frame(<div className={r.links}><ul className={r.codes}>{items}</ul></div>);
    // The link is drawn whole on one line (it fits in 90 cells), and the code keeps its tag beside it.
    for (const it of items) {
      const code = (it.key as string);
      expect(rowOf(rows, `${LINK}#${code}`)).toBeGreaterThan(-1);
    }
    expect(rows[rowOf(rows, 'maya-builds')]).toContain('maya-builds Your own');
  }
});

function CodeRow({ code, tag }: { code: string; tag: string }): ReactNode {
  return codeRow(code, tag);
}

test('a spanning component item takes the whole row', async () => {
  const rows = await frame(<div className={r.links}><ul className={r.codes}><CodeRow code="maya-builds" tag="Your own" /></ul></div>);
  expect(rowOf(rows, `${LINK}#maya-builds`)).toBeGreaterThan(-1);
  expect(rows[rowOf(rows, 'maya-builds')]).toContain('maya-builds Your own');
});

test('a span handed down by the grid (.create > *) takes the whole row', async () => {
  const rows = await frame(<div className={r.links}><div className={r.create}><div className={r.form}><span>{LINK}</span></div></div></div>);
  expect(rowOf(rows, LINK)).toBeGreaterThan(-1);
});

test('a hidden item takes no track', async () => {
  const text = 'Paste this into an AI that can open links. It can guide you through connecting Hoody.';
  const rows = await frame(
    <div className={gd.doors}>
      <div className={gd.doorSelect}><span>select</span></div>
      <div className={gd.doorList}><span>AI chats</span><span>CLI</span></div>
      <div className={gd.panel}><span>{text}</span></div>
    </div>, 120);
  // The panel is the second track, beside the rail, its text on one line.
  const y = rowOf(rows, text);
  expect(y).toBeGreaterThan(-1);
  expect(Math.abs(y - rowOf(rows, 'AI chats'))).toBeLessThan(3);
  expect(rows[y]!.indexOf(text)).toBeGreaterThan(rows[rowOf(rows, 'AI chats')]!.indexOf('AI chats'));
  expect(rows.join('\n')).not.toContain('select');
});

test('a content-sized column lines up across rows', async () => {
  const rows = await frame(
    <dl className={f.railList}>
      <dt>What</dt><dd>Every Monday at 9:00</dd>
      <dt>On</dt><dd>atlas</dd>
      <dt>At</dt><dd>/monday-at-9</dd>
    </dl>,
  );
  const xs = ['Every Monday', 'atlas', '/monday-at-9'].map((v) => rows[rowOf(rows, v)]!.indexOf(v));
  expect(xs[0]).toBeGreaterThan(0);
  expect(xs).toEqual([xs[0]!, xs[0]!, xs[0]!]);
});

test('auto-fit cards sit side by side', async () => {
  const card = (title: string, body: string) => (
    <div className={f.card} key={title}><span className={f.cardTitle}>{title}</span><span className={f.cardBody}>{body}</span></div>
  );
  const rows = await frame(<div className={f.cards}>{[card('Start from an idea', 'Ready-made scripts.'), card('Write the code myself', 'When you know the code.')]}</div>);
  const y = rowOf(rows, 'Start from an idea');
  expect(y).toBeGreaterThan(-1);
  expect(rowOf(rows, 'Write the code myself')).toBe(y);
});
