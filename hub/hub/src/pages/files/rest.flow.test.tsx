// Vitest: Copy the rest of a held folder copy found part made.
// The first copy of /home/ada/projects to /tmp/projects is cut part way (README.md only); site and its two files are
// missing. Copy the rest frees only that held copy (core dismissOne) and copies each missing item create-only.
import { beforeEach, describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { addDir, addFile, addOdd, finishCopy, removeItem, resetFiles, rewriteFile, sentChanges } from './fixtures';
import page from './page';
import strings from './strings.en.json';
import ts from './Transfer.strings.en.json';

const fill = (s: string, v: Record<string, string>) => s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => v[k] ?? '');
const enc = encodeURIComponent;
const paneA = () => screen.findByRole('region', { name: strings['pane.a'] });
const table = async () => within(await paneA()).findByRole('table', { name: fill(strings['table.label'], { name: 'atlas' }) });
const row = async (name: RegExp) => within(await table()).findByRole('row', { name });
const held = fill(ts['held.copy'], { name: 'projects', dest: '/tmp/projects' });
const part = (n: number) => fill(ts['held.copyPart'], { count: String(n), dest: '/tmp/projects' });
const FIRST = 'copy:/home/ada/projects>/tmp/projects';

/** Copies projects to /tmp in `state`, cut part way, closes the dialog and waits for the band's count. */
async function cutCopy(state: string, count = 3) {
  await renderPage(page, { path: `/files?a=atlas.00a1&ap=${enc('/home/ada')}&b=atlas.00a1&bp=${enc('/tmp')}`, state });
  const r = await row(/projects/);
  await userEvent.click(within(r).getByRole('button', { name: /actions|more/i }));
  await userEvent.click(await screen.findByRole('menuitem', { name: new RegExp(`^${ts['action.copy']}`) }));
  const d = await screen.findByRole('dialog');
  const go = within(d).getByRole('button', { name: ts['copy.primary'] });
  await waitFor(() => expect(go).toBeEnabled());
  await userEvent.click(go);
  expect(await within(d).findByText(part(count), {}, { timeout: 10_000 })).toBeInTheDocument();
  await userEvent.click(within(d).getByRole('button', { name: (n, el) => /^close$|^cancel$/i.test(n) && !el.hasAttribute('data-dialog-close') }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
}
// Both panes show atlas, so each shows the held band: the first one's button.
const restButton = async () => (await screen.findAllByRole('button', { name: ts['rest.action'] }, { timeout: 10_000 }))[0]!;
async function openRest() {
  await userEvent.click(await restButton());
  return screen.findByRole('dialog', { name: fill(ts['rest.title'], { name: 'projects' }) });
}
const items = (d: HTMLElement) => within(d).findByRole('list', { name: ts['several.listLabel'] });

beforeEach(() => resetFiles());

describe('Copy the rest', () => {
  it('the held part-made copy offers it; it lists what is missing, says the first copy is let go, and copies only that', async () => {
    await cutCopy('folderCutFirst');
    const d = await openRest();
    expect(await within(d).findByText(ts['rest.release'])).toBeInTheDocument();
    const list = await items(d);
    // The missing folder once, never the files under it; README.md is there and equal, so not listed.
    expect(within(list).getAllByRole('listitem').map((li) => li.textContent)).toEqual([expect.stringMatching(/^site/)]);
    expect(within(d).queryByText(/README/)).toBeNull();
    // No Keep both / Skip: an item lands where the copy has it or not at all.
    expect(within(d).queryByRole('radiogroup')).toBeNull();
    const go = within(d).getByRole('button', { name: ts['copy.primary'] });
    await waitFor(() => expect(go).toBeEnabled(), { timeout: 10_000 });
    await userEvent.click(go);
    await waitFor(() => expect(sentChanges).toEqual([FIRST, 'copy:/home/ada/projects/site>/tmp/projects/site']), { timeout: 10_000 });
    // Whole now: the hold is gone (its own copy, freed by the press), and the dialog closes as a done copy's does.
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), { timeout: 10_000 });
    await waitFor(() => expect(screen.queryAllByText(held, { exact: false })).toHaveLength(0), { timeout: 10_000 });
  }, 40_000);

  it('before the press nothing is let go: the copy stays held, and other changes stay refused, until Copy is pressed', async () => {
    await cutCopy('folderCutFirst');
    const d = await openRest();
    await items(d);
    expect(screen.getAllByText(held, { exact: false }).length).toBeGreaterThan(0);
    await userEvent.click(within(d).getByRole('button', { name: (n, el) => /^cancel$|^close$/i.test(n) && !el.hasAttribute('data-dialog-close') }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getAllByText(held, { exact: false }).length).toBeGreaterThan(0);
    expect(sentChanges).toEqual([FIRST]);
  }, 40_000);

  it('a name made meanwhile is kept and skipped (never written over), and the rest goes on past it', async () => {
    addDir('/home/ada/projects/extra');
    await cutCopy('folderCutFirst', 4);
    const d = await openRest();
    const list = await items(d);
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    // The first copy (still running) makes site before the press.
    addDir('/tmp/projects/site');
    const go = within(d).getByRole('button', { name: ts['copy.primary'] });
    await waitFor(() => expect(go).toBeEnabled(), { timeout: 10_000 });
    await userEvent.click(go);
    await waitFor(() => expect(sentChanges).toEqual([FIRST, 'copy:/home/ada/projects/site>/tmp/projects/site', 'copy:/home/ada/projects/extra>/tmp/projects/extra']), { timeout: 10_000 });
    expect(await within(d).findByText(ts['several.madeMeanwhile'])).toBeInTheDocument();
    expect(within(d).getByText(new RegExp(fill(ts['several.sumTaken'], { count: '1' }).replace('.', '\\.')))).toBeInTheDocument();
    // site was made empty meanwhile: its two files are still missing, said after the run (read again, never "whole").
    expect(await within(d).findByText(fill(ts['rest.afterPart'], { count: '2', dest: '/tmp/projects' }), {}, { timeout: 10_000 })).toBeInTheDocument();
  }, 40_000);

  it('different files are listed, never sent; with only those left, Copy the rest is not offered', async () => {
    await cutCopy('folderCutFirst');
    rewriteFile('/tmp/projects/README.md');
    await userEvent.click(screen.getAllByRole('button', { name: /check again/i })[0]!);
    const d = await openRest();
    expect(await within(d).findByText(fill(ts['rest.different'], { dest: '/tmp/projects' }))).toBeInTheDocument();
    expect(within(d).getByText('README.md')).toBeInTheDocument();
    const go = within(d).getByRole('button', { name: ts['copy.primary'] });
    await waitFor(() => expect(go).toBeEnabled(), { timeout: 10_000 });
    await userEvent.click(go);
    await waitFor(() => expect(sentChanges).toEqual([FIRST, 'copy:/home/ada/projects/site>/tmp/projects/site']), { timeout: 10_000 });
    // README.md stays different: the dialog stays and says so after the run; nothing is offered for it.
    expect(await within(d).findByText(fill(ts['rest.afterPart_one'], { count: '1', dest: '/tmp/projects' }), {}, { timeout: 10_000 })).toBeInTheDocument();
    expect(sentChanges.some((x) => x.includes('README'))).toBe(false);
    expect(screen.queryAllByRole('button', { name: ts['rest.action'] })).toHaveLength(0);
  }, 40_000);

  it('the first copy finished meanwhile: opening it checks again, finds the copy whole, sends nothing', async () => {
    await cutCopy('folderCutFirst');
    await restButton();
    finishCopy('/home/ada/projects', '/tmp/projects');
    const d = await openRest();
    expect(await within(d).findByText(fill(ts['rest.whole'], { dest: '/tmp/projects' }), {}, { timeout: 10_000 })).toBeInTheDocument();
    expect(within(d).queryByRole('button', { name: ts['copy.primary'] })).toBeNull();
    await waitFor(() => expect(screen.queryAllByText(held, { exact: false })).toHaveLength(0), { timeout: 10_000 });
    expect(sentChanges).toEqual([FIRST]);
  }, 40_000);

  it('an item of the rest whose answer is lost is held in turn (C9): nothing after it is sent, never sent twice', async () => {
    addDir('/home/ada/projects/extra');
    await cutCopy('folderCutFirstLost', 4);
    const d = await openRest();
    await items(d);
    const go = within(d).getByRole('button', { name: ts['copy.primary'] });
    await waitFor(() => expect(go).toBeEnabled(), { timeout: 10_000 });
    await userEvent.click(go);
    await waitFor(() => expect(sentChanges).toEqual([FIRST, 'copy:/home/ada/projects/site>/tmp/projects/site']), { timeout: 10_000 });
    expect(await within(d).findByText(fill(ts['several.sumPending'], { name: 'site' }), { exact: false })).toBeInTheDocument();
    expect(sentChanges).toHaveLength(2);
    // The new hold is the site copy's, not the first copy's (that one was let go at the press).
    expect(screen.queryAllByText(held, { exact: false })).toHaveLength(0);
    expect(screen.getAllByText(fill(ts['held.copy'], { name: 'site', dest: '/tmp/projects/site' }), { exact: false }).length).toBeGreaterThan(0);
  }, 40_000);

  it('a missing item inside a folder that is there is listed by its path in the copy, and goes to that place', async () => {
    await cutCopy('folderCutFirst');
    // The first copy made site (empty) since: its two files are what is missing.
    addDir('/tmp/projects/site');
    await userEvent.click(screen.getAllByRole('button', { name: /check again/i })[0]!);
    const d = await openRest();
    const list = await items(d);
    expect(within(list).getAllByRole('listitem').map((li) => li.textContent)).toEqual([expect.stringMatching(/^site\/deploy\.sh/), expect.stringMatching(/^site\/config\.yaml/)]);
    const go = within(d).getByRole('button', { name: ts['copy.primary'] });
    await waitFor(() => expect(go).toBeEnabled(), { timeout: 10_000 });
    await userEvent.click(go);
    await waitFor(() => expect(sentChanges).toEqual([FIRST, 'copy:/home/ada/projects/site/deploy.sh>/tmp/projects/site/deploy.sh', 'copy:/home/ada/projects/site/config.yaml>/tmp/projects/site/config.yaml']), { timeout: 10_000 });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), { timeout: 10_000 });
  }, 40_000);

  it('after the run the copy is read again before it says what is left (every item made meanwhile: nothing sent, still read)', async () => {
    await cutCopy('folderCutFirst');
    const d = await openRest();
    await items(d);
    addDir('/tmp/projects/site');
    const go = within(d).getByRole('button', { name: ts['copy.primary'] });
    await waitFor(() => expect(go).toBeEnabled(), { timeout: 10_000 });
    await userEvent.click(go);
    expect(await within(d).findByText(ts['several.madeMeanwhile'])).toBeInTheDocument();
    // Read again: site is there and empty, so its two files are what is left (never the count read before the run).
    expect(await within(d).findByText(fill(ts['rest.afterPart'], { count: '2', dest: '/tmp/projects' }), {}, { timeout: 10_000 })).toBeInTheDocument();
    expect(within(d).queryByText(fill(ts['rest.afterPart'], { count: '3', dest: '/tmp/projects' }))).toBeNull();
    // The plan was taken once: what the read since finds changes the words, never the list the press ran.
    const after = within(await items(d)).getAllByRole('listitem');
    expect(after).toHaveLength(1);
    expect(after[0]!.textContent).toMatch(/^site(?!\/)/);
  }, 40_000);

  it('never offers Keep both: a missing item named like something at the top of the copy still goes to its own place', async () => {
    addFile('/home/ada/projects/site/README.md');
    await cutCopy('folderCutFirst', 4);
    // The first copy made site (empty) since: its three files are missing, one named like the copy's own README.md.
    addDir('/tmp/projects/site');
    // The right pane opens the copy, so its listing (README.md at its top) is read and kept.
    const right = await screen.findByRole('region', { name: strings['pane.b'] });
    const p = await within(await within(right).findByRole('table')).findByRole('row', { name: /projects/ });
    p.focus();
    await userEvent.keyboard('{Enter}');
    await within(await within(right).findByRole('table')).findByRole('row', { name: /README\.md/ });
    await userEvent.click(screen.getAllByRole('button', { name: /check again/i })[0]!);
    const d = await openRest();
    const list = await items(d);
    expect(within(list).getAllByRole('listitem').some((li) => /^site\/README\.md/.test(li.textContent ?? ''))).toBe(true);
    expect(within(d).queryByRole('radio')).toBeNull();
    expect(within(d).queryByText(ts['several.keepBoth'])).toBeNull();
  }, 40_000);

  it('offered before the copy went away: opened later, the copy is gone, so it says it could not check and sends nothing', async () => {
    await cutCopy('folderCutFirst');
    const b = await restButton();
    removeItem('/tmp/projects');
    await userEvent.click(b);
    const d = await screen.findByRole('dialog', { name: fill(ts['rest.title'], { name: 'projects' }) });
    expect(await within(d).findByText(fill(ts['rest.failed'], { dest: '/tmp/projects' }), {}, { timeout: 10_000 })).toBeInTheDocument();
    expect(within(d).queryByRole('button', { name: ts['copy.primary'] })).toBeNull();
    expect(within(d).getByRole('button', { name: (n, el) => /^close$/i.test(n) && !el.hasAttribute('data-dialog-close') })).toBeInTheDocument();
    expect(sentChanges).toEqual([FIRST]);
  }, 40_000);

  it('offered before a link Files cannot compare appeared in it: opened later, it says so, and sends nothing', async () => {
    await cutCopy('folderCutFirst');
    const b = await restButton();
    // A link whose target is given as an absolute path: copied as a link, never compared.
    addOdd('/home/ada/projects', ['latest=>/etc/hosts'], []);
    await userEvent.click(b);
    const d = await screen.findByRole('dialog', { name: fill(ts['rest.title'], { name: 'projects' }) });
    expect(await within(d).findByText(ts['rest.unchecked'], {}, { timeout: 10_000 })).toBeInTheDocument();
    expect(within(d).queryByRole('button', { name: ts['copy.primary'] })).toBeNull();
    expect(sentChanges).toEqual([FIRST]);
  }, 40_000);

  it('a held copy with only different items (nothing missing) offers no Copy the rest', async () => {
    await cutCopy('folderCutFirst');
    finishCopy('/home/ada/projects', '/tmp/projects');
    rewriteFile('/tmp/projects/README.md');
    // The count moves on a Check again whose reads have all answered (the SHA-256 reads are asked in steps).
    await waitFor(async () => {
      await userEvent.click(screen.getAllByRole('button', { name: /check again/i })[0]!);
      expect(screen.getAllByText(fill(ts['held.copyPartOne'], { dest: '/tmp/projects' }), { exact: false }).length).toBeGreaterThan(0);
    }, { timeout: 20_000, interval: 1_500 });
    expect(screen.queryAllByRole('button', { name: ts['rest.action'] })).toHaveLength(0);
  }, 40_000);

  it('offered before the copy went on: opened later, only different items are left, so nothing can be sent', async () => {
    await cutCopy('folderCutFirst');
    const b = await restButton();
    finishCopy('/home/ada/projects', '/tmp/projects');
    rewriteFile('/tmp/projects/README.md');
    await userEvent.click(b);
    const d = await screen.findByRole('dialog', { name: fill(ts['rest.title'], { name: 'projects' }) });
    expect(await within(d).findByText(fill(ts['rest.nothing'], { dest: '/tmp/projects' }), {}, { timeout: 10_000 })).toBeInTheDocument();
    expect(within(d).getByRole('button', { name: ts['copy.primary'] })).toBeDisabled();
    expect(sentChanges).toEqual([FIRST]);
    // Nothing was let go: the copy is still held.
    expect(screen.getAllByText(held, { exact: false }).length).toBeGreaterThan(0);
  }, 40_000);

  it('one press takes up to five folders, in order; the others wait for the next press, which the dialog then offers', async () => {
    for (let i = 1; i <= 6; i++) addDir(`/home/ada/projects/extra${i}`);
    await cutCopy('folderCutFirst', 9);
    const d = await openRest();
    const list = await items(d);
    expect(within(list).getAllByRole('listitem').map((li) => li.textContent?.split(/[^\w]/)[0])).toEqual(['site', 'extra1', 'extra2', 'extra3', 'extra4']);
    expect(within(d).getByText(fill(ts['rest.more'], { count: '2' }))).toBeInTheDocument();
    const go = within(d).getByRole('button', { name: ts['copy.primary'] });
    await waitFor(() => expect(go).toBeEnabled(), { timeout: 10_000 });
    await userEvent.click(go);
    await waitFor(() => expect(sentChanges).toHaveLength(6), { timeout: 10_000 });
    // Not whole yet: it stays open and says what is left after reading again.
    expect(await within(d).findByText(fill(ts['rest.afterPart'], { count: '2', dest: '/tmp/projects' }), {}, { timeout: 10_000 })).toBeInTheDocument();
    // The first copy is no longer held, so the band offers nothing: the next press is here, and it reads again first.
    expect(screen.queryAllByText(held, { exact: false })).toHaveLength(0);
    await userEvent.click(within(d).getByRole('button', { name: ts['rest.action'] }));
    const d2 = await screen.findByRole('dialog', { name: fill(ts['rest.title'], { name: 'projects' }) });
    const list2 = await items(d2);
    expect(within(list2).getAllByRole('listitem').map((li) => li.textContent?.split(/[^\w]/)[0])).toEqual(['extra5', 'extra6']);
    expect(within(d2).queryByText(fill(ts['rest.more'], { count: '2' }))).toBeNull();
    const go2 = within(d2).getByRole('button', { name: ts['copy.primary'] });
    await waitFor(() => expect(go2).toBeEnabled(), { timeout: 10_000 });
    await userEvent.click(go2);
    await waitFor(() => expect(sentChanges).toHaveLength(8), { timeout: 10_000 });
    expect(sentChanges.slice(6)).toEqual(['copy:/home/ada/projects/extra5>/tmp/projects/extra5', 'copy:/home/ada/projects/extra6>/tmp/projects/extra6']);
    // Whole now, read again: it closes.
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull(), { timeout: 10_000 });
  }, 90_000);

  it('missing items none of which can be sent are not called "nothing missing": it says each one says why', async () => {
    addFile('/home/ada/projects/ spaced ');
    await cutCopy('folderCutFirst', 4);
    const b = await restButton();
    finishCopy('/home/ada/projects', '/tmp/projects');
    removeItem('/tmp/projects/ spaced ');
    await userEvent.click(b);
    const d = await screen.findByRole('dialog', { name: fill(ts['rest.title'], { name: 'projects' }) });
    expect(await within(d).findByText(ts['rest.noneSendable'], {}, { timeout: 10_000 })).toBeInTheDocument();
    expect(within(d).queryByText(fill(ts['rest.nothing'], { dest: '/tmp/projects' }))).toBeNull();
    expect(within(d).getByRole('button', { name: ts['copy.primary'] })).toBeDisabled();
    expect(sentChanges).toEqual([FIRST]);
  }, 40_000);
});

