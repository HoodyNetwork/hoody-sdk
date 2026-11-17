// Vitest: the Home widget in its fixture states: balance and servers, the C9 rule (unknown is never 0 or "none"),
// View all, and the framed Hub that reads nothing.
import { renderPage, screen, userEvent, within } from '@app/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import page from './page';
import strings from './strings.en.json';

const mocked = vi.hoisted(() => ({
  framed: false,
  reads: 0,
  balance: null as null | Record<string, unknown>,
  subs: null as null | Record<string, unknown>,
  refetch: vi.fn(),
}));
vi.mock('@core', async (orig) => ({ ...(await orig<Record<string, unknown>>()), isFramed: () => mocked.framed }));
// The page's live reads, counted, and replaceable by one result a test sets: the framed Hub must call neither.
vi.mock('./data', async (orig) => {
  const a = await orig<{ useBalance: () => unknown; useSubs: () => unknown }>();
  return {
    ...a,
    useBalance: () => {
      mocked.reads++;
      return mocked.balance ?? a.useBalance();
    },
    useSubs: () => {
      mocked.reads++;
      return mocked.subs ?? a.useSubs();
    },
  };
});

async function show(state?: string) {
  return renderPage({ ...page, load: () => import('./widget') }, { state });
}

describe('billing widget', () => {
  beforeEach(() => {
    mocked.framed = false;
    mocked.reads = 0;
    mocked.balance = null;
    mocked.subs = null;
    mocked.refetch.mockReset();
  });

  it('is declared in the manifest between Home own cards and the rest', () => {
    expect(page.widgets).toEqual([expect.objectContaining({ id: 'billing', title: 'widget.title', order: 35 })]);
  });

  it('the manifest loads this widget, not another module', async () => {
    const m = (await page.widgets![0]!.load()) as { default: unknown };
    const own = (await import('./widget')) as { default: unknown };
    expect(m.default).toBe(own.default);
  });

  it('shows the balance and the servers that need money first', async () => {
    await show();
    expect(await screen.findByText('$42.50')).toBeInTheDocument();
    expect(screen.getByText(strings['widget.balance'])).toBeInTheDocument();
    const list = await screen.findByRole('list', { name: strings['widget.servers'] });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    // fra-7 is on hold: it leads and carries its status
    expect(rows[0]).toHaveTextContent('fra-7');
    expect(rows[0]).toHaveTextContent(/unpaid|on hold/i);
    // a healthy server shows its renewal date and no status pill
    expect(rows[1]).toHaveTextContent('n12');
    expect(rows[1]).not.toHaveTextContent(/active|unpaid|on hold/i);
  });

  it('has no View all of its own: the Home card frame gives it', async () => {
    await show();
    await screen.findByText('$42.50');
    expect(screen.queryByRole('button', { name: /view all/i })).toBeNull();
  });

  it('labels the rows as servers, and shows no label when there are none', async () => {
    await show();
    expect(await screen.findByText(strings['widget.servers'])).toBeInTheDocument();
  });

  it('the list is named by the same word its visible label shows', async () => {
    await show();
    const label = await screen.findByText(strings['widget.servers']);
    const list = await screen.findByRole('list', { name: label.textContent ?? '' });
    expect(list).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: strings['widget.title'] })).toBeNull();
  });

  it('a balance that did not load says so with Try again, never $0, and the servers still show', async () => {
    await show('widget-balance-error');
    expect(await screen.findByText(strings.balanceErr)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    expect(screen.queryByText(/\$0/)).toBeNull();
    expect(await screen.findByRole('list', { name: strings['widget.servers'] })).toBeInTheDocument();
  });

  it('servers that did not load say so, never "no paid servers", and the balance still shows', async () => {
    await show('widget-subs-error');
    expect(await screen.findByText(strings['subs.loadErr'])).toBeInTheDocument();
    expect(screen.queryByText(strings['widget.none'])).toBeNull();
    expect(await screen.findByText('$42.50')).toBeInTheDocument();
  });

  it('says there are no paid servers when the list is empty', async () => {
    await show('empty');
    expect(await screen.findByText(strings['widget.none'])).toBeInTheDocument();
    expect(await screen.findByText('$42.50')).toBeInTheDocument();
    expect(screen.queryByText(strings['widget.servers'])).toBeNull();
  });

  it('says the list is incomplete when the read stopped early', async () => {
    await show('partial');
    expect(await screen.findByText(/This list is incomplete: 4 of 9/)).toBeInTheDocument();
  });

  it('a framed Hub reads and shows nothing: one line and a way to the Hub tab', async () => {
    mocked.framed = true;
    await show();
    expect(await screen.findByText(strings['widget.framed'])).toBeInTheDocument();
    expect(screen.getByRole('link', { name: strings['top.framedOpen'] })).toBeInTheDocument();
    expect(screen.queryByText('$42.50')).toBeNull();
    // the protection is not reading: neither read is started, not only not shown
    expect(mocked.reads).toBe(0);
    expect(mocked.balance).toBeNull();
  });

  it('a refresh that failed keeps the last read but says it may be out of date, with a way to read again', async () => {
    mocked.balance = { isPending: false, isError: true, data: { general: '42.50' }, refetch: mocked.refetch };
    mocked.subs = { isPending: false, isError: true, data: { subs: [], partial: null }, refetch: mocked.refetch };
    await show();
    expect(await screen.findByText('$42.50')).toBeInTheDocument();
    expect(screen.getByText(strings['widget.stale'])).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(mocked.refetch).toHaveBeenCalledTimes(2);
  });

  it('a healthy read says nothing about being out of date', async () => {
    await show();
    await screen.findByText('$42.50');
    expect(screen.queryByText(strings['widget.stale'])).toBeNull();
  });

  it('a server whose setup failed or whose change is stuck says so in words, though nothing is payable', async () => {
    const sub = (id: string, state: string) => ({ id, state, server_name: id, paid_through: null, auto_renew: true, active_operation_id: null });
    mocked.balance = { isPending: false, isError: false, data: { general: '1.00' }, refetch: mocked.refetch };
    mocked.subs = { isPending: false, isError: false, data: { subs: [sub('fail-1', 'delivery_failed'), sub('stuck-1', 'change_stuck')], partial: null }, refetch: mocked.refetch };
    await show();
    const rows = within(await screen.findByRole('list', { name: strings['widget.servers'] })).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent(strings['subs.chipSetupFailed']);
    expect(rows[1]).toHaveTextContent(strings['subs.chipFinishing']);
  });

  it('an incomplete list that shows no row does not claim there are no paid servers', async () => {
    mocked.balance = { isPending: false, isError: false, data: { general: '1.00' }, refetch: mocked.refetch };
    mocked.subs = { isPending: false, isError: false, data: { subs: [], partial: { shown: 0, total: 3 } }, refetch: mocked.refetch };
    await show();
    expect(await screen.findByText(/This list is incomplete: 0 of 3/)).toBeInTheDocument();
    expect(screen.queryByText(strings['widget.none'])).toBeNull();
  });
});
