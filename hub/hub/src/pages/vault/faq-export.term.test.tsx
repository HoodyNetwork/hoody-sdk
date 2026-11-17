// A terminal has no download, so the vault menu leaves Export out there (view.tsx, export-menu.term.test.tsx). Its
// question "What does Export vault do?" stays in the page's Questions on every host (the FAQ contract allows no
// filter: faq.ts is one literal list), and the ANSWER says where Export is: the terminal variant, never the web's
// text about an action nobody can reach here.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { act, semanticsOf, type SemNode } from '../../term/prim/semantics';
import strings from './strings.en.json';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

test('the vault Questions keep Export, and its answer says Export is in the web Hub', async () => {
  s = await renderPage({ page: 'vault', cols: 120, rows: 60 });
  let frame = await s.settle();
  expect(frame).toContain('What is metadata?');
  expect(frame).toContain(strings['faq.export.q']);
  const r = s.renderer as unknown as { root: never; stdin: never };
  const flat = (ns: SemNode[], out: SemNode[] = []): SemNode[] => { for (const n of ns) { out.push(n); flat(n.children, out); } return out; };
  const q = flat(semanticsOf({ root: r.root, stdin: r.stdin })).find((n) => n.name.includes(strings['faq.export.q']) && n.actions.length > 0);
  expect(q).toBeDefined();
  act(q!, 'press');
  frame = (await s.settle()).replace(/\s+/g, ' ');
  // The answer wraps inside the page column: read its two ends.
  expect(frame).toContain('Export saves a file to your device');
  expect(frame).toContain('Open the Vault there to export.');
  expect(frame).not.toContain('Export saves the readable entries');
  expect(s.trapsAt).toEqual([]);
  expect(s.failures).toEqual([]);
}, 240_000);
