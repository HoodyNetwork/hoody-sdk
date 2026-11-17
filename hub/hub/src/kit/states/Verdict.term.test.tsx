// Verdict in the terminal (Verdict.term.tsx). Each case fails on the compat drawing of Verdict.tsx (the class styles
// are installed here so that comparison is the real one): it laid the sentence's text and its marked phrase side by
// side ("In groupsonly commands and replies." at 120 columns, three ragged columns in a 46-column panel), drew no
// meter and no frame on the calm plate, and showed the next line in the sentence's ink.
import { afterAll, beforeAll, expect, test } from 'bun:test';
import type { ReactNode } from 'react';
import { drawTest } from '../../term/prim/testing';
import { Box, FocusRoot, setColourTier } from '../../term/prim';
import { getByRole, semanticsOf, semText } from '../../term/prim/semantics';
import { setStyleTable } from '../../term/jsx/style';
import { installStyleTable } from '../../../scripts/term/style-table';
import { Verdict, VerdictMark } from './Verdict';

beforeAll(() => installStyleTable(120));
afterAll(() => setStyleTable(null));

const UNDERLINE = 8;
const BOLD = 1;

async function draw(node: ReactNode, width: number, height = 14) {
  const t = await drawTest(<FocusRoot><Box width={width}>{node}</Box></FocusRoot>, { width, height });
  const frame = await t.settle();
  return { t, rows: frame.split('\n').map((r) => r.trimEnd()) };
}

const warn = (
  <Verdict label="Get it working" count="3 of 6 done · 1 limited · 1 optional · 1 can't tell" segments={['done', 'done', 'limited', 'done', 'optional', 'unknown']} next="Next: turn privacy off in @BotFather so it also sees mentions.">
    It answers in private chats. In groups it sees <VerdictMark tone="warn">only commands and replies</VerdictMark>.
  </Verdict>
);

test('the sentence and its marked phrase wrap as one run of text, in a panel and at full width', async () => {
  const panel = await draw(warn, 46);
  expect(panel.rows.slice(0, 10)).toEqual([
    '┌────────────────────────────────────────────┐',
    '│ GET IT WORKING                             │',
    '│ 3 OF 6 DONE · 1 LIMITED · 1 OPTIONAL · 1   │',
    "│ CAN'T TELL                                 │",
    '│ It answers in private chats. In groups it  │',
    '│ sees only commands and replies.            │',
    '│ Next: turn privacy off in @BotFather so it │',
    '│ also sees mentions.                        │',
    '│ ━━━━━━━ ━━━━━━ ╍╍╍╍╍╍ ━━━━━━ ┄┄┄┄┄┄ ┄┄┄┄┄┄ │',
    '└────────────────────────────────────────────┘',
  ]);
  panel.t.renderer.destroy();
  const wide = await draw(warn, 120);
  // Label and count share the first row; the sentence keeps the web's reading width (64 cells) and breaks by word.
  expect(wide.rows[1]).toMatch(/^│ GET IT WORKING {2,}3 OF 6 DONE · 1 LIMITED · 1 OPTIONAL · 1 CAN'T TELL │$/);
  expect(wide.rows[2]).toMatch(/^│ It answers in private chats\. In groups it sees only commands and +│$/);
  expect(wide.rows[3]).toMatch(/^│ replies\. +│$/);
  wide.t.renderer.destroy();
});

test('the meter: one run per step, its own glyph per kind, filling the row exactly', async () => {
  const { t, rows } = await draw(<Verdict tone="state" label="Is it online" count="1 of 5 done" segments={['blocking', 'done', 'todo', 'limited', 'optional']}>It is offline.</Verdict>, 40);
  const meter = rows.find((r) => r.includes('╳'))!;
  expect(meter).toBe('│ ╳╳╳╳╳╳╳ ━━━━━━━ ────── ╍╍╍╍╍╍ ┄┄┄┄┄┄ │');
  // Decoration only: the count says it in words, and the meter adds nothing to the tree an agent reads.
  expect(semText(semanticsOf(t.renderer as never))).not.toMatch(/[╳━╍┄]/);
  t.renderer.destroy();
});

test('the plate is a framed group named by its label; a calm plate with no progress has no meter row', async () => {
  const { t, rows } = await draw(<Verdict label="What you get">A link that opens port 8080.</Verdict>, 40);
  expect(rows.slice(0, 4)).toEqual([
    '┌──────────────────────────────────────┐',
    '│ WHAT YOU GET                         │',
    '│ A link that opens port 8080.         │',
    '└──────────────────────────────────────┘',
  ]);
  expect(getByRole(semanticsOf(t.renderer as never), 'group', { name: 'What you get' })).toBeTruthy();
  t.renderer.destroy();
});

test('the mark never rests on colour: bold, and underlined for a warning and for every tone with no colour', async () => {
  const marked = (tone: 'warn' | 'danger' | 'good') => <Verdict label="L">It is <VerdictMark tone={tone}>broken</VerdictMark> now.</Verdict>;
  const attrs = async (tone: 'warn' | 'danger' | 'good'): Promise<number> => {
    const { t } = await draw(marked(tone), 40);
    const span = t.captureSpans().lines.flatMap((l) => l.spans).find((s) => s.text.includes('broken'))!;
    t.renderer.destroy();
    return span.attributes;
  };
  expect((await attrs('warn')) & (BOLD | UNDERLINE)).toBe(BOLD | UNDERLINE);
  expect((await attrs('danger')) & (BOLD | UNDERLINE)).toBe(BOLD);
  setColourTier('mono');
  try {
    expect((await attrs('danger')) & (BOLD | UNDERLINE)).toBe(BOLD | UNDERLINE);
    expect((await attrs('good')) & (BOLD | UNDERLINE)).toBe(BOLD | UNDERLINE);
  } finally {
    setColourTier('truecolor');
  }
});

test('the next line is muted, not in the sentence ink', async () => {
  const { t } = await draw(<Verdict label="L" next="Next: paste a new token.">It is offline.</Verdict>, 40);
  const spans = t.captureSpans().lines.flatMap((l) => l.spans);
  const ink = spans.find((s) => s.text.includes('It is offline.'))!.fg.toInts().join();
  const next = spans.find((s) => s.text.includes('Next: paste'))!.fg.toInts().join();
  expect(next).not.toBe(ink);
  t.renderer.destroy();
});
