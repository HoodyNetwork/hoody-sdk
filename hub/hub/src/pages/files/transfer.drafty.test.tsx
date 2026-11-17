// The Copy / Move dialogs (one item and several) show From and To as a spec sheet (kit Facts, one column),
// the one-item dialog's refusal as one table-size warn Band, and a folder copy's link caveats behind a Disclosure while
// what it leaves out stays in view (it decides whether to press Copy).
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { addOdd, resetFiles } from './fixtures';
import page from './page';
import strings from './strings.en.json';
import ts from './Transfer.strings.en.json';

const fill = (s: string, v: Record<string, string>) => s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => v[k] ?? '');
const enc = encodeURIComponent;
const two = (ap: string, bp: string, state?: string) => ({ path: `/files?a=atlas.00a1&ap=${enc(ap)}&b=atlas.00a1&bp=${enc(bp)}`, ...(state ? { state } : {}) });
const paneA = () => screen.findByRole('region', { name: strings['pane.a'] });
const table = async () => within(await paneA()).findByRole('table', { name: fill(strings['table.label'], { name: 'atlas' }) });
const row = async (name: RegExp) => within(await table()).findByRole('row', { name });
const where = (path: string) => fill(ts.where, { computer: 'atlas', path });
async function copyOf(name: RegExp) {
  await userEvent.click(within(await row(name)).getByRole('button', { name: /actions|more/i }));
  await userEvent.click(await screen.findByRole('menuitem', { name: new RegExp(`^${ts['action.copy']}`) }));
  return screen.findByRole('dialog');
}
/** The spec sheet a path sits in: the kit Facts list named "Where it goes". */
const sheetOf = (d: HTMLElement, text: string) => within(d).getByText(text).closest('dl');

beforeAll(async () => {
  await import('./view');
}, 120_000);
beforeEach(() => resetFiles());

describe('copy / move dialogs', () => {
  it('one item: From and To are one spec sheet, both paths in it', async () => {
    await renderPage(page, two('/home/ada', '/tmp'));
    const d = await copyOf(/notes\.txt/);
    await within(d).findByText(where('/tmp/notes.txt'));
    const sheet = sheetOf(d, where('/home/ada/notes.txt'));
    expect(sheet?.getAttribute('aria-label')).toBe(ts.ends);
    expect(sheetOf(d, where('/tmp/notes.txt'))).toBe(sheet);
    expect(within(sheet!).getByText(ts.from)).toBeInTheDocument();
    expect(within(sheet!).getByText(ts.to)).toBeInTheDocument();
  });

  it('several items: From and To are the same spec sheet', async () => {
    await renderPage(page, two('/home/ada', '/tmp'));
    for (const n of [/notes\.txt/, /report\.pdf/]) await userEvent.click(within(await row(n)).getByRole('checkbox'));
    await userEvent.click(within(await paneA()).getByRole('button', { name: ts['action.copySelected'] }));
    const d = await screen.findByRole('dialog');
    const sheet = sheetOf(d, where('/home/ada'));
    expect(sheet?.getAttribute('aria-label')).toBe(ts.ends);
    expect(sheetOf(d, where('/tmp'))).toBe(sheet);
  });

  it('a refusal is one warn Band of table size, and the press stays off', async () => {
    await renderPage(page, two('/home/ada', '/srv/a/b/c/d/e'));
    const d = await copyOf(/projects/);
    const refusal = await within(d).findByText(fill(ts['walk.deep'], { name: 'projects' }));
    expect(refusal.closest('[role="alert"]')).not.toBeNull();
    expect(within(d).getByRole('button', { name: ts['copy.primary'] })).toBeDisabled();
  });

  it('why links stay links sits behind a closed Disclosure; that the copy cannot be checked and what it leaves out stay in view', async () => {
    addOdd('/home/ada/projects/site', ['out=>[external]'], ['run.pipe']);
    await renderPage(page, two('/home/ada', '/tmp'));
    const d = await copyOf(/projects/);
    const more = await within(d).findByRole('button', { name: ts['walk.linksMore'] });
    expect(more).toHaveAttribute('aria-expanded', 'false');
    expect(within(d).getByText(ts['walk.left'])).toBeVisible();
    expect(within(d).getByText(ts['walk.opaque'])).toBeVisible();
    expect(within(d).getByText(ts['walk.links'])).not.toBeVisible();
    await userEvent.click(more);
    expect(more).toHaveAttribute('aria-expanded', 'true');
    expect(within(d).getByText(ts['walk.links'])).toBeVisible();
  });

  it('a folder copy: its plan and the caveat that it cannot be checked are one Verdict plate; what it leaves out is a "Left out" section listing each path', async () => {
    addOdd('/home/ada/projects/site', ['out=>[external]'], ['run.pipe']);
    await renderPage(page, two('/home/ada', '/tmp'));
    const d = await copyOf(/projects/);
    const caveat = await within(d).findByText(ts['walk.opaque']);
    const plate = within(d).getByRole('group', { name: ts['plate.copy'] });
    expect(plate).toContainElement(caveat);
    expect(plate.textContent).toMatch(/projects/);
    const left = within(d).getByRole('region', { name: ts['left.title'] });
    expect(within(left).getByText(ts['walk.left'])).toBeInTheDocument();
    const paths = within(within(left).getByRole('list', { name: ts['left.title'] })).getAllByRole('listitem');
    expect(paths.map((li) => li.textContent)).toEqual([expect.stringMatching(/run\.pipe$/)]);
    // No loose status lines: every sentence sits in a kit part (Verdict, section, Band, Disclosure, Facts).
    expect(d.querySelectorAll('p[class*="note"]')).toHaveLength(0);
  });

  it('a taken name: the new name is the dialog\'s consequence (its description), not a loose line', async () => {
    await renderPage(page, two('/home/ada', '/home/ada/projects'));
    const first = await copyOf(/notes\.txt/);
    await userEvent.click(await within(first).findByRole('button', { name: ts['copy.primary'] }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const d = await copyOf(/notes\.txt/);
    const words = fill(ts['copy.taken'], { name: 'notes.txt', folder: '/home/ada/projects', newName: 'notes-1.txt' });
    await within(d).findByText(words);
    expect(d).toHaveAccessibleDescription(expect.stringContaining(words));
  });
});
