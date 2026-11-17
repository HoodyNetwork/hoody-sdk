// Vitest: Home's status words. An unknown computer status is never a red "failed" dot, an empty realm shows no
// empty card and no stuck step, First steps shows only for a milestone known to be open, the titles fit who is
// reading, the unsettled-changes line agrees with its count, the phone header has a labelled way back to the
// Welcome, and the Shortcuts card offers no key that does nothing on Home.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, renderPage, screen } from '@app/testing';
import { setAskForFixtures } from '@kit/ask';
import { realmsFixture } from '@core';
import { resetActionHolds } from './data';
import { needsItems, titleOf } from './logic';
import page from './page';
import { withoutRepeats } from './parts/contributions';
import { NeedsYou } from './parts/NeedsYou';
import { pickShortcuts } from './parts/ShortcutsCard';
import strings from './strings.en.json';
import './testWaits';

// The setup panel's 'provisioning' as it would show on a server signal of preparation: no read answers it today
// (an owned free server alone reads 'empty'), so rows that test the panel force the answer.
const forced = vi.hoisted(() => ({ provisioning: false }));
vi.mock('@core', async (orig) => {
  const core = await orig<Record<string, unknown>>();
  const real = core.useSetupState as (o?: { enabled?: boolean }) => { data?: unknown };
  return { ...core, useSetupState: (o?: { enabled?: boolean }) => { const r = real(o); return forced.provisioning && r.data ? { ...r, data: { kind: 'provisioning' } } : r; } };
});

vi.mock('@kit', async (orig) => {
  const kit = await orig<Record<string, unknown>>();
  const real = kit.useShellData as () => { account?: object };
  return {
    ...kit,
    usePageLink: (id: string) => ({ kind: 'hub', href: `/${id}` }),
    useShellData: () => ({ ...real(), account: { ...(real().account ?? {}), name: 'ada' } }),
  };
});

beforeEach(() => {
  setAskForFixtures(true);
  resetActionHolds();
});
afterEach(() => setAskForFixtures(false));

describe('needs you', () => {
  it('a computer that needs a look is a warning, never the red of a known failure (its status may be unknown)', () => {
    const [item] = needsItems({ botsWaiting: undefined, computers: [{ name: 'a', handle: 'a.abcd', state: 'attention' }], held: [], sending: 0 });
    expect(item).toMatchObject({ key: 'computers', tone: 'warn' });
  });

  it('the unsettled-changes line agrees with its count and says where the changes were made', () => {
    const realm = { id: 'all', name: '', all: true };
    const one = render(<NeedsYou items={[{ key: 'changes', count: 1, scope: 'account', tone: 'warn' }]} realm={realm} />);
    expect(one.container.textContent).toContain('1 change is being sent');
    expect(one.container.textContent).toContain('The page where you made it');
    expect(one.container.textContent).toContain(strings['needs.scope.account']);
    one.unmount();
    const three = render(<NeedsYou items={[{ key: 'changes', count: 3, scope: 'account', tone: 'warn' }]} realm={realm} />);
    expect(three.container.textContent).toContain('3 changes are being sent');
    expect(three.container.textContent).toContain('The pages where you made them');
    expect(three.container.textContent).not.toContain('The page where you made it');
  });
});

describe('an empty realm', () => {
  it('shows one empty state: no "Your computer" card repeating that there is no computer', () => {
    const w = (pageId: string, id: string) => ({ pageId, id }) as Parameters<typeof withoutRepeats>[0][number];
    const cards = [w('computers', 'your-computer'), w('bots', 'bots')];
    expect(withoutRepeats(cards, 'empty-realm').map((x) => x.id)).toEqual(['bots']);
    expect(withoutRepeats(cards, 'ready')).toEqual(cards);
  });

  it('with All realms shown, it never offers to show all realms', async () => {
    await renderPage(page, { state: 'emptyRealm', realm: 'all' });
    expect(await screen.findByText(strings['empty.bodyAll'], undefined, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.queryByText(strings['empty.body'])).toBeNull();
  });

  it('shows no empty Start something card, no First steps stuck on Checking, and no free-computer claim', async () => {
    await renderPage(page, { state: 'emptyRealm' });
    await screen.findByText(/has no computers yet/);
    // Let the key read answer before looking for what it would add.
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole('heading', { name: strings['actions.title'] })).toBeNull();
    expect(screen.queryByText(strings['steps.checking'])).toBeNull();
    expect(screen.queryByText(strings['steps.title'])).toBeNull();
    expect(document.body.textContent).not.toMatch(/free/i);
  });
});

