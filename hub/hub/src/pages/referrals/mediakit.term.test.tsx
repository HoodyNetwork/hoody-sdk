// Share material in the terminal's Your links: the media kit is one outside link (the address the web opens) under the
// codes, with its help line; an account that isn't earning has none.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { queryAllByRole, semanticsOf, type SemNode } from '../../term/prim/semantics';
import { MEDIA_KIT_URL } from './links';
import strings from './strings.en.json';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const tree = (): SemNode[] => { const r = s!.renderer as unknown as { root: never; stdin: never }; return semanticsOf({ root: r.root, stdin: r.stdin }); };
const mediaLinks = (): SemNode[] => queryAllByRole(tree(), 'link', { name: new RegExp(`^${strings['media.link']}`) });

test('a member sees Share material after the codes: the title, the help line and one Media kit link', async () => {
  s = await renderPage({ page: 'referrals', fx: null, cols: 120, rows: 40 });
  const rows = (await s.settle()).split('\n');
  expect(MEDIA_KIT_URL).toBe('https://hoody.com/media-kit?source=hub');
  const title = rows.findIndex((r) => r.includes(strings['media.title']));
  const help = rows.findIndex((r) => r.includes(strings['media.help']));
  const link = rows.findIndex((r) => r.includes(`${strings['media.link']} ⇗`));
  const own = rows.findIndex((r) => r.includes(strings['link.custom']));
  const note = rows.findIndex((r) => r.includes('A new account can become your referral'));
  expect(own).toBeGreaterThan(-1);
  expect(title).toBeGreaterThan(own);
  expect(help).toBeGreaterThan(title);
  expect(link).toBeGreaterThan(help);
  expect(note).toBeGreaterThan(link);
  expect(rows.join('\n')).not.toContain('source=hub');
  expect(mediaLinks().length).toBe(1);
  expect(s.trapsAt).toEqual([]);
  expect(s.failures).toEqual([]);
}, 240_000);

test.each(['earningPaused', 'removed'])('state %s: the codes alone, no share material', async (fx) => {
  s = await renderPage({ page: 'referrals', fx, cols: 120, rows: 40 });
  const frame = await s.settle();
  expect(frame).toContain(strings['link.codes']);
  expect(frame).not.toContain(strings['media.title']);
  expect(frame).not.toContain(strings['media.link']);
  expect(mediaLinks().length).toBe(0);
  expect(s.failures).toEqual([]);
}, 240_000);
