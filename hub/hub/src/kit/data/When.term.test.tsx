// When in the terminal (When.term.tsx): the relative words ("3 minutes ago") with the exact date and time as the
// semantics description (the web's `<time dateTime>` title: a terminal has no hover, so the tree is where an agent or a
// test reads the exact moment). These hold:
//   - a Date, an ISO text or epoch milliseconds: the same words, and the exact moment as the text node's description
//   - `text` words the moment in place of the relative words; the description stays the exact moment
//   - inside a text run: the words alone, in the run, with no node of their own
//   - not a date: the words given, else nothing
import { afterEach, expect, test } from 'bun:test';
import type { ReactNode } from 'react';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { FocusRoot, Text } from '../../term/prim';
import { queryAllByRole, semanticsOf } from '../../term/prim/semantics';
import { formatDateTime } from '../format';
import { When } from './When';

let t: TestTerm | null = null;
afterEach(() => { t?.renderer.destroy(); t = null; });

const draw = async (node: ReactNode): Promise<string> => {
  t?.renderer.destroy();
  t = await drawTest(<FocusRoot>{node}</FocusRoot>, { width: 60, height: 3 });
  return t.settle();
};
const textNodes = () => queryAllByRole(semanticsOf(t!.renderer as never), 'text');

// Catches the description being lost (line 16: a description on a node with no role is dropped by the tree).
test('a Date, an ISO text or epoch ms: "3 minutes ago", with the exact moment as the description', async () => {
  const at = new Date(Date.now() - 3 * 60_000);
  for (const given of [at, at.toISOString(), at.getTime()]) {
    const f = await draw(<When at={given} />);
    expect(f).toContain('3 minutes ago');
    const node = textNodes().find((n) => n.name === '3 minutes ago');
    expect(node?.description).toBe(formatDateTime(at));
  }
});

// Catches `text` (line 14): the page's words drawn and named; the exact moment still described.
test('text words the moment; the description stays the exact moment', async () => {
  const at = new Date(Date.now() + 3 * 3_600_000);
  const f = await draw(<When at={at} text="ends in 3 hours" />);
  expect(f).toContain('ends in 3 hours');
  const node = textNodes().find((n) => n.name === 'ends in 3 hours');
  expect(node?.description).toBe(formatDateTime(at));
});

// Catches the inline branch (line 16, useInText): the words join the run; no node, no description of their own.
test('inside a text run: the words alone, on the run\'s line, no node of their own', async () => {
  const at = new Date(Date.now() - 3 * 60_000);
  const f = await draw(<Text>Seen <When at={at} /> by atlas</Text>);
  expect(f).toContain('Seen 3 minutes ago by atlas');
  expect(JSON.stringify(semanticsOf(t!.renderer as never))).not.toContain(formatDateTime(at));
  expect(textNodes().filter((n) => n.name === '3 minutes ago')).toHaveLength(0);
});

// Catches the not-a-date branch (line 13): the given words, else nothing; never "Invalid Date".
test('not a date: the words given, else nothing; never "Invalid Date"', async () => {
  let f = await draw(<When at="not a date" text="soon" />);
  expect(f).toContain('soon');
  expect(f).not.toContain('Invalid');
  f = await draw(<When at="not a date" />);
  expect(f.trim()).toBe('');
  expect(textNodes()).toHaveLength(0);
});
