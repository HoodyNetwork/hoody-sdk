// What the Files page hands outside the Hub in the terminal: Download, Open in viewer (the row menu, ReadActions) and
// the preview's Download (Preview) open the file's address on its computer through the host's browser (openLink ->
// openOutside -> TermHostServices.openExternal), WHOLE. renderPage's `openExternal` records it as the scenario `opened`
// expectation does. The web half is not covered here (guarded by the no-window-open rule and openOutside's own cases).
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { act, queryAllByRole, semanticsOf, type Role } from '../../term/prim/semantics';

const PROJECT = '6a0000000000000000000001';
const ATLAS = 'c0a7150000000000000000a1';
const FILES = `https://${PROJECT}-${ATLAS}-files-1.n12.fixture.invalid`;

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

async function open(): Promise<string[]> {
  const opened: string[] = [];
  s = await renderPage({ page: 'files', path: '/files?a=atlas.00a1&ap=%2Fsrv%2Fapp', cols: 140, rows: 100, openExternal: (u) => { opened.push(u); } });
  await s.settle();
  return opened;
}

/** Presses the `i`-th node of that role and name, then settles. */
async function press(role: Role, name: string | RegExp, i = 0): Promise<void> {
  const r = s!.renderer as unknown as { root: never; stdin: never };
  const found = queryAllByRole(semanticsOf({ root: r.root, stdin: r.stdin }), role, { name });
  expect(found.length).toBeGreaterThan(i);
  act(found[i]!, 'press');
  await s!.settle();
}

// package.json is the second row of /srv/app (after the public folder).
const rowMenu = () => press('button', /Row actions/, 1);

test('row menu: Download opens the file\'s download address whole', async () => {
  const opened = await open();
  await rowMenu();
  await press('menuitem' as Role, 'Download');
  expect(opened).toEqual([`${FILES}/api/v1/files/srv/app/package.json?download=1`]);
  expect(s!.frame).not.toContain(ATLAS);
}, 180_000);

test('row menu: Open in viewer opens the file\'s view address whole', async () => {
  const opened = await open();
  await rowMenu();
  await press('menuitem' as Role, 'Open in viewer');
  expect(opened).toEqual([`${FILES}/srv/app/package.json?view`]);
}, 180_000);

test('preview: Download opens the file\'s download address whole', async () => {
  const opened = await open();
  await rowMenu();
  await press('menuitem' as Role, 'Preview…');
  await press('button', 'Download');
  expect(opened).toEqual([`${FILES}/api/v1/files/srv/app/package.json?download=1`]);
}, 180_000);
