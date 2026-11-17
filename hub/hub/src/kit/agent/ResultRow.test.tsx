// Vitest: under a finished reply, what the turn made. A site only from the reply's own
// link to a running web port of yours (Open in a new tab, ⋯ Copy and Put on Board); "N files changed" with Review only when the
// turn's edit tools changed files. Nothing while the reply streams. The Edits tab shows each file's change, text only, a key in it
// hidden, and Open in Files; a write's content is never shown.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setProxyDomain } from '../../core/hosts';
import { can, type Action, type CapFacts } from './capability';
import { DetailsPanel } from './DetailsPanel';
import { LinkHost, type HostComputer, type HostComputers, type LinkHostValue } from './linkHost';
import { ResultRow } from './ResultRow';
import { SessionView } from './SessionView';
import type { ConvBlock, ConvSnapshot, ConversationSource, EditView } from './source';

const PROXY = 'computers.hoody.test';
const P = 'a'.repeat(24);
const C = 'b'.repeat(24);
const atlas: HostComputer = { id: C, project: P, name: 'atlas' };
const list = (status: string): HostComputers => ({ rows: [{ id: C, project_id: P, name: 'atlas', status, server_name: 'sg1' }], complete: true, failed: false });
const hostOf = (status = 'running', more: Partial<LinkHostValue> = {}): LinkHostValue => ({ realm: 'global', lives: atlas, runs: atlas, computers: list(status), openHub: () => undefined, ...more });
const port = (n: number) => `https://${P}-${C}-http-${n}.sg1.${PROXY}`;
const KEY = 'abcdefghijklmnop1234';

beforeEach(() => setProxyDomain(PROXY));
afterEach(() => { cleanup(); setProxyDomain(null); vi.restoreAllMocks(); });

