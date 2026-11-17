// Vitest: the revamped Home's claims. Needs you shows only what was seen (never an all-clear), onboarding is only
// what Home saw, every cross-page action is a hub link, a page-named classic link or nothing, and the Welcome closes
// and reopens with focus kept.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderPage, screen, userEvent, waitFor } from '@app/testing';
import { setAskForFixtures } from '@kit/ask';
import { resetActionHolds } from './data';
import { needsItems, observesOnboarding, survivorAfter, tileTarget, tilesFor, trySteps, welcomeVisible } from './logic';
import page from './page';
import strings from './strings.en.json';
import './testWaits';

const links = vi.hoisted(() => ({ hidden: new Set<string>(), classic: new Set<string>(), botsWaiting: undefined as number | undefined }));
vi.mock('@kit', async (orig) => {
  const kit = await orig<Record<string, unknown>>();
  return {
    ...kit,
    // A page renders without the live shell here: the shell's Bot count is given by the test.
    useShellData: () => ({ ...(kit.useShellData as () => object)(), botsWaiting: links.botsWaiting }),
    usePageLink: (id: string) =>
      links.hidden.has(id) ? null : links.classic.has(id) ? { kind: 'classic', href: `/auth/${id}.html` } : { kind: 'hub', href: `/${id}` },
  };
});

beforeEach(() => {
  setAskForFixtures(true);
  resetActionHolds();
});
afterEach(() => {
  setAskForFixtures(false);
  links.hidden.clear();
  links.classic.clear();
  links.botsWaiting = undefined;
});

const pc = (name: string, state: 'running' | 'stopped' | 'starting' | 'attention') => ({ name, handle: `${name}.abcd`, state });

describe('needs you', () => {
  it('lists only positive observations and has no all-clear item', () => {
    expect(needsItems({ botsWaiting: 0, computers: [pc('a', 'running')], held: [], sending: 0 })).toEqual([]);
    expect(needsItems({ botsWaiting: undefined, computers: [], held: [], sending: 0 })).toEqual([]);
    const items = needsItems({ botsWaiting: 2, computers: [pc('a', 'attention'), pc('b', 'stopped')], held: [], sending: 1 });
    expect(items.map((i) => i.key)).toEqual(['computers', 'bots', 'changes']);
    expect(items[0]).toMatchObject({ count: 1, name: 'a', handle: 'a.abcd', scope: 'realm', tone: 'warn' });
    expect(items[2]).toMatchObject({ scope: 'account' });
  });

  it('names no single computer when several need a look', () => {
    const [item] = needsItems({ botsWaiting: undefined, computers: [pc('a', 'attention'), pc('b', 'attention')], held: [], sending: 0 });
    expect(item).toMatchObject({ key: 'computers', count: 2 });
    expect(item?.name).toBeUndefined();
  });

  it('moves focus to the next surviving item, then the previous one, then nowhere', () => {
    expect(survivorAfter(['computers', 'bots', 'changes'], 'bots', ['computers', 'changes'])).toBe('changes');
    expect(survivorAfter(['computers', 'bots', 'changes'], 'changes', ['computers'])).toBe('computers');
    expect(survivorAfter(['computers', 'bots'], 'computers', ['bots'])).toBe('bots');
    expect(survivorAfter(['bots'], 'bots', [])).toBeUndefined();
  });

  it('shows a computer that needs a look and a waiting Bot, each with its own link', async () => {
    links.botsWaiting = 1;
    await renderPage(page, { state: 'attention' });
    const strip = await screen.findByRole('region', { name: strings['needs.title'] });
    expect(strip).toHaveTextContent('ember needs a look');
    expect(strip).toHaveTextContent(strings['needs.bots_one']);
    expect(screen.getByRole('link', { name: strings['needs.computers.action'] }).getAttribute('href')).toMatch(/ember\.[0-9a-f]{4}/);
    expect(screen.getByRole('link', { name: strings['needs.bots.action'] })).toBeInTheDocument();
  });

  it('counts only the shown realm: a row of another realm in the answer is not shown', async () => {
    await renderPage(page, { state: 'otherRealmRows' });
    await screen.findByRole('heading', { level: 1 });
    await screen.findByText(strings['actions.title']);
    expect(screen.queryByText('ember needs a look')).toBeNull();
    expect(screen.queryByRole('region', { name: strings['needs.title'] })).toBeNull();
  });

  it('says nothing like "all clear" when nothing was seen', async () => {
    await renderPage(page, { state: 'many' });
    await screen.findByText(strings['actions.title']);
    expect(screen.queryByRole('region', { name: strings['needs.title'] })).toBeNull();
    expect(document.body.textContent).not.toMatch(/all clear|nothing needs|all good/i);
  });
});