describe('the shown realm missing from the realm list', () => {
  it('is named as the realm switcher names it (its short id), never left blank', async () => {
    // The shown realm is not in the realm list and no alias names it.
    await renderPage(page, { state: 'emptyRealm', realm: 'abcdef0123456789abcdef01', rules: realmsFixture(['0123456789abcdef01234567']) });
    expect(await screen.findByText(strings['empty.title'].replace('{{realm}}', 'abcd…ef01'), undefined, { timeout: 8000 })).toBeInTheDocument();
  });
});

describe('the computer milestone', () => {
  it('an empty realm with the Welcome open shows no step list: the Welcome is a short entry and the steps card stays off there', async () => {
    await renderPage(page, { state: 'emptyRealm', path: '/home?intro=1' });
    await screen.findByText(strings['intro.lead']);
    expect(screen.queryByRole('list', { name: strings['steps.title'] })).toBeNull();
  });
});

describe('first steps', () => {
  it('stay hidden for a returning account when the API key read fails (no milestone is known to be open)', async () => {
    await renderPage(page, { state: 'factsUnknown' });
    await screen.findByText(strings['actions.title']);
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText(strings['steps.title'])).toBeNull();
    expect(screen.queryByText(strings['steps.checking'])).toBeNull();
  });
});

describe('titles', () => {
  it('an expired account is greeted as the returning account it is, not welcomed to Hoody', async () => {
    await renderPage(page, { state: 'expired', realm: 'all' });
    await screen.findByText(strings['setup.expired.title']);
    expect(screen.getByRole('heading', { level: 1 }).textContent).not.toMatch(/Welcome/);
  });

  it('setup welcomes by name in a short title that fits a phone', async () => {
    forced.provisioning = true;
    await renderPage(page, { state: 'provisioning', realm: 'all' });
    await screen.findByText(strings['setup.provisioning.title']);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/^Welcome, \S+$/);
    forced.provisioning = false;
  });

  it('the first-run view welcomes by name (short for a phone); without a name it names the person\'s computer', () => {
    const base = { mode: 'ready' as const, firstRun: true, computerName: 'atlas', computerRunning: true, hour: 20 };
    expect(titleOf({ ...base, userName: 'Ada' })).toEqual({ key: 'greeting.setupNamed', params: { name: 'Ada' } });
    expect(titleOf(base)).toEqual({ key: 'ready.title', params: { name: 'atlas' } });
    expect(strings['ready.title']).toBe('Your computer {{name}} is ready');
    // A first computer that is not running yet is never announced as ready.
    expect(titleOf({ ...base, computerRunning: false }).key).toBe('greeting.evening');
    expect(titleOf({ ...base, firstRun: false, userName: 'Ada' }).key).toBe('greeting.named');
    expect(titleOf({ mode: 'setup', setup: 'expired', firstRun: false, userName: 'Ada', hour: 20 }).key).toBe('greeting.named');
    // host_reinstalled: a returning account too.
    expect(titleOf({ mode: 'setup', setup: 'reinstalled', firstRun: false, userName: 'Ada', hour: 20 }).key).toBe('greeting.named');
    expect(titleOf({ mode: 'setup', setup: 'reinstalled', firstRun: false, hour: 20 }).key).toBe('greeting.evening');
  });

  it('a reinstalled account is greeted as a returning one, not welcomed to Hoody', async () => {
    await renderPage(page, { state: 'reinstalled', realm: 'all' });
    await screen.findByText(strings['setup.reinstalled.title']);
    expect(screen.getByRole('heading', { level: 1 }).textContent).not.toMatch(/Welcome/);
  });
});

describe('the header', () => {
  it('keeps a labelled "What is Hoody?" control for phones under the title, not only inside the menu', async () => {
    await renderPage(page);
    await screen.findByText(strings['actions.title']);
    const reopen = document.querySelectorAll(`[data-home-reopen] button`);
    expect(reopen).toHaveLength(2);
    for (const b of reopen) expect(b.getAttribute('aria-label') ?? b.textContent).toContain(strings['intro.reopen']);
  });
});

describe('the Shortcuts card', () => {
  it('leaves out "/" (Home has no list to search) and still shows three keys that work everywhere', () => {
    const row = (k: string) => ({ keys: [k], label: k });
    const picked = pickShortcuts([
      { id: 'everywhere', label: '', rows: [row('Ctrl K'), row('/'), row('?'), row('Escape')] },
      { id: 'go', label: '', rows: [row('g h'), row('g c')] },
    ] as unknown as Parameters<typeof pickShortcuts>[0]);
    expect(picked.map((r) => r.keys[0])).toEqual(['Ctrl K', '?', 'Escape', 'g c']);
  });
});

describe('copy', () => {
  it('one Bot definition: every Bot line says Bots work on your computers', () => {
    expect(strings['intro.bots.body']).toMatch(/works? on your computer/);
  });
});
