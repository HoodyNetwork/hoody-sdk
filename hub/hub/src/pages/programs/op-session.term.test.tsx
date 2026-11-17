// A program's held operation (parts/ops.ts) lives in module state so a redraw or a remount shows it again. One terminal
// process draws many sessions (a sign-out and back in; the golden runner draws a shot at two sizes), and the note of
// the last session's press stayed on the next session's page: a refusal nobody in this session caused, shown before
// any press. The store now forgets with the session (core's auth purge), as a page load does on the web.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { act, semanticsOf, type SemNode } from '../../term/prim/semantics';
import strings from './strings.en.json';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const flat = (ns: SemNode[], out: SemNode[] = []): SemNode[] => { for (const n of ns) { out.push(n); flat(n.children, out); } return out; };
const open = async (): Promise<string> => {
  s = await renderPage({ page: 'programs', fx: 'press-failed', path: '/programs?sel=prog%3A6', cols: 120, rows: 40 });
  return s.settle();
};
const NOTE = strings['op.f.START_FAILED'].replace('{{name}}', 'docs-preview');

test('a refused Start shows its note in the session that pressed, and the next session starts without it', async () => {
  const before = await open();
  expect(before).not.toContain(NOTE);
  const r = s!.renderer as unknown as { root: never; stdin: never };
  const start = flat(semanticsOf({ root: r.root, stdin: r.stdin })).find((n) => n.name === 'Start docs-preview' && n.actions.includes('press'));
  expect(start).toBeDefined();
  act(start!, 'press');
  expect(await s!.settle()).toContain(NOTE);
  s!.close(); s = null;

  // A new session of the same process (the same fixture state, nothing pressed yet).
  const next = await open();
  expect(next).not.toContain(NOTE);
  expect(next).toBe(before);
  expect(s!.failures).toEqual([]);
}, 240_000);
