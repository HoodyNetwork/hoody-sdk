// ComputerRequired: the one "no computer / stopped / couldn't load" page state. It keeps the
// page's own header, and its way out (Open Computers) goes through the page links, so a hidden
// Computers page shows no button, never a dead route (there is no other Hub to send it to).
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type * as Core from '@core';
import type * as Nav from '@kit/nav';
import type { PageManifest } from '@kit/page';
import { AnatomySection } from '@kit/layouts/anatomy/Section';
import { ComputerRequired } from './ComputerRequired';
import { ShellDataProvider, type ShellData } from './context';
import { PagesProvider } from './pageLinks';
import strings from './strings.en.json';

const go = vi.fn();
vi.mock('@kit/nav', async (orig) => ({ ...(await orig<typeof Nav>()), useGo: () => go }));
// The account capability: a token session never has it.
const caps = vi.hoisted(() => ({ account: true }));
vi.mock('@core', async (orig) => ({ ...(await orig<typeof Core>()), useCan: (cap: string) => (cap === 'account' ? caps.account : true) }));

const page = (id: string) => ({ id, path: `/${id}`, title: id, strings: {}, status: 'ready' }) as unknown as PageManifest;
const inHub = (pages: PageManifest[], ui: ReactNode) => render(<PagesProvider pages={pages}>{ui}</PagesProvider>);