describe('onboarding', () => {
  it('is observed only in a first-run setup, never from a computer or an expired trial', () => {
    expect(observesOnboarding({ mode: 'setup', setup: 'provisioning', shared: false })).toBe(true);
    expect(observesOnboarding({ mode: 'setup', setup: 'invite', shared: false })).toBe(true);
    expect(observesOnboarding({ mode: 'setup', setup: 'expired', shared: false })).toBe(false);
    expect(observesOnboarding({ mode: 'setup', setup: 'reinstalled', shared: false })).toBe(false);
    expect(observesOnboarding({ mode: 'ready', setup: undefined, shared: false })).toBe(false);
    expect(observesOnboarding({ mode: 'setup', setup: 'provisioning', shared: true })).toBe(false);
  });

  it('shows the Welcome when asked or while onboarding and not hidden, never in setup or for a shared session', () => {
    const base = { account: true, mode: 'ready' as const, onboarding: false, introHidden: false, asked: false };
    expect(welcomeVisible(base)).toBe(false);
    expect(welcomeVisible({ ...base, asked: true })).toBe(true);
    expect(welcomeVisible({ ...base, onboarding: true })).toBe(true);
    expect(welcomeVisible({ ...base, onboarding: true, introHidden: true })).toBe(false);
    expect(welcomeVisible({ ...base, asked: true, introHidden: true })).toBe(true);
    expect(welcomeVisible({ ...base, asked: true, mode: 'setup' })).toBe(false);
    expect(welcomeVisible({ ...base, asked: true, account: false })).toBe(false);
  });

  it('hides the Welcome, drops ?intro and puts focus on "What is Hoody?"', async () => {
    const { router } = await renderPage(page, { state: 'newAccount', path: '/home?intro=1' });
    await screen.findByText(strings['intro.lead']);
    await userEvent.click(screen.getAllByRole('button', { name: strings['intro.hideLabel'] })[0]!);
    await waitFor(() => expect(screen.queryByText(strings['intro.lead'])).toBeNull());
    expect(router.state.location.href).not.toContain('intro=1');
    await waitFor(() => expect(document.activeElement).toHaveTextContent(strings['intro.reopen']));
    await userEvent.click(document.activeElement as HTMLElement);
    expect(await screen.findByText(strings['intro.lead'])).toBeInTheDocument();
  });
});

describe('cross-page actions', () => {
  it('resolve to the place, the page named as such, or nothing', () => {
    expect(tileTarget({ kind: 'hub', href: '/bots' }, '/bots?new=1')).toEqual({ href: '/bots?new=1', asPage: false });
    expect(tileTarget({ kind: 'classic', href: '/auth/bots.html' }, '/bots?new=1')).toEqual({ href: '/auth/bots.html', asPage: true });
    expect(tileTarget(null, '/bots?new=1')).toBeNull();
  });

  it('leave out what needs a computer when the realm has none', () => {
    expect(tilesFor({ hasComputer: false }).map((t) => t.id)).toEqual(['keys', 'vault', 'computer']);
    expect(trySteps({ hasComputer: false })).toEqual(['bot']);
    // Ask the agent is not a Try next row (it fills the Ask strip, not a place to go).
    expect(trySteps({ hasComputer: true })).toEqual(['open', 'bot']);
  });

  it('name a classic Computers view as the page: the Welcome, the empty realm and the chooser', async () => {
    links.classic.add('computers');
    const a = await renderPage(page, { state: 'newAccount', path: '/home?intro=1' });
    await screen.findByText(strings['intro.lead']);
    expect(screen.getByRole('link', { name: strings['intro.openPage'] }).getAttribute('href')).toBe('/auth/computers.html');
    expect(screen.queryByRole('link', { name: 'Open atlas' })).toBeNull();
    a.unmount();
    const b = await renderPage(page, { state: 'emptyRealm' });
    expect(await screen.findByRole('link', { name: strings['intro.openPage'] })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: strings['action.getComputer'] })).toBeNull();
    b.unmount();
    await renderPage(page, { state: 'pickOne', computer: false });
    expect(await screen.findByRole('link', { name: strings['intro.openPage'] })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'orion' })).toBeNull();
  });

  it('name the first steps suggestions as pages on classic views, with no promise of the place', async () => {
    links.classic.add('computers');
    links.classic.add('bots');
    // A known open milestone (no API key yet) earns the First steps card.
    await renderPage(page, { state: 'newAccount' });
    await screen.findByText(strings['steps.try']);
    expect(screen.queryByRole('link', { name: /Open atlas/ })).toBeNull();
    expect(screen.getByRole('link', { name: strings['intro.openPage'] }).getAttribute('href')).toBe('/auth/computers.html');
    expect(screen.queryByRole('link', { name: new RegExp(strings['steps.try.bot']) })).toBeNull();
  });

  it('draw the Start something tiles as their pages when only classic views exist, and drop unserved ones', async () => {
    links.classic.add('bots');
    links.hidden.add('board');
    await renderPage(page, { state: 'many' });
    await screen.findByText(strings['actions.title']);
    // The tile (and, while the key read is pending, the first steps suggestion) are both named as the page.
    const botLinks = screen.getAllByRole('link', { name: new RegExp(`^${strings['actions.bot.page']}`) });
    expect(botLinks.map((a) => a.getAttribute('href'))).toEqual(botLinks.map(() => '/auth/bots.html'));
    expect(screen.queryByRole('link', { name: new RegExp(strings['actions.bot']) })).toBeNull();
    expect(screen.queryByRole('link', { name: new RegExp(strings['actions.board']) })).toBeNull();
    expect(screen.getByRole('link', { name: new RegExp(strings['actions.script']) })).toBeInTheDocument();
  });

  it('open the New key form from the API key step, or name a classic Keys view as the page', async () => {
    const a = await renderPage(page, { state: 'newAccount' });
    const make = await screen.findByRole('link', { name: strings['steps.key'] });
    expect(make.getAttribute('href')).toBe('#/keys?new=1');
    a.unmount();
    links.classic.add('keys');
    await renderPage(page, { state: 'newAccount' });
    // The step's action (once the key fact is read) and the Start something tile both name the page.
    await waitFor(() => expect(screen.getAllByRole('link', { name: strings['actions.keys.page'] })).toHaveLength(2));
    expect(screen.getAllByRole('link', { name: strings['actions.keys.page'] }).map((l) => l.getAttribute('href'))).toEqual(['/auth/keys.html', '/auth/keys.html']);
    expect(screen.queryByRole('link', { name: strings['steps.key'] })).toBeNull();
  });
});
