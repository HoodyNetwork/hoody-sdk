// Vitest: Home: onboarding only from a setup state the server answered,
// focus after Hide and after a resolved Needs you item, state controls before Needs you, an account-wide list that
// is only page 1 never reads as an empty realm, and classic Needs you actions named as pages.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, renderPage, screen, waitFor } from '@app/testing';
import { homeMode, observesOnboarding, type NeedItem } from './logic';
import type { Overview } from './data';
import { NeedsYou } from './parts/NeedsYou';
import type * as Prefs from './parts/useWidgetPrefs';
import { visibleHeaderControl } from './parts/focus';
import page from './page';
import strings from './strings.en.json';
import './testWaits';

const links = vi.hoisted(() => ({ classic: new Set<string>() }));
vi.mock('@kit', async (orig) => {
  const kit = await orig<Record<string, unknown>>();
  return { ...kit, usePageLink: (id: string) => (links.classic.has(id) ? { kind: 'classic', href: `/auth/${id}.html` } : { kind: 'hub', href: `/${id}` }) };
});
// Records every stored Home flag (the hook itself still stores it).
const flags = vi.hoisted(() => [] as string[]);
vi.mock('./parts/useWidgetPrefs', async (orig) => {
  const real = await orig<typeof Prefs>();
  return {
    ...real,
    useWidgetPrefs: () => {
      const p = real.useWidgetPrefs();
      return { ...p, setFlag: (f: Parameters<typeof p.setFlag>[0]) => (flags.push(f), p.setFlag(f)) };
    },
  };
});
afterEach(() => {
  flags.length = 0;
  links.classic.clear();
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

const realm = { name: 'Personal', all: false };
const computers: NeedItem = { key: 'computers', count: 1, name: 'ember', handle: 'ember.abcd', scope: 'realm', tone: 'warn' };
const changes: NeedItem = { key: 'changes', count: 1, scope: 'account', tone: 'warn' };
const bots: NeedItem = { key: 'bots', count: 1, scope: 'realm', tone: 'warn' };

describe('onboarding', () => {
  it('is never observed from an unread setup state (the provisioning shown while pending or failed)', () => {
    expect(observesOnboarding({ mode: 'setup', setup: undefined, shared: false })).toBe(false);
  });

  it('is not stored for an expired account, even before its setup state answers', async () => {
    await renderPage(page, { state: 'expired', realm: 'all' });
    await screen.findByText(strings['setup.expired.title']);
    expect(flags).not.toContain('onboarding');
  });

  it('is stored once a first-run setup state answers', async () => {
    await renderPage(page, { state: 'invite', realm: 'all' });
    await screen.findByText(strings['setup.invite.title']);
    await waitFor(() => expect(flags).toContain('onboarding'));
  });
});

describe('an account-wide list read only in part', () => {
  const ov = (patch: Partial<Overview>): Overview => ({
    shared: false,
    realm: { id: 'r', name: 'R', all: false },
    computers: [],
    facts: { computer: null, key: null },
    checklistHidden: false,
    onboarding: false,
    introHidden: false,
    listWhole: false,
    bands: {},
    ...patch,
  });
  it('offers the chooser instead of calling the realm empty', () => {
    expect(homeMode(ov({}))).toBe('pick-one');
    expect(homeMode(ov({ listWhole: true }))).toBe('empty-realm');
  });
});

describe('focus', () => {
  it('moves to the next surviving action, skipping a line that has none', async () => {
    const shown = render(<NeedsYou items={[computers, changes, bots]} realm={realm} />);
    const review = screen.getByRole('link', { name: strings['needs.bots.action'] });
    review.focus();
    shown.rerender(<NeedsYou items={[computers, changes]} realm={realm} />);
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('link', { name: strings['needs.computers.action'] })));
  });

  it('leaves focus alone when it was elsewhere', () => {
    const outside = document.createElement('button');
    document.body.append(outside);
    const shown = render(<NeedsYou items={[computers, bots]} realm={realm} />);
    outside.focus();
    shown.rerender(<NeedsYou items={[computers]} realm={realm} />);
    expect(document.activeElement).toBe(outside);
  });

  it('goes to a header control the person can see: the phone menu when the wide button is hidden', () => {
    document.body.innerHTML =
      '<span data-home-header=""><span data-home-reopen=""><button id="wide">What is Hoody?</button></span></span><span data-home-header=""><button id="menu">More</button></span>';
    const box = [{ x: 0, y: 0, width: 10, height: 10 }] as unknown as DOMRectList;
    const none = [] as unknown as DOMRectList;
    vi.spyOn(document.documentElement, 'getClientRects').mockReturnValue(box);
    vi.spyOn(document.getElementById('wide')!, 'getClientRects').mockReturnValue(none);
    vi.spyOn(document.getElementById('menu')!, 'getClientRects').mockReturnValue(box);
    expect(visibleHeaderControl('[data-home-reopen] button')?.id).toBe('menu');
  });
});

describe('needs you on classic pages', () => {
  it('names the action as the page', () => {
    links.classic.add('computers');
    links.classic.add('bots');
    render(<NeedsYou items={[computers, bots]} realm={realm} />);
    expect(screen.getByRole('link', { name: strings['intro.openPage'] }).getAttribute('href')).toBe('/auth/computers.html');
    expect(screen.getByRole('link', { name: strings['actions.bot.page'] }).getAttribute('href')).toBe('/auth/bots.html');
    expect(screen.queryByRole('link', { name: strings['needs.computers.action'] })).toBeNull();
  });
});

describe('state controls come first', () => {
  it('draws the chooser before Needs you in pick-one', async () => {
    await renderPage(page, { state: 'pickOneAttention', computer: false });
    const chooser = await screen.findByText(strings['pick.title']);
    const strip = await screen.findByRole('region', { name: strings['needs.title'] });
    expect(chooser.compareDocumentPosition(strip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
