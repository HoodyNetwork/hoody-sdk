// Get a computer inside a realm that lists none of the person's projects (the account's default project is in no
// realm, and a realm host lists only its own projects): the untouched form must never press a create core refuses
// unsent (empty :pid → ROUTE_PARAMS → "Nothing was sent"). It says why and sends nothing. A list still loading or
// unread sends nothing either, nor does a project picked earlier that the current list no longer holds. A refusal
// keeps its code and status: the kit's words for the Hub's own refusals, and Details.
// Every send is recorded the moment it is attempted, before any answer, so "sends nothing" means no attempt at all.
import * as core from '@core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import type * as Data from './data';
import page from './page';
import strings from './strings.en.json';
import kitStates from '@kit/states/strings.en.json';

type Mode = 'empty' | 'loading' | 'error' | 'errorCached' | 'real' | 'abc' | 'bc' | 'ab';
const rec = vi.hoisted(() => ({ calls: [] as { project: string; body: Record<string, unknown> }[], mode: 'empty' as string, refetch: 0, refuse: null as null | Record<string, unknown>, renders: new Set<() => void>() }));
vi.mock('./data', async (orig) => {
  const real = await orig<typeof Data>();
  const React = await import('react');
  return {
    ...real,
    useProjects: () => {
      const q = real.useProjects();
      // The page reads the hook again when a test changes the list (setMode), as a new answer would.
      const [, force] = React.useReducer((x: number) => x + 1, 0);
      React.useEffect(() => { rec.renders.add(force); return () => { rec.renders.delete(force); }; }, []);
      const err = Object.assign(new Error('x'), { status: 503, code: 'SERVICE_UNAVAILABLE' });
      if (rec.mode === 'empty') return { ...q, data: [] };
      if (rec.mode === 'loading') return { ...q, data: undefined, isError: false, isPending: true };
      if (rec.mode === 'error') return { ...q, data: undefined, isError: true, isPending: false, error: err, refetch: async () => { rec.refetch += 1; return q.refetch(); } };
      if (rec.mode === 'errorCached') return { ...q, isError: true, error: err };
      const abc = [{ id: 'pA', name: 'Alpha' }, { id: 'pB', name: 'Beta' }, { id: 'pC', name: 'Gamma' }];
      if (rec.mode === 'abc') return { ...q, data: abc as typeof q.data };
      if (rec.mode === 'bc') return { ...q, data: abc.slice(1) as typeof q.data };
      if (rec.mode === 'ab') return { ...q, data: abc.slice(0, 2) as typeof q.data };
      return q;
    },
    useCreate: () => {
      const m = real.useCreate();
      return {
        ...m,
        mutateAsync: async (v: { project: string; body: Record<string, unknown> }) => {
          rec.calls.push(v);
          if (rec.refuse) return rec.refuse as { outcome: 'failed' };
          // A made-up project id (abc lists) is answered here: the send itself is what the test reads.
          return v.project.startsWith('p') && v.project.length === 2 ? { outcome: 'done' as const } : m.mutateAsync(v);
        },
      };
    },
  };
});

const openCreate = async () => {
  await userEvent.click(await screen.findByRole('button', { name: strings['action.get'] }, { timeout: 8000 }));
  return screen.findByRole('dialog', { name: strings['create.title'] }, { timeout: 8000 });
};
const go = (d: HTMLElement) => within(d).getByRole('button', { name: strings['create.go'] });
const settle = () => new Promise((r) => setTimeout(r, 500));
const setMode = (m: Mode) => { rec.mode = m; };
const answer = async (m: Mode) => act(() => { setMode(m); rec.renders.forEach((f) => f()); });

