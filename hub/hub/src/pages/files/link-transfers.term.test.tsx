// Files: Download from a link, from the pane bar's More menu to the Transfers tab, on the fixture computer atlas in
// /tmp. The link fixtures record every send (`linkSends`, one download id each), reset on each boot.
//
// | # | State | Pins |
// |---|---|---|
// | 1 | linkRunning | paste, Download: the dialog closes, the band says one download is running, See Transfers switches to the Transfers tab, where the row is downloading |
// | 2 | linkLost | the answer is lost: the band says one needs you; the Transfers row has its inline Check again, which only reads (the record is found by its id), and then it is gone |
import { afterEach, expect, test } from 'bun:test';
import { renderPage, type PageSession } from '../../../scripts/term/render';
import { act, queryAllByRole, semanticsOf, within, type SemNode } from '../../term/prim/semantics';
import { linkSends } from './link/fixtures';
import lstrings from './link/link.strings.en.json';
import strings from './strings.en.json';
import tstrings from './transfers/transfers.strings.en.json';
import ustrings from './Upload.strings.en.json';

let s: PageSession | null = null;
afterEach(() => { s?.close(); s = null; });

const TMP = '/files?a=atlas.00a1&ap=%2Ftmp';
const LINK = 'https://downloads.example/big.iso';
const FILE = 'big.iso';
const esc = (x: string): string => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const fill = (x: string, v: Record<string, string | number>): string => x.replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(v[k]));
const starts = (x: string): RegExp => new RegExp(`^${esc(x)}`);
const tree = (p: PageSession): SemNode[] => { const r = p.renderer as unknown as { root: never; stdin: never }; return semanticsOf({ root: r.root, stdin: r.stdin }); };
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(p: PageSession, ok: () => boolean, tries = 40): Promise<string> {
  let frame = await p.settle();
  for (let i = 0; i < tries && !ok(); i++) { await pause(250); frame = await p.settle(); }
  return frame;
}
const dialog = (p: PageSession): SemNode | undefined => queryAllByRole(tree(p), 'dialog', { name: lstrings.title })[0];

/** /tmp listed, More → Download from link, the link pasted, Download pressed; the dialog closes. */
async function send(fx: string): Promise<PageSession> {
  const p = await renderPage({ page: 'files', fx, cols: 120, rows: 40, path: TMP });
  // The folder is listed once Upload can be pressed (link.flow.test.tsx waits the same way): only then does the
  // bar's More menu hold Download from link (view.tsx moreItems, `listed`).
  const upload = () => queryAllByRole(tree(p), 'button', { name: ustrings['action.upload'] })[0];
  await until(p, () => upload() !== undefined && upload()!.states.disabled !== true);
  expect(upload()?.states.disabled ?? false).toBe(false);
  const more = () => queryAllByRole(tree(p), 'button', { name: strings['action.more'] })[0];
  expect(more()).toBeDefined();
  act(more()!, 'press');
  const item = () => queryAllByRole(tree(p), 'menuitem', { name: starts(lstrings.action) })[0];
  await until(p, () => item() !== undefined);
  act(item()!, 'press');
  await until(p, () => dialog(p) !== undefined);
  const field = queryAllByRole(within(dialog(p)!), 'textbox', { name: lstrings['field.link'] })[0];
  expect(field).toBeDefined();
  act(field!, 'type', LINK);
  const go = () => { const d = dialog(p); return d ? queryAllByRole(within(d), 'button', { name: lstrings.send })[0] : undefined; };
  // Download waits for the computer's files program to say it can (its feature read).
  await until(p, () => go() !== undefined && go()!.states.disabled !== true);
  expect(go()?.states.disabled ?? false).toBe(false);
  expect(p.frame).toContain(FILE);
  act(go()!, 'press');
  await until(p, () => dialog(p) === undefined);
  expect(dialog(p)).toBeUndefined();
  expect(linkSends.length).toBe(1);
  return p;
}
/** The band's See Transfers, then the Transfers tab selected. */
async function seeTransfers(p: PageSession): Promise<void> {
  const open = () => queryAllByRole(tree(p), 'button', { name: lstrings['notice.open'] })[0];
  await until(p, () => open() !== undefined);
  act(open()!, 'press');
  const tab = () => queryAllByRole(tree(p), 'tab', { name: starts(tstrings['tab.transfers']) })[0];
  await until(p, () => tab()?.states.selected === true);
  expect(tab()?.states.selected).toBe(true);
}
const rowsOf = (p: PageSession, name: string): SemNode[] => queryAllByRole(tree(p), 'row').filter((r) => r.name.includes(name));
const checksIn = (p: PageSession, name: string): SemNode[] => rowsOf(p, name).flatMap((r) => queryAllByRole(within(r), 'button', { name: starts(lstrings['kit.retry']) }));

test('A link download: the band says it is running and See Transfers shows it downloading', async () => {
  s = await send('linkRunning');
  const p = s;
  const running = fill(lstrings['notice.running_one'], { count: 1 });
  const frame0 = await until(p, () => p.frame.includes(running));
  expect(frame0).toContain(running);
  await seeTransfers(p);
  const frame = await until(p, () => rowsOf(p, FILE).length > 0 && p.frame.includes(tstrings['state.running']));
  expect(rowsOf(p, FILE).length).toBeGreaterThan(0);
  expect(frame).toContain(tstrings['state.running']);
  expect(linkSends.length).toBe(1);
  expect(p.failures).toEqual([]);
}, 240_000);

test('A lost answer: Transfers shows its inline Check again, which only reads and settles it', async () => {
  s = await send('linkLost');
  const p = s;
  const attention = fill(lstrings['notice.attention_one'], { count: 1 });
  const frame0 = await until(p, () => p.frame.includes(attention));
  expect(frame0).toContain(attention);
  await seeTransfers(p);
  await until(p, () => checksIn(p, FILE).length > 0);
  expect(checksIn(p, FILE).length).toBe(1);
  act(checksIn(p, FILE)[0]!, 'press');
  await until(p, () => checksIn(p, FILE).length === 0);
  expect(checksIn(p, FILE)).toEqual([]);
  // Found by its id: followed, never sent again.
  expect(rowsOf(p, FILE).length).toBeGreaterThan(0);
  expect(linkSends.length).toBe(1);
  expect(p.failures).toEqual([]);
}, 240_000);
