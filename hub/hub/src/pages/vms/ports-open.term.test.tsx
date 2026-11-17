// A VM's open port, "Open" (parts/Ports.tsx): the address leaves the Hub through the kit's openOutside, which in a
// terminal hands it to the host's browser. The row action called window.open, a browser global a terminal does not
// have: the press trapped (TERM_GLOBAL), nothing opened and nothing was said.
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { act, queryAllByRole, semanticsOf } from '../../term/prim/semantics';
import { fixtureWorld } from '@core';
import strings from './strings.en.json';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

test('Open on a running VM\'s port hands the port\'s address to the host browser, once, with no trap', async () => {
  const opened: string[] = [];
  s = await renderPage({ page: 'vms', path: '/vms/web-1?tab=ports', cols: 120, rows: 40, openExternal: (u) => { opened.push(u); } });
  await s.settle();
  const r = s.renderer as unknown as { root: never; stdin: never };
  const open = queryAllByRole(semanticsOf({ root: r.root, stdin: r.stdin }), 'button', { name: strings['ports.openShort'] })[0];
  expect(open).toBeDefined();
  act(open!, 'press');
  await s.settle();
  expect(s.trapsAt).toEqual([]);
  expect(s.failures).toEqual([]);
  expect(opened.length).toBe(1);
  // The first port row: the computer's own address for its port 8080 (project, computer, protocol, port, server).
  const atlas = fixtureWorld.computer('atlas');
  expect(opened[0]).toBe(`https://${atlas.project_id}-${atlas.id}-http-8080.${atlas.server_name}.fixture.invalid`);
}, 180_000);
