// Vitest: Add a program's computer list never says "no computers" or "no match" for a first page that is not the whole
// list. With more pages the list says so (a computer may be on a later page); a whole list that answered says none.
import { bootFixtureCore, CoreQueryProvider } from '@core';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BoardComputer } from '../computers';
import { Picker, type PickerProps } from './Picker';
import { SshForm } from './SshForm';
import strings from '../strings.en.json';

// A running computer's step also draws the apps launcher, which reads the page's router. These tests render the
// Picker alone and are about its own rows: the launcher never loads here (its place shows the loading rows).
vi.mock('../../apps/links', async (orig) => ({ ...(await orig<object>()), loadLauncher: () => new Promise<never>(() => {}) }));

const S = strings as Record<string, string>;
const t = (k: string, v: Record<string, unknown> = {}) => (S[k] ?? k).replace(/\{\{(\w+)\}\}/g, (_, x: string) => String(v[x]));
const pc = (id: string, name: string, status = 'running') => ({ id, name, project_id: 'p1', server_name: 'n12', status }) as BoardComputer;
const NONE = /No computers in Personal/;
const picker = (p: Partial<PickerProps>) => (
  <CoreQueryProvider>
    <Picker computers={null} failed={false} onRetry={() => {}} recents={[]} known={[]} onBoard={[]} realmName="Personal" onComputers={null} onPick={() => {}} {...p} />
  </CoreQueryProvider>
);

beforeEach(() => { bootFixtureCore({ rules: [] }); });
afterEach(() => { cleanup(); });

describe('Add a program: a first page that is not the whole list', () => {
  it('no rows on an incomplete page: says the list may be longer, never "no computers"', async () => {
    render(picker({ computers: [], failed: false, complete: false }));
    expect(await screen.findByText(t('picker.partial'))).toBeInTheDocument();
    expect(screen.queryByText(NONE)).toBeNull();
  });

  it('a search with no match on an incomplete page: says it may be further down the list, never that none of the computers match', async () => {
    render(picker({ computers: [pc('c1', 'atlas')], failed: false, complete: false }));
    await userEvent.setup().type(await screen.findByRole('searchbox'), 'zebra');
    expect(await screen.findByText(t('picker.noMatchTitle', { q: 'zebra' }))).toBeInTheDocument();
    expect(screen.getByText(t('picker.noMatchPartialBody'))).toBeInTheDocument();
    expect(screen.queryByText(t('picker.noMatchOfBody_one', { count: 1 }))).toBeNull();
    expect(screen.queryByText(/does not match|None of your/)).toBeNull();
  });

  it('a complete answer keeps "no computers" and "No computer matches"', async () => {
    const { unmount } = render(picker({ computers: [], failed: false, complete: true }));
    expect(await screen.findByText(NONE)).toBeInTheDocument();
    unmount();
    render(picker({ computers: [pc('c1', 'atlas')], failed: false }));
    await userEvent.setup().type(await screen.findByRole('searchbox'), 'zebra');
    // The computer step's empty state: its body also counts the list and names the search clear.
    expect(await screen.findByText('No computer matches “zebra”')).toBeInTheDocument();
    expect(screen.getByText('Your 1 computer does not match. Clear the search to see it.')).toBeInTheDocument();
  });
});

describe('Add a program: rows a later read failed over', () => {
  it('a search with no match, the last read failed: could not be read, never "No computer matches"', async () => {
    const onRetry = vi.fn();
    render(picker({ computers: [pc('c1', 'atlas')], failed: true, complete: true, onRetry }));
    await userEvent.setup().type(await screen.findByRole('searchbox'), 'zebra');
    expect(await screen.findByText(S['picker.failed']!)).toBeInTheDocument();
    expect(screen.queryByText(/No computer matches/)).toBeNull();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe('Launch an app: the chosen computer is missing from the rows', () => {
  const start = { step: 'app' as const, computer: 'c-missing' };
  it('a whole list that answered: the computer is gone', async () => {
    render(picker({ computers: [pc('c1', 'atlas')], failed: false, complete: true, start }));
    expect(await screen.findByText(S['picker.appGone']!)).toBeInTheDocument();
  });
  it('the last read failed: could not be read, never gone', async () => {
    render(picker({ computers: [pc('c1', 'atlas')], failed: true, complete: true, start }));
    expect(await screen.findByText(S['picker.failed']!)).toBeInTheDocument();
    expect(screen.queryByText(S['picker.appGone']!)).toBeNull();
  });
  it('a first page of a longer list: cannot be checked, never gone', async () => {
    render(picker({ computers: [pc('c1', 'atlas')], failed: false, complete: false, start }));
    expect(await screen.findByText(S['picker.appUnknown']!)).toBeInTheDocument();
    expect(screen.queryByText(S['picker.appGone']!)).toBeNull();
  });
});

describe('Connect over SSH: nothing running in rows that are not a proven whole list', () => {
  const cedar = pc('c3', 'cedar', 'stopped');
  it('from the picker, an incomplete page: the list may be longer, never "none is running"', async () => {
    render(picker({ computers: [cedar], failed: false, complete: false, start: { step: 'ssh' } }));
    expect(await screen.findByText(S['ssh.partial']!)).toBeInTheDocument();
    expect(screen.queryByText(/none is running/)).toBeNull();
  });
  it('a whole page: none is running', async () => {
    render(picker({ computers: [cedar], failed: false, complete: true, start: { step: 'ssh' } }));
    expect(await screen.findByText(/none is running/)).toBeInTheDocument();
  });
  it('the form itself: complete false says the list may be longer, no complete prop keeps none running', async () => {
    const { unmount } = render(<SshForm computers={[cedar]} failed={false} complete={false} taken={() => []} onPick={vi.fn()} onBack={vi.fn()} onRetry={() => {}} />);
    expect(await screen.findByText(S['ssh.partial']!)).toBeInTheDocument();
    unmount();
    render(<SshForm computers={[cedar]} failed={false} taken={() => []} onPick={vi.fn()} onBack={vi.fn()} onRetry={() => {}} />);
    expect(await screen.findByText(/none is running/)).toBeInTheDocument();
  });
});