describe('Get a computer: no project in the realm', () => {
  beforeEach(() => { rec.calls = []; rec.refetch = 0; rec.refuse = null; setMode('empty'); vi.restoreAllMocks(); });

  it('every default: says the realm has no project and sends nothing (never "Nothing was sent")', async () => {
    await renderPage(page, { path: '/computers' });
    const d = await openCreate();
    await userEvent.click(go(d));
    await settle();
    expect(rec.calls).toEqual([]);
    expect(within(d).queryByText(/Nothing was sent/)).toBeNull();
    expect(within(d).getByRole('alert')).toHaveTextContent(strings['create.error.noProject']);
  }, 40000);

  it('a token session pinned to its realm is never told to pick All realms', async () => {
    const real = core.realmsView();
    vi.spyOn(core, 'useRealms').mockReturnValue({ ...real, selected: 'all', pinned: real.rows?.[0]?.id ?? '0123456789abcdef01234567' });
    await renderPage(page, { path: '/computers' });
    const d = await openCreate();
    expect(within(d).getByRole('alert')).toHaveTextContent(strings['create.error.noProjectPinned']);
    expect(within(d).getByRole('alert')).not.toHaveTextContent(/All realms/);
  }, 40000);

  it('offers New project in place: it opens inside Get a computer, no other drawer, nothing sent', async () => {
    await renderPage(page, { path: '/computers' });
    const d = await openCreate();
    await userEvent.click(within(d).getByRole('button', { name: strings['create.newProject'] }));
    expect(within(d).getByRole('textbox', { name: strings['newp.name'] })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: strings['projd.newTitle'] })).toBeNull();
    expect(screen.getByRole('dialog', { name: strings['create.title'] })).toBe(d);
    expect(rec.calls).toEqual([]);
  }, 40000);

  it('projects still loading: says so, and Get computer sends nothing', async () => {
    setMode('loading');
    await renderPage(page, { path: '/computers' });
    const d = await openCreate();
    expect(within(d).getByText(strings['create.projectsLoading'])).toBeInTheDocument();
    expect(go(d)).toBeDisabled();
    await userEvent.click(go(d));
    await settle();
    expect(rec.calls).toEqual([]);
  }, 40000);

  it('projects unread: says so with a retry that reads them again, and sends nothing', async () => {
    setMode('error');
    await renderPage(page, { path: '/computers' });
    const d = await openCreate();
    const alert = within(d).getByRole('alert');
    expect(alert).toHaveTextContent(strings['create.projectsFail']);
    await userEvent.click(within(alert).getByRole('button', { name: kitStates['state.retry'] }));
    expect(rec.refetch).toBe(1);
    await userEvent.click(go(d));
    await settle();
    expect(rec.calls).toEqual([]);
  }, 40000);

  it('a failed re-read blocks the send even over cached projects (the retry shows)', async () => {
    setMode('errorCached');
    await renderPage(page, { path: '/computers' });
    const d = await openCreate();
    expect(within(d).getByRole('alert')).toHaveTextContent(strings['create.projectsFail']);
    expect(go(d)).toBeDisabled();
    await userEvent.click(go(d));
    await settle();
    expect(rec.calls).toEqual([]);
  }, 40000);

  it('a project picked when the drawer opened is not sent once the list no longer holds it', async () => {
    setMode('real');
    await renderPage(page, { path: '/computers' });
    const d = await openCreate();
    expect(go(d)).not.toBeDisabled();
    await answer('empty');
    await waitFor(() => expect(within(d).getByRole('alert')).toHaveTextContent(strings['create.error.noProject']));
    expect(go(d)).toBeDisabled();
    await userEvent.click(go(d));
    await settle();
    expect(rec.calls).toEqual([]);
  }, 40000);
});

