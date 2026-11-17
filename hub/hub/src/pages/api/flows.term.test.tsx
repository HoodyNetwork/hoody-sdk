// The API page's own flows in a terminal, read as correct and pinned here.
//
// | # | Web | Terminal |
// |---|---|---|
// | 1 | Search narrows the catalog (path, summary, id); a row opens its endpoint | `/` focuses the list's search, typing narrows it, Enter goes back to the list, Enter opens the row under the mark |
// | 2 | Copy all copies the whole example; the language control shows another one | The same through the terminal's clipboard (OSC 52) and the radio row |
// | 3 | A bookmark to an endpoint the catalog no longer has says so; "Back to the list" clears it | The same |
//
// Each check that something is absent has a positive check on the same frame first, so none passes on an empty page.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { act, getByRef, semanticsOf, type SemNode } from '../../term/prim/semantics';
import { copiesOf } from '../../term/prim/testing';
import strings from './strings.en.json';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const tree = (p: PageSession): SemNode[] => {
  const r = p.renderer as unknown as { root: never; stdin: never };
  return semanticsOf({ root: r.root, stdin: r.stdin });
};
const flat = (ns: SemNode[], out: SemNode[] = []): SemNode[] => { for (const n of ns) { out.push(n); flat(n.children, out); } return out; };
function press(p: PageSession, role: string, name: string): void {
  const n = flat(tree(p)).find((x) => x.role === role && x.name === name);
  expect(n, `${role} "${name}"\n${p.frame}`).toBeDefined();
  act(getByRef(tree(p), n!.ref), 'press');
}

test('80x24: / searches the catalog; Enter goes back to the list, Enter opens the endpoint under the mark', async () => {
  s = await renderPage({ page: 'api', cols: 80, rows: 24 });
  let f = await s.settle();
  const total = Number(/(\d+) endpoints/.exec(f)?.[1] ?? Number.NaN);
  expect(total).toBeGreaterThan(2);
  await s.keys.press('/');
  await s.keys.type('waitlist');
  f = await s.settle();
  expect(f).toContain('/api/v1/waitlist');
  expect(f).toMatch(/\b2 endpoints/);
  expect(f).not.toContain(`${total} endpoints`);
  await s.keys.press('enter');
  await s.settle();
  await s.keys.press('enter');
  f = await s.settle();
  expect(f).toMatch(/(PATCH|POST) \/api\/v1\/waitlist/);
  expect(f).toContain(strings['snip.label']);
  expect(s.trapsAt).toEqual([]);
  expect(s.failures).toEqual([]);
}, 180_000);

test('120x40: Copy all copies the whole cURL example; the language control shows the JavaScript one', async () => {
  s = await renderPage({ page: 'api', cols: 120, rows: 40, path: '/api?op=api_listAuthTokens' });
  let f = await s.settle();
  expect(f).toContain('cURL example');
  const copied = copiesOf(s.renderer);
  press(s, 'button', 'Copy all');
  await s.settle();
  expect(copied).toHaveLength(1);
  expect(copied[0]).toMatch(/^curl /);
  expect(copied[0]).toContain('/api/v1/auth/tokens');
  expect(copied[0]).toContain('Authorization: Bearer $HOODY_TOKEN');
  press(s, 'radio', 'JavaScript');
  f = await s.settle();
  expect(f).toContain('JavaScript example');
  expect(f).not.toContain('cURL example');
  expect(s.trapsAt).toEqual([]);
  expect(s.failures).toEqual([]);
}, 180_000);

test('80x24: an endpoint the catalog no longer has says so; Back to the list clears it', async () => {
  s = await renderPage({ page: 'api', cols: 80, rows: 24, path: '/api?op=gone_noSuchOperation' });
  let f = await s.settle();
  expect(f).toContain(strings['detail.gone']);
  press(s, 'button', strings['detail.backList']);
  f = await s.settle();
  expect(f).toMatch(/\d+ endpoints/);
  expect(f).not.toContain(strings['detail.gone']);
  expect(s.trapsAt).toEqual([]);
  expect(s.failures).toEqual([]);
}, 180_000);
