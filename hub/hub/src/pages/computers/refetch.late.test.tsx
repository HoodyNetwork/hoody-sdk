// Reads that are read again late (held by the fixture until the test releases them). A kept answer may be stale: Copy sends nothing
// while the realm's list is read again, and still nothing once that read drops the destination. The computers list
// and the by-id project reads keep their rows while read again, then show exactly the fresh answer (a dropped row
// goes, a same-id rename and recolour shows). The by-id reads stop at their bound (MISSING_READS).
import { beforeEach, describe, expect, it } from 'vitest';
import { fixtureWorld } from '@core';
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { MISSING_READS } from './data';
import { computers, copySends, held, missingIds51, projectSends } from './fixtures';
import { handleOf } from './logic';
import page from './page';
import strings from './strings.en.json';

const [HOME, ACME] = fixtureWorld.projects;
if (!HOME || !ACME) throw new Error('fixture projects');
const rowOf = async (name: string) => (await screen.findByText(name, { selector: 'h3, strong' }, { timeout: 8000 })).closest('[data-row-id]') as HTMLElement;
const oneReads = () => projectSends.filter((x) => x.method === 'GET' && /\/projects\/[^/]+$/.test(x.path));

beforeEach(() => {
  held.release();
  projectSends.length = 0;
  copySends.length = 0;
});
// Let every held answer go (inside act: the page re-renders on it).
const release = () => act(async () => { held.release(); });
const names = (): string[] => screen.queryAllByText((_, e) => (e?.tagName === 'STRONG' || e?.tagName === 'H3') && computers.some((c) => c.name === e.textContent)).map((e) => e.textContent ?? '');

describe('reads read again late', () => {
  it('Copy on the page: while the realm\'s list is read again nothing is sent, and nothing once it drops the destination', async () => {
    const c = computers.find((x) => x.project_id === HOME.id);
    if (!c) throw new Error('fixture computer in Home');
    const { queryClient } = await renderPage(page, { path: `/computers?sel=${encodeURIComponent(handleOf(c))}&tab=ports`, state: 'projectsRefetchDrops' });
    await userEvent.click(await screen.findByRole('button', { name: strings['menu.actions'].replace('{{name}}', c.name) }, { timeout: 8000 }));
    await userEvent.click(await screen.findByRole('menuitem', { name: strings['menu.copy'] }));
    const dlg = await screen.findByRole('dialog');
    const go = () => within(dlg).getByRole('button', { name: strings['copyd.go'] });
    // The cached destination: Make copy is offered.
    await waitFor(() => expect(go()).toBeEnabled(), { timeout: 8000 });
    // The realm's list is read again (as on a refresh); its answer is held until released below.
    await act(async () => {
      void queryClient.invalidateQueries();
    });
    await waitFor(() => expect(held.waiting).toBe(1), { timeout: 8000 });
    // While it is in flight: the projects load again and Make copy is disabled.
    expect(await within(dlg).findByText(strings['create.projectsLoading'], {}, { timeout: 8000 })).toBeInTheDocument();
    expect(within(dlg).queryByText(strings['copyd.noProject'])).toBeNull();
    expect(go()).toBeDisabled();
    await userEvent.click(go());
    expect(copySends).toHaveLength(0);
    // The late answer holds no project: the destination is gone, and Make copy stays blocked.
    await release();
    expect(await within(dlg).findByText(strings['copyd.noProject'], {}, { timeout: 8000 })).toBeInTheDocument();
    expect(go()).toBeDisabled();
    await userEvent.click(go());
    expect(copySends).toHaveLength(0);
  });

  it('the computers list keeps its rows while read again, then drops only the row the fresh answer lacks', async () => {
    const all = computers.map((c) => c.name).sort();
    const dropped = computers[1]?.name;
    if (!dropped || all.length < 3) throw new Error('fixture computers');
    await renderPage(page, { path: '/computers', state: 'listRefetchDrops' });
    await rowOf(dropped);
    await waitFor(() => expect(names().sort()).toEqual(all), { timeout: 8000 });
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(held.waiting).toBe(1), { timeout: 8000 });
    // In flight: every row stays (no empty list, no loading in place of the rows).
    expect(names().sort()).toEqual(all);
    // Answered: exactly the dropped computer is gone.
    await release();
    await waitFor(() => expect(names().sort()).toEqual(all.filter((n) => n !== dropped)), { timeout: 8000 });
  });

  it('an outside project read again by id keeps its row in flight, then shows the same id\'s new name and colour', async () => {
    await renderPage(page, { path: '/computers/projects', state: 'projectOutsideRenames' });
    const before = await rowOf(ACME.name);
    const dotBefore = before.querySelector('[data-computer-color]')?.getAttribute('data-computer-color');
    expect(dotBefore).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    // Only Acme's read again is held: wait for exactly that one.
    await waitFor(() => expect(held.waiting).toBe(1), { timeout: 8000 });
    // In flight: the kept row stays, and the page never says "No projects".
    expect(screen.getByText(ACME.name, { selector: 'h3, strong' })).toBeInTheDocument();
    expect(screen.queryByText(strings['proj.empty'])).toBeNull();
    await release();
    // Answered: the same project, renamed and recoloured, still tagged outside; the old name is gone.
    const after = await rowOf('Acme Renamed');
    // The row id is a handle (name.idSuffix): the suffix names the same project.
    const suffix = (e: HTMLElement) => e.getAttribute('data-row-id')?.split('.').pop();
    expect(suffix(after)).toBe(suffix(before));
    expect(after).toHaveTextContent(strings['proj.outside']);
    expect(dotBefore).not.toBe('#EC4899');
    expect(after.querySelector('[data-computer-color]')).not.toBeNull();
    expect(after.querySelector('[data-computer-color]')!.getAttribute('data-computer-color')).toBe('#EC4899');
    expect(screen.queryByText(ACME.name, { selector: 'h3, strong' })).toBeNull();
  });

  it('51 missing projects: only the first 50 are read by id', async () => {
    expect(MISSING_READS).toBe(50);
    await renderPage(page, { path: '/computers/projects', state: 'missing51' });
    await waitFor(() => expect(oneReads()).toHaveLength(MISSING_READS), { timeout: 8000 });
    await new Promise((r) => setTimeout(r, 300));
    const read = oneReads().map((x) => x.path.split('/').pop());
    expect(read).toHaveLength(MISSING_READS);
    expect(new Set(read)).toEqual(new Set(missingIds51.slice(0, MISSING_READS)));
    expect(read).not.toContain(missingIds51[MISSING_READS]);
  });
});