describe('Get a computer: the project sent is the one shown', () => {
  beforeEach(() => { rec.calls = []; rec.refuse = null; setMode('abc'); vi.restoreAllMocks(); });
  const projectButton = (d: HTMLElement) => within(d).getByRole('button', { name: new RegExp(`${strings['field.project']}$`) });

  it('a project the person picked that the list loses is never swapped for another: it asks for a new pick', async () => {
    await renderPage(page, { path: '/computers' });
    const d = await openCreate();
    await userEvent.click(projectButton(d));
    await userEvent.click(await screen.findByRole('radio', { name: /^Gamma/ }));
    await answer('ab');
    await waitFor(() => expect(within(d).getByText(strings['create.error.projectGone'])).toBeInTheDocument());
    expect(go(d)).toBeDisabled();
    await userEvent.click(go(d));
    await settle();
    expect(rec.calls).toEqual([]);
    await userEvent.click(projectButton(d));
    await userEvent.click(await screen.findByRole('radio', { name: /^Beta/ }));
    expect(go(d)).not.toBeDisabled();
    await userEvent.click(go(d));
    await vi.waitFor(() => expect(rec.calls).toHaveLength(1));
    expect(rec.calls[0]!.project).toBe('pB');
  }, 40000);

  it('an untouched default follows the list, and the project shown is the one sent', async () => {
    await renderPage(page, { path: '/computers' });
    const d = await openCreate();
    expect(projectButton(d)).toHaveTextContent('Alpha');
    await answer('bc');
    await waitFor(() => expect(projectButton(d)).toHaveTextContent('Beta'));
    await userEvent.click(go(d));
    await vi.waitFor(() => expect(rec.calls).toHaveLength(1));
    expect(rec.calls[0]!.project).toBe('pB');
  }, 40000);
});

describe('Get a computer: a refusal keeps its code and status', () => {
  beforeEach(() => { rec.calls = []; rec.refuse = null; setMode('real'); vi.restoreAllMocks(); });

  it('a token session refusal says why, with the code under Details', async () => {
    rec.refuse = { outcome: 'not_sent', code: 'TOKEN_SESSION_REFUSED' };
    await renderPage(page, { path: '/computers' });
    const d = await openCreate();
    await userEvent.click(go(d));
    expect(await within(d).findByText(kitStates['err.tokenSession'], {}, { timeout: 8000 })).toBeInTheDocument();
    expect(rec.calls).toHaveLength(1);
    await userEvent.click(within(d).getByRole('button', { name: kitStates['err.details'] }));
    expect(await screen.findByText('TOKEN_SESSION_REFUSED', {}, { timeout: 8000 })).toBeInTheDocument();
  }, 40000);

  it('a definite refusal with an unmapped code keeps its status: never "no answer"', async () => {
    rec.refuse = { outcome: 'failed', code: 'SOMETHING_NEW', status: 409, route: 'POST /projects/:pid/computers' };
    await renderPage(page, { path: '/computers' });
    const d = await openCreate();
    await userEvent.click(go(d));
    await waitFor(() => expect(within(d).getByRole('button', { name: kitStates['err.details'] })).toBeInTheDocument());
    expect(within(d).queryByText(kitStates['err.noAnswer'])).toBeNull();
    await userEvent.click(within(d).getByRole('button', { name: kitStates['err.details'] }));
    expect(await screen.findByText('409', { exact: false }, { timeout: 8000 })).toBeInTheDocument();
  }, 40000);

  it("a refusal the form has its own sentence for says it in the footer, in place of the kit's words, and keeps Details", async () => {
    rec.refuse = { outcome: 'failed', code: 'COMPUTER_NAME_IN_USE', status: 409, route: 'POST /projects/:pid/computers' };
    await renderPage(page, { path: '/computers' });
    const d = await openCreate();
    await userEvent.click(go(d));
    expect(await within(d).findByText(strings['create.refused.COMPUTER_NAME_IN_USE'], {}, { timeout: 8000 })).toBeInTheDocument();
    expect(within(d).queryByText(kitStates['err.conflict'])).toBeNull();
    await userEvent.click(within(d).getByRole('button', { name: kitStates['err.details'] }));
    expect(await screen.findByText('COMPUTER_NAME_IN_USE', {}, { timeout: 8000 })).toBeInTheDocument();
    expect(rec.calls).toHaveLength(1);
  }, 40000);
});
