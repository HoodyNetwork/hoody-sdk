// Vitest: the delete planner with the Shared folders switch on. No plan and no Delete until a whole list of the
// folders this computer shares has been read since the dialog opened; a list that failed or holds rows it could not
// read shows the error with Check again (a read) and no Delete. A shared folder is judged by its own path and by where
// it resolves, so a link to it, or a link it is, still warns.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, userEvent, waitFor, within } from '@app/testing';
import type * as Data from './data';
import { DeletePlanner } from './DeletePlanner';
import type { DeleteItem } from './plan';
import type { ShareList } from './shares/wire';
import strings from './strings.en.json';

interface SharesQuery { data: ShareList | undefined; isError: boolean; error: unknown; isFetchedAfterMount: boolean; refetch: () => Promise<unknown> }
const h = vi.hoisted(() => ({
  shares: null as unknown, refetched: 0, reals: undefined as Data.RealPaths | undefined, realsAsked: [] as string[][], realRetried: 0,
}));
vi.mock('./data', async (importOriginal) => {
  const m = await importOriginal<typeof Data>();
  return {
    ...m,
    useHeldOn: () => [],
    usePlanReads: (_c: unknown, paths: readonly string[]) => ({ real: new Map(paths.map((p) => [p, p])), failed: false, mounts: { complete: true, items: [] }, retry: () => undefined }),
    useRealPaths: (_c: unknown, paths: readonly string[], enabled: boolean) => { if (enabled) h.realsAsked.push([...paths]); return enabled ? h.reals : undefined; },
    useCanChange: () => true,
    useFilesChange: () => ({ readBack: () => Promise.resolve(false), run: () => Promise.resolve({ outcome: 'done' }) }),
  };
});
vi.mock('./shares/data', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useShares: () => h.shares,
}));

const ATLAS = { id: 'c-atlas', name: 'atlas', project_id: 'p', server_name: 's', status: 'running', rules: 'open' } as Data.FilesComputer;
const file = (path: string): DeleteItem => ({ path, name: path.split('/').pop()!, dir: false, size: 10, modified: 1000 });
const share = (sourcePath: string) => ({ id: `sh-${sourcePath}`, sourceComputerId: 'c-atlas', sourcePath, mountPath: null, targetType: 'computer' as const, targetComputerId: 'c-cedar', targetProjectId: null, mode: 'readonly' as const, enabled: true, status: 'active' as const, statusMessage: null, expiresAt: null, expiryKnown: true });
const query = (over: Partial<SharesQuery>): SharesQuery => ({ data: undefined, isError: false, error: null, isFetchedAfterMount: false, refetch: () => { h.refetched += 1; return Promise.resolve(undefined); }, ...over });
const whole = (...paths: string[]): ShareList => ({ rows: paths.map(share), dropped: 0, of: 'given:c-atlas' });

beforeEach(() => {
  h.shares = null; h.refetched = 0; h.reals = { real: new Map() }; h.realsAsked = []; h.realRetried = 0;
});
afterEach(() => { window.history.replaceState({}, '', '/'); });

const open = (items: DeleteItem[] = [file('/home/ada/a.txt')]) => render(<DeletePlanner c={ATLAS} items={items} onClose={() => undefined} />);
const noDelete = () => expect(screen.queryByRole('button', { name: strings['action.delete'] })).toBeNull();

describe('delete planner with sharing on', () => {
  it('offers no plan while the share list is read, and reads it again on opening', async () => {
    h.shares = query({});
    open();
    expect(screen.getByText(strings['delete.checking'])).toBeInTheDocument();
    noDelete();
    await waitFor(() => expect(h.refetched).toBe(1));
  });

  it('does not judge from a list read before the dialog opened', () => {
    h.shares = query({ data: whole(), isFetchedAfterMount: false });
    open();
    expect(screen.getByText(strings['delete.checking'])).toBeInTheDocument();
    noDelete();
  });

  it('a list that failed shows the error with Check again, never a plan; Check again only reads', async () => {
    h.shares = query({ data: whole(), isError: true, error: new Error('SHARES_UNREADABLE'), isFetchedAfterMount: true });
    open();
    const d = screen.getByRole('alertdialog');
    expect(within(d).getByText(strings['delete.sharesFailed'])).toBeInTheDocument();
    noDelete();
    const before = h.refetched;
    await userEvent.click(within(d).getByRole('button', { name: strings['action.checkAgain'] }));
    expect(h.refetched).toBe(before + 1);
    noDelete();
  });

  it('a list holding rows it could not read is not whole: the error with Check again, no Delete', () => {
    h.shares = query({ data: { ...whole('/srv/data'), dropped: 1 }, isFetchedAfterMount: true });
    open();
    expect(screen.getByText(strings['delete.sharesFailed'])).toBeInTheDocument();
    noDelete();
  });

  it('a whole fresh list: a file in a shared folder says so and asks for its name', () => {
    h.shares = query({ data: whole('/home/ada'), isFetchedAfterMount: true });
    open();
    expect(screen.getByText(strings['delete.shared'])).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('a whole fresh list without that folder: a plain confirm', () => {
    h.shares = query({ data: whole('/srv/data'), isFetchedAfterMount: true });
    open();
    expect(screen.queryByText(strings['delete.shared'])).toBeNull();
    expect(screen.getByRole('button', { name: strings['action.delete'] })).toBeInTheDocument();
  });

  it('waits for where each shared folder resolves, then warns for a file under a shared folder given by its link', () => {
    h.shares = query({ data: whole('/home/ada/link'), isFetchedAfterMount: true });
    h.reals = undefined;
    const { unmount } = open([file('/mnt/real/a.txt')]);
    expect(screen.getByText(strings['delete.checking'])).toBeInTheDocument();
    noDelete();
    expect(h.realsAsked.at(-1)).toEqual(['/home/ada/link']);
    unmount();
    h.reals = { real: new Map([['/home/ada/link', '/mnt/real']]) };
    open([file('/mnt/real/a.txt')]);
    expect(screen.getByText(strings['delete.shared'])).toBeInTheDocument();
  });

  it('a shared folder whose resolution failed: the error with Check again (reads only), never a plan without the warning', async () => {
    h.shares = query({ data: whole('/home/ada/link'), isFetchedAfterMount: true });
    h.reals = { failed: true, error: new Error('REALPATH_UNREADABLE'), retry: () => { h.realRetried += 1; } };
    open([file('/mnt/real/a.txt')]);
    const d = screen.getByRole('alertdialog');
    expect(within(d).getByText(strings['delete.sharesUnresolved'])).toBeInTheDocument();
    noDelete();
    await userEvent.click(within(d).getByRole('button', { name: strings['action.checkAgain'] }));
    expect(h.realRetried).toBe(1);
    noDelete();
  });
});
