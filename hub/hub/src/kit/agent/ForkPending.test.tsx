// ForkPending: the band of unconfirmed forks - one line per record, Check again and Hide, hidden rows only where asked for, and a Check that finds the chat.
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ForkPending } from './ForkPending';
import type { ForkOutcome, ForkRowView } from './source';
import strings from './ForkPending.strings.en.json';

const toasts = vi.hoisted(() => [] as Array<{ title: string; body?: string; tone?: string; action?: unknown }>);
vi.mock('../states/Toast', async (orig) => ({ ...(await orig<Record<string, unknown>>()), showToast: (c: (typeof toasts)[number]) => { toasts.push(c); return 'k'; } }));
beforeEach(() => { toasts.length = 0; });

const row = (o: Partial<ForkRowView> = {}): ForkRowView => ({ k1: 'hx-1', parent: 's', turn: 1, bad: false, hidden: false, mine: false, ...o });
afterEach(() => cleanup());

describe('ForkPending', () => {
  it('draws nothing when nothing is pending', () => {
    const { container } = render(<ForkPending rows={[]} check={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
  it('one line per record, named by its reply, with Check again and Hide', () => {
    render(<ForkPending rows={[row(), row({ k1: 'hx-2', turn: null }), row({ k1: 'hx-3', parent: null, bad: true })]} check={vi.fn()} hide={vi.fn()} />);
    expect(screen.getByText(new RegExp(strings['fp.title'].replace('{{n}}', '2')))).toBeTruthy();
    expect(screen.getByText(new RegExp(strings['fp.titleWhole']))).toBeTruthy();
    expect(screen.getByText(new RegExp(strings['fp.titleBad'].replace(/[()]/g, '\\$&')))).toBeTruthy();
    expect(screen.getAllByRole('button', { name: strings['fp.check'] })).toHaveLength(3);
    expect(screen.getAllByRole('button', { name: strings['fp.hide'] })).toHaveLength(3);
  });
  it('a fork this page is making now shows Forking and no actions', () => {
    render(<ForkPending rows={[row({ mine: true })]} check={vi.fn()} hide={vi.fn()} />);
    expect(screen.getByText(new RegExp(strings['fp.making']))).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });
  it('hidden rows: omitted by default, shown labelled Hidden (and not hideable) where asked', () => {
    const { rerender } = render(<ForkPending rows={[row({ hidden: true })]} check={vi.fn()} hide={vi.fn()} />);
    expect(screen.queryByRole('button')).toBeNull();
    rerender(<ForkPending rows={[row({ hidden: true })]} check={vi.fn()} hide={vi.fn()} hidden="label" />);
    expect(screen.getByText(new RegExp(strings['fp.hidden']))).toBeTruthy();
    expect(screen.getByRole('button', { name: strings['fp.check'] })).toBeTruthy();
    expect(screen.queryByRole('button', { name: strings['fp.hide'] })).toBeNull();
  });
  it('Check again shows Checking while it runs, then an unknown outcome\'s words on the row; it never opens on it', async () => {
    let done!: (o: ForkOutcome) => void;
    const check = vi.fn(() => new Promise<ForkOutcome>((r) => { done = r; }));
    const onOpened = vi.fn();
    render(<ForkPending rows={[row()]} check={check} onOpened={onOpened} />);
    await userEvent.click(screen.getByRole('button', { name: strings['fp.check'] }));
    expect(check).toHaveBeenCalledWith('hx-1');
    expect(screen.getByText(new RegExp(strings['fp.checking']))).toBeTruthy();
    expect(screen.getByRole('button', { name: strings['fp.check'] })).toBeDisabled();
    await act(async () => { done({ k: 'unknown', k1: 'hx-1', words: 'Not confirmed yet: the computer is busy.', reason: 'busy' }); });
    await waitFor(() => expect(screen.getByText(/the computer is busy\./)).toBeTruthy());
    expect(onOpened).not.toHaveBeenCalled();
    // The row is still there, so the words stay on it: no toast, and nothing that reads as made or failed.
    expect(toasts).toHaveLength(0);
    expect(screen.getByRole('button', { name: strings['fp.check'] })).toBeTruthy();
  });
  // A Check that ENDS the fork drops the record: the host's next read has no such row, and the band or list may unmount. The result is a toast.
  it.each([
    ['none', 'No fork was made.', 'info'],
    ['gone', 'The chat is gone.', 'warn'],
    ['unconfirmed', 'The computer never confirmed it.', 'warn'],
    ['untracked', 'This fork is no longer tracked.', 'info'],
    ['notRemembered', 'This computer cannot be reached from here.', 'info'],
  ] as const)('a Check that ends the fork (%s) is said in a toast that outlives its row, with the row\'s own name', async (reason, words, tone) => {
    const check = vi.fn(async (): Promise<ForkOutcome> => ({ k: 'refused', words, reason }));
    const { rerender, container } = render(<ForkPending rows={[row({ turn: 2 })]} check={check} />);
    await userEvent.click(screen.getByRole('button', { name: strings['fp.check'] }));
    // The host re-reads and the row is gone; the band is empty now.
    rerender(<ForkPending rows={[]} check={check} />);
    expect(container).toBeEmptyDOMElement();
    await waitFor(() => expect(toasts).toHaveLength(1));
    expect(toasts[0]).toMatchObject({ title: strings['fp.result'].replace('{{title}}', strings['fp.title'].replace('{{n}}', '3')), body: words, tone });
    expect(toasts[0]!.tone, 'a settled ending is never an error or an unknown outcome').not.toMatch(/error|unknown|ok/);
  });
  it('an opened outcome toasts nothing (the host opens the chat)', async () => {
    render(<ForkPending rows={[row()]} check={async () => ({ k: 'opened', sid: 'sess-9' })} onOpened={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: strings['fp.check'] }));
    await waitFor(() => expect(screen.getByRole('button', { name: strings['fp.check'] })).not.toBeDisabled());
    expect(toasts).toHaveLength(0);
  });
  it('a Check that finds the chat hands its id to the host', async () => {
    const onOpened = vi.fn();
    render(<ForkPending rows={[row()]} check={async () => ({ k: 'opened', sid: 'sess-9' })} onOpened={onOpened} />);
    await userEvent.click(screen.getByRole('button', { name: strings['fp.check'] }));
    await waitFor(() => expect(onOpened).toHaveBeenCalledWith('sess-9'));
  });
  // The answer was decided for an account that stopped being the shown one after the host's last look. Read in the turn the band acts, `guard.still()` says so.
  it.each([
    ['opened', { k: 'opened', sid: 's-new' }],
    ['refused', { k: 'refused', words: 'No fork was made.', reason: 'none' }],
    ['unknown', { k: 'unknown', words: 'Not confirmed yet: the computer is busy.', reason: 'busy', k1: 'hx-1' }],
  ] as const)('an %s answer decided for an account that is no longer shown opens nothing, toasts nothing and says unknown (account) on the row', async (_n, base) => {
    let shown = true;
    const guard = { still: () => shown, moved: { words: 'This answer was for another account.', k1: 'hx-1' } };
    const check = vi.fn(async (): Promise<ForkOutcome> => { const o = { ...base, guard } as ForkOutcome; shown = false; return o; });
    const onOpened = vi.fn();
    render(<ForkPending rows={[row()]} check={check} onOpened={onOpened} />);
    await userEvent.click(screen.getByRole('button', { name: strings['fp.check'] }));
    await waitFor(() => expect(screen.getByText(/This answer was for another account\./)).toBeTruthy());
    expect(onOpened).not.toHaveBeenCalled();
    expect(toasts).toHaveLength(0);
  });
  it('the same answer while its account IS still shown is acted on as before', async () => {
    const check = vi.fn(async (): Promise<ForkOutcome> => ({ k: 'opened', sid: 's-new', guard: { still: () => true, moved: { words: 'x', k1: 'hx-1' } } }));
    const onOpened = vi.fn();
    render(<ForkPending rows={[row()]} check={check} onOpened={onOpened} />);
    await userEvent.click(screen.getByRole('button', { name: strings['fp.check'] }));
    await waitFor(() => expect(onOpened).toHaveBeenCalledWith('s-new'));
  });
  it('Hide goes to the host with the row\'s key', async () => {
    const hide = vi.fn(async () => true);
    render(<ForkPending rows={[row({ k1: 'hx-7' })]} check={vi.fn()} hide={hide} />);
    await userEvent.click(screen.getByRole('button', { name: strings['fp.hide'] }));
    expect(hide).toHaveBeenCalledWith('hx-7');
  });
  it('one line per other computer and realm', () => {
    render(<ForkPending rows={[]} check={vi.fn()} elsewhere={[{ computer: 'atlas.1234', realm: 'global', n: 2 }]} />);
    expect(screen.getByText(strings['fp.elsewhere'].replace('{{computer}}', 'atlas.1234').replace('{{realm}}', 'global').replace('{{n}}', '2'))).toBeTruthy();
  });
});