describe('ResultRow', () => {
  it('a reply linking a running web port of yours: Site, Open in a new tab, ⋯ with Copy and Put on Board', () => {
    const add = vi.fn(() => '/board?add=x');
    const openHub = vi.fn();
    render(<LinkHost value={hostOf('running', { boardAdd: add, openHub })}><ResultRow text={`Running at ${port(3000)}/app now.`} /></LinkHost>);
    const row = document.querySelector('[data-result-site]') as HTMLElement;
    expect(row.textContent).toContain('atlas');
    const win = vi.spyOn(window, 'open').mockReturnValue(null);
    fireEvent.click(within(row).getByRole('button', { name: /in a new tab/ }));
    expect(win).toHaveBeenCalledWith(`${port(3000)}/app`, '_blank', 'noopener,noreferrer');
    // The address holds the computer's ids: it is in no href or text of the page.
    expect(document.body.innerHTML).not.toContain(C);
    fireEvent.click(within(row).getByRole('button', { name: /More/i }));
    expect(screen.getByRole('menuitem', { name: /Copy/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('menuitem', { name: /Board/ }));
    expect(openHub).toHaveBeenCalledWith('/board?add=x');
  });
  it('no site is guessed: no link, a stopped computer, another site, or no host', () => {
    const none = (text: string, host: LinkHostValue | null) => {
      const { container, unmount } = render(<LinkHost value={host}><ResultRow text={text} /></LinkHost>);
      expect(container.querySelector('[data-result-row]')).toBeNull();
      unmount();
    };
    none('All done, nothing to open.', hostOf());
    none(`It ran at ${port(3000)}.`, hostOf('stopped'));
    none('See https://example.com/docs.', hostOf());
    none(`It ran at ${port(3000)}.`, null);
  });
  it('the files count, and Review only where the chat has Details', () => {
    const onReview = vi.fn();
    const { rerender } = render(<ResultRow text="Done." files={3} onReview={onReview} />);
    expect(screen.getByText('3 files changed')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Review the 3 changed files in Details' }));
    expect(onReview).toHaveBeenCalledTimes(1);
    rerender(<ResultRow text="Done." files={1} />);
    expect(screen.getByText('1 file changed')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Review/ })).toBeNull();
  });
});

const facts: CapFacts = {
  mode: 'read', backend: 'native', reach: 'ok', state: 'running', daemonPaused: false, approval: 'default', firstTurnStarted: true,
  turn: true, gate: null, gateBlocked: false, decisionPending: false, queued: false, children: false, shells: false, unsettledSends: 0,
  prereq: { journal: true, recovery: true, attachment: true, approver: 'notNeeded' },
} as unknown as CapFacts;
const reply = (o: Partial<Extract<ConvBlock, { k: 'reply' }>> = {}): ConvBlock => ({ k: 'reply', key: 'r1', text: 'Done.', streaming: false, final: true, cost: null, at: null, files: 2, ...o });
const sourceOf = (s: ConvSnapshot): ConversationSource => ({
  kind: 'session', ref: { computer: 'atlas.1234', realm: 'global', sid: 's1' }, snapshot: () => s, subscribe: () => () => {}, watch: () => {}, can: (a: Action) => can(a, s.facts),
});
const snapOf = (blocks: ConvBlock[], edits: EditView[] = []): ConvSnapshot => ({ facts, title: 't', blocks, gates: [], meta: { computer: 'atlas', realm: 'Work', status: 'idle' }, edits } as unknown as ConvSnapshot);

describe('in the conversation', () => {
  it('under a finished reply only, never while it streams', () => {
    const { container, rerender } = render(<SessionView source={sourceOf(snapOf([reply({ streaming: true, final: false })]))} size="l" onReview={() => {}} />);
    expect(container.querySelector('[data-result-row]')).toBeNull();
    rerender(<SessionView source={sourceOf(snapOf([reply()]))} size="l" onReview={() => {}} />);
    expect(container.querySelector('[data-result-files]')?.textContent).toContain('2 files changed');
  });
});

describe('the Edits tab', () => {
  const edits: EditView[] = [
    { id: 'a', path: 'src/app.ts', verb: 'edited', diff: { old: `token = "sk-${KEY}"`, new: 'token = env.TOKEN' }, open: '/files?computer=atlas.1234&path=%2Fsrc' },
    { id: 'b', path: 'README.md', verb: 'written', meta: '120 characters written' },
    { id: 'c', path: 'src/maybe.css', verb: 'edited', diff: { old: 'red', new: 'blue' }, unsure: true, computer: 'orca.1a2b' },
  ];
  const draw = () => {
    render(<DetailsPanel snapshot={snapOf([], edits)} tab="edits" onTab={() => {}} onClose={() => {}} />);
  };
  it('each file: its verb and path; a change opens as text with any key hidden; Open in Files goes to its folder', () => {
    draw();
    expect(screen.getByText('Written')).toBeTruthy();
    expect(screen.getByText('120 characters written')).toBeTruthy();
    expect(document.querySelector('[data-edit-diff]')).toBeNull();
    const row = screen.getByText('src/app.ts').closest('[data-edit-row]') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: 'Show the change' }));
    const diff = row.querySelector('[data-edit-diff]') as HTMLElement;
    expect(diff.textContent).toContain('token = env.TOKEN');
    expect(diff.textContent).toContain('[hidden]');
    expect(document.body.innerHTML).not.toContain(KEY);
    expect(within(row).getByRole('link', { name: 'Open in Files' }).getAttribute('href')).toContain('/files?computer=atlas.1234');
  });
  it('a list the host capped says how many more files changed: "And N more not listed"', () => {
    const snap = { ...snapOf([], [{ id: 'k', path: 'a.ts', verb: 'deleted' }]), editsMore: 7 } as ConvSnapshot;
    render(<DetailsPanel snapshot={snap} tab="edits" onTab={() => {}} onClose={() => {}} />);
    expect(screen.getByText('And 7 more not listed')).toBeTruthy();
  });
  it('a key glued to a word by a control character is hidden too (scrubbed before cleaning)', () => {
    render(<DetailsPanel snapshot={snapOf([], [{ id: 'k', path: 'a.ts', verb: 'edited', diff: { old: `note\u0007sk-${KEY}`, new: 'x' } }])} tab="edits" onTab={() => {}} onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Show the change' }));
    expect(document.body.innerHTML).not.toContain(KEY);
  });
  it('a write has no change to show; an unsure edit says it may have changed, on which computer, without Open', () => {
    draw();
    const w = screen.getByText('README.md').closest('[data-edit-row]') as HTMLElement;
    expect(within(w).queryByRole('button', { name: 'Show the change' })).toBeNull();
    const u = screen.getByText('src/maybe.css').closest('[data-edit-row]') as HTMLElement;
    expect(u.textContent).toContain('May have changed');
    expect(u.textContent).toContain('orca.1a2b');
    expect(within(u).queryByRole('link', { name: 'Open in Files' })).toBeNull();
  });
});

describe('Review in a ConversationView', () => {
  it('opens Details on Edits, the host’s Details state followed', async () => {
    vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1000);
    const { ConversationView } = await import('./ConversationView');
    const { useState } = await import('react');
    const s = snapOf([reply()], [{ id: 'a', path: 'src/app.ts', verb: 'edited' }]);
    const Frame = () => {
      const [open, setOpen] = useState(false);
      return <ConversationView source={sourceOf(s) as never} pane={null} detailsOpen={open} onDetails={setOpen} />;
    };
    render(<Frame />);
    expect(screen.queryByRole('tab', { name: 'Edits' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Review the 2 changed files in Details' }));
    expect(screen.getByRole('tab', { name: 'Edits' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('src/app.ts')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Activity' }));
    expect(screen.getByRole('tab', { name: 'Activity' }).getAttribute('aria-selected')).toBe('true');
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
});