describe('ComputerRequired', () => {
  it('none: the page header, then "No computer selected" with the page\'s words and no action', () => {
    inHub([page('computers')], <ComputerRequired state="none" header={{ title: 'Programs' }} body="Pick a computer to see its programs." />);
    expect(screen.getByRole('heading', { name: 'Programs' })).toBeInTheDocument();
    expect(screen.getByText('No computer selected')).toBeInTheDocument();
    expect(screen.getByText('Pick a computer to see its programs.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('top: the page\'s own content sits under the header, above the state', () => {
    inHub([page('computers')], <ComputerRequired state="none" header={{ title: 'Scripts' }} top={<section aria-label="Builds">builds</section>} />);
    const heading = screen.getByRole('heading', { name: 'Scripts' });
    const top = screen.getByRole('region', { name: 'Builds' });
    const state = screen.getByText('No computer selected');
    expect(heading.compareDocumentPosition(top) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(top.compareDocumentPosition(state) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('none: a default body when the page gives none', () => {
    inHub([page('computers')], <ComputerRequired state="none" header={{ title: 'Logs' }} />);
    expect(screen.getByText('Pick a computer in the top bar.')).toBeInTheDocument();
  });

  it('stopped: names the computer; Open Computers goes through the router when Computers is served', () => {
    go.mockClear();
    inHub([page('computers')], <ComputerRequired state="stopped" name="box-1" header={{ title: 'Apps' }} />);
    expect(screen.getByText('box-1 is stopped')).toBeInTheDocument();
    expect(screen.getByText('Start it from Computers, then come back here.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open Computers' }));
    expect(go).toHaveBeenCalledWith('/computers');
  });

  it('stopped with Computers hidden: no Open Computers button (no dead route, no other Hub)', () => {
    go.mockClear();
    inHub([page('home')], <ComputerRequired state="stopped" header={{ title: 'Logs' }} />);
    expect(screen.getByText('This computer is stopped')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open Computers' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Open Computers' })).toBeNull();
    expect(go).not.toHaveBeenCalled();
  });

  it('failed: the kit error state with the page\'s words and Try again', async () => {
    const retry = vi.fn();
    inHub([page('computers')], <ComputerRequired state="failed" header={{ title: 'Schedules' }} title="Schedules couldn't load" body="This computer couldn't be checked right now." onRetry={retry} />);
    expect(screen.getByText("Schedules couldn't load")).toBeInTheDocument();
    expect(screen.getByText("This computer couldn't be checked right now.")).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    });
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('the page may replace the stopped title, body and action (e.g. a Start button of its own)', () => {
    inHub([page('computers')], <ComputerRequired state="stopped" name="box-1" header={{ title: 'Programs' }} title="This computer is stopped" body="box-1 is not running." action={<button type="button">Start box-1</button>} />);
    expect(screen.getByText('box-1 is not running.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start box-1' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open Computers' })).toBeNull();
  });

  it('body={null} shows no body in every state', () => {
    inHub([page('computers')], <ComputerRequired state="none" header={{ title: 'Logs' }} body={null} />);
    expect(screen.queryByText('Pick a computer in the top bar.')).toBeNull();
    document.body.innerHTML = '';
    inHub([page('computers')], <ComputerRequired state="stopped" header={{ title: 'Logs' }} body={null} />);
    expect(screen.queryByText(/Start it/)).toBeNull();
  });

  it('stopped with action={null}: no button, so the body does not send you to Computers', () => {
    inHub([page('computers')], <ComputerRequired state="stopped" header={{ title: 'Logs' }} action={null} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('Start it, then come back here.')).toBeInTheDocument();
  });
});


// C9: the none state says "No computer selected" (and offers the pick) only once the shell's computer
// list is known. While it loads: loading. When its read failed: not loaded, with the shell's Try again.
const box = { id: 'c1', name: 'box-1' };

describe('ComputerRequired: a computer list not known is never "none"', () => {
  const shell = (d: Partial<ShellData>): ShellData => ({ realms: [], realmId: 'all', computers: [], ...d });
  const none = (d: Partial<ShellData>) => (
    <PagesProvider pages={[page('computers')]}>
      <ShellDataProvider value={shell(d)}>
        <ComputerRequired state="none" header={{ title: 'Programs' }} title="No computer selected" body="Pick a computer to see its programs." />
      </ShellDataProvider>
    </PagesProvider>
  );

  it('loading: the page header and a loading state, not "No computer selected"', () => {
    render(none({ computersRead: 'loading', retryComputers: vi.fn() }));
    expect(screen.getByRole('heading', { name: 'Programs' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByText('No computer selected')).toBeNull();
    expect(screen.queryByText('Pick a computer to see its programs.')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('read failed: not loaded, with the shell\'s Try again, not "No computer selected"', async () => {
    const retry = vi.fn();
    render(none({ computersRead: 'unknown', retryComputers: retry }));
    expect(screen.getByRole('heading', { name: 'Programs' })).toBeInTheDocument();
    expect(screen.getByText(strings['top.computerNotLoaded'])).toBeInTheDocument();
    expect(screen.getByText(strings['cr.list.failedBody'])).toBeInTheDocument();
    expect(screen.queryByText('No computer selected')).toBeNull();
    expect(screen.queryByText('Pick a computer to see its programs.')).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    });
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('Try again by keyboard keeps the same button, focused, busy through its read and ready after it fails', async () => {
    const retry = vi.fn();
    const { rerender } = render(none({ computersRead: 'unknown', retryComputers: retry }));
    const again = screen.getByRole('button', { name: /try again/i });
    again.focus();
    await userEvent.keyboard('{Enter}');
    expect(retry).toHaveBeenCalledTimes(1);
    rerender(none({ computersRead: 'loading', retryComputers: retry }));
    expect(again).toBeInTheDocument();
    expect(again).toHaveAttribute('data-pending', 'true');
    expect(again).toHaveFocus();
    rerender(none({ computersRead: 'unknown', retryComputers: retry }));
    expect(again).toBeInTheDocument();
    expect(again).not.toHaveAttribute('data-pending', 'true');
    expect(again).toHaveFocus();
  });

  it('a later read the person did not ask for shows loading again', async () => {
    const retry = vi.fn();
    const { rerender } = render(none({ computersRead: 'unknown', retryComputers: retry }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    });
    rerender(none({ computersRead: 'loading', retryComputers: retry }));
    rerender(none({ computersRead: 'unknown', retryComputers: retry }));
    rerender(none({ computersRead: 'loading', retryComputers: retry }));
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('a Try again that fails before any loading render leaves no busy button for a later read', async () => {
    // The retry settles at once and the component never sees 'loading' (notifications batched): its attempt is over.
    const retry = vi.fn(() => Promise.resolve());
    const { rerender } = render(none({ computersRead: 'unknown', retryComputers: retry }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    });
    expect(retry).toHaveBeenCalledTimes(1);
    rerender(none({ computersRead: 'loading', retryComputers: retry }));
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('a Try again whose promise settles while its loading still shows keeps the busy button until the read ends', async () => {
    let done!: () => void;
    const retry = vi.fn(() => new Promise<void>((r) => { done = r; }));
    const { rerender } = render(none({ computersRead: 'unknown', retryComputers: retry }));
    const again = screen.getByRole('button', { name: /try again/i });
    again.focus();
    await act(async () => { fireEvent.click(again); });
    rerender(none({ computersRead: 'loading', retryComputers: retry }));
    await act(async () => { done(); });
    expect(again).toBeInTheDocument();
    expect(again).toHaveAttribute('data-pending', 'true');
    expect(again).toHaveFocus();
    rerender(none({ computersRead: 'unknown', retryComputers: retry }));
    expect(again).not.toHaveAttribute('data-pending', 'true');
    expect(again).toHaveFocus();
  });

  it('an older attempt settling late does not end a newer one', async () => {
    let first!: () => void;
    const calls: Array<Promise<void>> = [new Promise<void>((r) => { first = r; }), new Promise<void>(() => {})];
    const retry = vi.fn(() => calls.shift()!);
    const { rerender } = render(none({ computersRead: 'unknown', retryComputers: retry }));
    const again = screen.getByRole('button', { name: /try again/i });
    await act(async () => { fireEvent.click(again); });
    rerender(none({ computersRead: 'unknown', retryComputers: retry }));
    await act(async () => { fireEvent.click(again); });
    await act(async () => { first(); });
    rerender(none({ computersRead: 'loading', retryComputers: retry }));
    expect(again).toBeInTheDocument();
    expect(again).toHaveAttribute('data-pending', 'true');
  });

  it('read failed with no Try again from the shell: not loaded, and no dead button', () => {
    render(none({ computersRead: 'unknown' }));
    expect(screen.getByText(strings['top.computerNotLoaded'])).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByText('No computer selected')).toBeNull();
  });

  it('a known list with computers and none picked says "No computer selected", with the page\'s words', () => {
    render(none({ computers: [box] }));
    expect(screen.getByText('No computer selected')).toBeInTheDocument();
    expect(screen.getByText('Pick a computer to see its programs.')).toBeInTheDocument();
    expect(screen.queryByText(strings['cr.empty.title'])).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('the other states do not change with the list read', () => {
    render(
      <PagesProvider pages={[page('computers')]}>
        <ShellDataProvider value={shell({ computersRead: 'unknown', retryComputers: vi.fn() })}>
          <ComputerRequired state="stopped" name="box-1" header={{ title: 'Apps' }} />
        </ShellDataProvider>
      </PagesProvider>,
    );
    expect(screen.getByText('box-1 is stopped')).toBeInTheDocument();
    expect(screen.queryByText(strings['top.computerNotLoaded'])).toBeNull();
  });
});

// inline: for a host that is not a page (a pane in a drawer, From
// GitHub's Ready): no PageFrame and no PageHeader, so no h1 of its own; the host's section sets the heading level; the
// list's loading and not-loaded states are kept.
describe('ComputerRequired inline', () => {
  const shell = (d: Partial<ShellData>): ShellData => ({ realms: [], realmId: 'all', computers: [], ...d });
  const inline = (d: Partial<ShellData>, ui: ReactNode) => render(
    <PagesProvider pages={[page('computers')]}>
      <ShellDataProvider value={shell(d)}>{ui}</ShellDataProvider>
    </PagesProvider>,
  );

  it('none: the state only, no page header and no h1', () => {
    const { container } = inline({ computers: [box] }, <ComputerRequired inline state="none" body="Pick a computer to install on." />);
    expect(screen.getByText('No computer selected')).toBeInTheDocument();
    expect(screen.getByText('Pick a computer to install on.')).toBeInTheDocument();
    expect(container.querySelector('h1')).toBeNull();
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    expect(container.querySelector('[data-hub-title]')).toBeNull();
  });

  it('stopped: names the computer with Open Computers, no h1', () => {
    go.mockClear();
    const { container } = inline({}, <ComputerRequired inline state="stopped" name="box-1" />);
    expect(screen.getByText('box-1 is stopped')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open Computers' }));
    expect(go).toHaveBeenCalledWith('/computers');
    expect(container.querySelector('h1')).toBeNull();
  });

  it('keeps the list states: loading, then not loaded with the shell\'s Try again, never "No computer selected"', async () => {
    const retry = vi.fn();
    const a = inline({ computersRead: 'loading', retryComputers: retry }, <ComputerRequired inline state="none" />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByText('No computer selected')).toBeNull();
    a.unmount();
    const b = inline({ computersRead: 'unknown', retryComputers: retry }, <ComputerRequired inline state="none" />);
    expect(screen.getByText(strings['top.computerNotLoaded'])).toBeInTheDocument();
    expect(screen.queryByText('No computer selected')).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    });
    expect(retry).toHaveBeenCalledTimes(1);
    expect(b.container.querySelector('h1')).toBeNull();
  });

  it('anatomy: inside the host\'s section the section title is the only heading; the state\'s title is not one', () => {
    const { container } = inline({ computers: [box] }, (
      <AnatomySection id="host" title="Install">
        <ComputerRequired inline state="none" />
      </AnatomySection>
    ));
    expect(screen.getAllByRole('heading').map((h) => h.textContent)).toEqual(['Install']);
    expect(screen.getByText('No computer selected')).toBeInTheDocument();
    expect(container.querySelector('h1')).toBeNull();
  });
});

// A known list with no computer at all is not "pick one". In All realms the account has none: Get a computer (the
// Computers page's drawer). In one realm only that realm is empty (a computer in no realm counts for no realm): All realms.
// Pages pass their pick words (title, body, action); none of them shows here.
describe('ComputerRequired: no computers at all', () => {
  const shell = (d: Partial<ShellData>): ShellData => ({ realms: [], realmId: 'all', computers: [], ...d });
  const at = (d: Partial<ShellData>, ui: ReactNode, pages = [page('computers')]) => render(
    <PagesProvider pages={pages}>
      <ShellDataProvider value={shell(d)}>{ui}</ShellDataProvider>
    </PagesProvider>,
  );
  const pagePick = <ComputerRequired state="none" header={{ title: 'Programs' }} title="No computer selected" body="Pick a computer to see its programs." action={<button type="button">Pick</button>} />;

  it('says "No computers yet" with one Get a computer that opens the Computers page\'s drawer', () => {
    go.mockClear();
    at({}, pagePick);
    expect(screen.getByRole('heading', { name: 'Programs' })).toBeInTheDocument();
    expect(screen.getByText(strings['cr.empty.title'])).toBeInTheDocument();
    expect(screen.getByText(strings['cr.empty.body'])).toBeInTheDocument();
    expect(screen.queryByText('No computer selected')).toBeNull();
    expect(screen.queryByText('Pick a computer to see its programs.')).toBeNull();
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual([strings['cr.getComputer']]);
    fireEvent.click(screen.getByRole('button', { name: strings['cr.getComputer'] }));
    expect(go).toHaveBeenCalledWith('/computers?get=1');
  });

  it('inline: the same words and action, no h1', () => {
    const { container } = at({}, <ComputerRequired inline state="none" body="Pick a computer to install on." />);
    expect(screen.getByText(strings['cr.empty.title'])).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings['cr.getComputer'] })).toBeInTheDocument();
    expect(container.querySelector('h1')).toBeNull();
  });

  it('a session that cannot create a computer says so, with no dead button', () => {
    caps.account = false;
    try {
      at({}, pagePick);
      expect(screen.getByText(strings['cr.empty.title'])).toBeInTheDocument();
      expect(screen.getByText(strings['cr.empty.bodyCannot'])).toBeInTheDocument();
      expect(screen.queryByRole('button')).toBeNull();
    } finally {
      caps.account = true;
    }
  });

  it('with Computers hidden: the words alone, no dead button', () => {
    at({}, pagePick, [page('home')]);
    expect(screen.getByText(strings['cr.empty.title'])).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('while the list loads or failed it never says "No computers yet"', () => {
    const a = at({ computersRead: 'loading', retryComputers: vi.fn() }, pagePick);
    expect(screen.queryByText(strings['cr.empty.title'])).toBeNull();
    a.unmount();
    at({ computersRead: 'unknown', retryComputers: vi.fn() }, pagePick);
    expect(screen.queryByText(strings['cr.empty.title'])).toBeNull();
    expect(screen.getByText(strings['top.computerNotLoaded'])).toBeInTheDocument();
  });

  it('an empty realm while another realm holds computers: "No computers in this realm" with Show all realms', () => {
    const setRealm = vi.fn();
    at({ realmId: 'r1', setRealm, realms: [{ id: 'r1', name: 'Work', computers: 0 }, { id: 'r2', name: 'Home', computers: 2 }] }, pagePick);
    expect(screen.getByText(strings['cr.emptyRealm.title'])).toBeInTheDocument();
    expect(screen.queryByText(strings['cr.empty.title'])).toBeNull();
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual([strings['cr.showAllRealms']]);
    fireEvent.click(screen.getByRole('button', { name: strings['cr.showAllRealms'] }));
    expect(setRealm).toHaveBeenCalledWith('all');
  });

  it('an empty realm with no other realm counting a computer (one may be in no realm): still this realm only, with Show all realms', () => {
    const setRealm = vi.fn();
    at({ realmId: 'r1', setRealm, realms: [{ id: 'r1', name: 'Work', computers: 0 }, { id: 'r2', name: 'Home', computers: 0 }] }, pagePick);
    expect(screen.getByText(strings['cr.emptyRealm.title'])).toBeInTheDocument();
    expect(screen.getByText(strings['cr.emptyRealm.body'])).toBeInTheDocument();
    expect(screen.queryByText(strings['cr.empty.title'])).toBeNull();
    expect(screen.queryByText(strings['cr.empty.body'])).toBeNull();
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual([strings['cr.showAllRealms']]);
    fireEvent.click(screen.getByRole('button', { name: strings['cr.showAllRealms'] }));
    expect(setRealm).toHaveBeenCalledWith('all');
  });

  it('an empty realm in a session pinned to it (no realm switch): this realm only, no button', () => {
    at({ realmId: 'r1', realms: [{ id: 'r1', name: 'Work', computers: 0 }] }, pagePick);
    expect(screen.getByText(strings['cr.emptyRealm.title'])).toBeInTheDocument();
    expect(screen.getByText(strings['cr.emptyRealm.bodyPinned'])).toBeInTheDocument();
    expect(screen.queryByText(strings['cr.empty.title'])).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('a drawn page without a shell has no list to speak for: the pick words stay', () => {
    inHub([page('computers')], pagePick);
    expect(screen.getByText('No computer selected')).toBeInTheDocument();
    expect(screen.queryByText(strings['cr.empty.title'])).toBeNull();
  });
});
