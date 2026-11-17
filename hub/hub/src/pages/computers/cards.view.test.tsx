// Vitest: the Computers cards view draws each computer as a card: a head (colour,
// the whole name in two lines at most, the state tag), a body (realms with +N, location, size, usage when switched on)
// and a footer (access, the one start button its state offers, the row menu), inside a frame with a slanted corner.
// The data and actions are the table row's. Looks (clamp, colours, frame continuity) are in cards.look.spec.ts.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { localSetting } from '@core';
import { render, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { fixtureWorld } from '@core';
import { cutFramePath } from '@kit';
import { ComputerCard } from './parts/ComputerCard';
import { computers } from './fixtures';
import accessStrings from './parts/AccessDrawer.strings.en.json';
import page from './page';
import strings from './strings.en.json';
import { permissionsTesting } from './permissions.testing';

const { landedOnPermissions } = permissionsTesting({ renderPage, screen, userEvent, waitFor });

const present = () => localSetting('hub.v3.table.present.machines');
afterEach(() => {
  present().set(null);
  vi.unstubAllGlobals();
});

const T = 8000;
const card = (name: string) => screen.getByRole('article', { name });
const head = (name: string) => card(name).querySelector('h3') as HTMLElement;
// A size tile's words as read: its number, then its unit line (two elements, spaced by the layout).
const parts = (tile: HTMLElement) => [...tile.children].map((e) => e.textContent).join(' ');

describe('computers: the computer card', () => {
  it('draws one card per computer, the name whole in its h3 with its title, the state as a worded tag', async () => {
    await renderPage(page, { path: '/computers' });
    await screen.findByRole('article', { name: 'atlas' }, { timeout: T });
    for (const c of fixtureWorld.computers) {
      const h = head(c.name);
      expect(h.textContent).toBe(c.name);
      expect(h.getAttribute('title')).toBe(c.name);
    }
    expect(within(card('atlas')).getByText(strings['state.running'])).toBeInTheDocument();
    expect(within(card('ember')).getByText(strings['state.failed'])).toBeInTheDocument();
    expect(card('ember').hasAttribute('data-bad')).toBe(true);
    expect(card('atlas').hasAttribute('data-bad')).toBe(false);
  });

  it('a failed card offers Restart, stopped Start and paused Resume; a running card offers none and no Open terminal', async () => {
    await renderPage(page, { path: '/computers' });
    await screen.findByRole('article', { name: 'ember' }, { timeout: T });
    const worded = (name: string, label: string) => within(card(name)).queryAllByRole('button').filter((b) => (b.textContent ?? '').includes(label));
    expect(worded('ember', strings['menu.restart'])).toHaveLength(1);
    expect(worded('cedar', strings['menu.start'])).toHaveLength(1);
    expect(worded('fjord', strings['menu.resume'])).toHaveLength(1);
    for (const l of [strings['menu.restart'], strings['menu.start'], strings['menu.resume'], strings['menu.openTerminal']]) expect(worded('atlas', l)).toHaveLength(0);
  });

  it('every card keeps the row menu and the access button with its label; the access button lands on the Permissions tab', async () => {
    await renderPage(page, { path: '/computers' });
    await screen.findByRole('article', { name: 'atlas' }, { timeout: T });
    expect(within(card('atlas')).getByRole('button', { name: /actions/i })).toBeInTheDocument();
    const acc = within(card('atlas')).getByRole('button', { name: new RegExp(`^${strings['access.aria'].replace('{{name}}', 'atlas').split('{{')[0]!}`) });
    await userEvent.click(acc);
    // The padlock popover, then its View access rules lands on this computer's Permissions tab, on its access part.
    const pop = await screen.findByRole('dialog', { name: strings['access.title'] }, { timeout: T });
    await userEvent.click(within(pop).getByRole('button', { name: strings['access.view'] }));
    const panel = await landedOnPermissions(strings, accessStrings['perm.who.title'], T);
    expect(panel).toBeInTheDocument();
  });

  it('the start button runs its own action for its computer, and a press never opens the computer', async () => {
    const onAction = vi.fn();
    const base = { projects: undefined, realms: undefined, caps: 'all' as const, current: false, op: undefined, onAction, check: null, menu: null, usage: undefined, showUsage: false };
    for (const [name, label, op] of [['ember', 'menu.restart', 'restart'], ['cedar', 'menu.start', 'start'], ['fjord', 'menu.resume', 'resume']] as const) {
      const c = computers.find((x) => x.name === name)!;
      const { unmount } = render(<ComputerCard {...base} computer={c} />);
      await userEvent.click(screen.getByRole('button', { name: strings[label] }));
      expect(onAction).toHaveBeenLastCalledWith(c, op);
      unmount();
    }
    expect(onAction).toHaveBeenCalledTimes(3);
    // On the page: Restart on a card leaves the list in place (no computer opened).
    await renderPage(page, { path: '/computers' });
    await screen.findByRole('article', { name: 'ember' }, { timeout: T });
    await userEvent.click(within(card('ember')).getByRole('button', { name: strings['menu.restart'] }));
    await waitFor(() => expect(screen.queryByRole('tab', { name: /overview/i })).toBeNull());
    expect(screen.getByRole('article', { name: 'ember' })).toBeInTheDocument();
  });

  it('realms: the first as a chip, the rest behind +N, which opens a dialog listing every realm; Escape closes it', async () => {
    await renderPage(page, { path: '/computers', state: 'cardsRealms' });
    await screen.findByRole('article', { name: 'atlas' }, { timeout: T });
    const n = fixtureWorld.realms.length;
    const more = within(card('atlas')).getByRole('button', { name: new RegExp(`^\\+${n - 1} more realms`) });
    expect(more.textContent).toBe(`+${n - 1}`);
    await userEvent.click(more);
    const words = more.getAttribute('aria-label')!.replace(/^\+/, '');
    // The popover is named with the tooltip's words and lists every realm.
    const d = await screen.findByRole('dialog', { name: words }, { timeout: T });
    for (const r of fixtureWorld.realms) expect(within(d).getByText(r.name)).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: words })).toBeNull());
    expect(more).toHaveFocus();
    // A computer in no realm says so; one in a single realm has no +N.
    expect(within(card('fjord')).getByText(strings['realm.none'])).toBeInTheDocument();
    expect(within(card('borealis')).queryByRole('button', { name: /more realm/ })).toBeNull();
  });

  it('location and size: the place under a mono label (server name in its title), cores and RAM as two tiles', async () => {
    await renderPage(page, { path: '/computers' });
    await screen.findByRole('article', { name: 'atlas' }, { timeout: T });
    const c = card('atlas');
    const where = within(c).getByText(strings['card.location']).parentElement as HTMLElement;
    expect(where.getAttribute('title')).toBe(strings['card.server'].replace('{{name}}', 'n12'));
    const w = fixtureWorld.computers.find((x) => x.name === 'atlas')!;
    expect(within(c).getByText(String(w.size.cpu))).toBeInTheDocument();
    const ramTile = within(c).getByText((_, e) => e?.tagName === 'SPAN' && /RAM$/.test(e.textContent ?? '')).parentElement as HTMLElement;
    expect(parts(ramTile)).toBe(`${w.size.ram} GB RAM`);
  });

  // The list's usage read (usageAll) has no route yet, so the page never has readings: the card is checked on its own,
  // with and without the switch (the same rule as the table's Usage column: no block while the switch is off).
  it('usage bars show only with Show usage on, a reading per bar, dashes without one', async () => {
    const atlas = computers.find((c) => c.name === 'atlas')!;
    const props = { computer: atlas, projects: undefined, realms: undefined, caps: 'all' as const, current: false, op: undefined, onAction: () => {}, check: null, menu: null };
    const { rerender } = render(<ComputerCard {...props} usage={undefined} showUsage={false} />);
    expect(document.querySelector('[data-card-usage]')).toBeNull();
    rerender(<ComputerCard {...props} usage={{ cpu: 12, mem: { used: 28, total: 100 }, disk: null, at: '' }} showUsage />);
    const u = document.querySelector('[data-card-usage]') as HTMLElement;
    expect(within(u).getAllByRole('meter')).toHaveLength(2);
    // The readings carry their % unit: 12% CPU, 28% RAM.
    expect([...u.querySelectorAll('em')].map((e) => e.textContent)).toEqual(['12%', '28%']);
    expect(within(u).getByText(strings['card.use.cpu'])).toBeInTheDocument();
    expect(within(u).getByText(strings['card.use.mem'])).toBeInTheDocument();
    rerender(<ComputerCard {...props} usage={null} showUsage />);
    expect(within(document.querySelector('[data-card-usage]') as HTMLElement).getAllByText('—')).toHaveLength(2);
  });

  // A realm id this session cannot name is still a realm: an unnamed chip, never "No realm" (unknown never reads as none).
  it('a realm the realm list lacks shows as an unnamed realm, not as no realm', () => {
    const atlas = computers.find((c) => c.name === 'atlas')!;
    const props = { projects: undefined, caps: 'all' as const, current: false, op: undefined, onAction: () => {}, check: null, menu: null, usage: undefined, showUsage: false };
    render(<ComputerCard {...props} computer={{ ...atlas, realm_ids: ['ffffffffffffffffffffffff'] }} realms={[]} />);
    const c = screen.getByRole('article', { name: 'atlas' });
    expect(within(c).getByText(strings['realm.unnamed'])).toBeInTheDocument();
    expect(within(c).queryByText(strings['realm.none'])).toBeNull();
  });

  it('two realms: the first as the chip and "+1" for the other', () => {
    const atlas = computers.find((c) => c.name === 'atlas')!;
    const [r1, r2] = fixtureWorld.realms;
    const props = { projects: undefined, caps: 'all' as const, current: false, op: undefined, onAction: () => {}, check: null, menu: null, usage: undefined, showUsage: false };
    render(<ComputerCard {...props} computer={{ ...atlas, realm_ids: [r1!.id, r2!.id] }} realms={[r1!, r2!].map((r) => ({ id: r.id, name: r.name, color: 'blue' }))} />);
    const more = within(screen.getByRole('article', { name: 'atlas' })).getByRole('button', { name: new RegExp(`^\\+1 more realm: ${r2!.name}$`) });
    expect(more.textContent).toBe('+1');
  });

  // C9: realm membership the list did not give (realm_ids absent) is unknown, never "No realm"; [] is "No realm".
  it('realm membership: absent reads as not known, an empty list as No realm, an unresolved id as an unnamed realm', () => {
    const atlas = computers.find((c) => c.name === 'atlas')!;
    const base = { projects: undefined, caps: 'all' as const, current: false, op: undefined, onAction: () => {}, check: null, menu: null, usage: undefined, showUsage: false, realms: [] };
    const { realm_ids: _drop, ...noField } = atlas;
    const one = render(<ComputerCard {...base} computer={noField} />);
    expect(within(screen.getByRole('article')).getByText(strings['card.realmUnknown'])).toBeInTheDocument();
    expect(within(screen.getByRole('article')).queryByText(strings['realm.none'])).toBeNull();
    one.unmount();
    const two = render(<ComputerCard {...base} computer={{ ...atlas, realm_ids: [] }} />);
    expect(within(screen.getByRole('article')).getByText(strings['realm.none'])).toBeInTheDocument();
    expect(within(screen.getByRole('article')).queryByText(strings['card.realmUnknown'])).toBeNull();
    two.unmount();
    render(<ComputerCard {...base} computer={{ ...atlas, realm_ids: ['ffffffffffffffffffffffff'] }} />);
    expect(within(screen.getByRole('article')).getByText(strings['realm.unnamed'])).toBeInTheDocument();
    expect(within(screen.getByRole('article')).queryByText(strings['card.realmUnknown'])).toBeNull();
  });

  // RAM through the shared formatStorage (value and unit split into the tile), never the raw GB number.
  it('RAM reads as formatStorage does: fractional, a TB size and a missing size', () => {
    const atlas = computers.find((c) => c.name === 'atlas')!;
    const base = { projects: undefined, realms: undefined, caps: 'all' as const, current: false, op: undefined, onAction: () => {}, check: null, menu: null, usage: undefined, showUsage: false };
    const withRam = (ram_gb: number | undefined) => ({ ...atlas, server: { ...atlas.server, specs: { ...atlas.server?.specs, cpu_cores: 4, ...(ram_gb === undefined ? { ram_gb: undefined } : { ram_gb }) } } }) as typeof atlas;
    const tile = () => screen.getByText((_, e) => e?.tagName === 'SPAN' && /RAM$/.test(e.textContent ?? '')).parentElement as HTMLElement;
    for (const [gb, text] of [[1.5, '1.5 GB RAM'], [1536, '1.5 TB RAM'], [16, '16 GB RAM'], [0.25, '0.3 GB RAM']] as const) {
      const r = render(<ComputerCard {...base} computer={withRam(gb)} />);
      expect(parts(tile())).toBe(text);
      r.unmount();
    }
    render(<ComputerCard {...base} computer={withRam(undefined)} />);
    expect(screen.queryByText((_, e) => e?.tagName === 'SPAN' && /RAM$/.test(e.textContent ?? ''))).toBeNull();
  });

  it('the frame is one path with the 16 px slanted corner, redrawn when the card changes size', async () => {
    expect(cutFramePath(420, 300, 16)).toBe('M0.5 0.5H419.5V283.5L403.5 299.5H0.5Z');
    const seen: Array<() => void> = [];
    vi.stubGlobal('ResizeObserver', class {
      constructor(cb: (entries: unknown[]) => void) {
        seen.push(() => cb([]));
      }
      observe() {}
      disconnect() {}
    });
    let w = 420;
    const ow = vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(() => w);
    const oh = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(() => 300);
    try {
      await renderPage(page, { path: '/computers' });
      await screen.findByRole('article', { name: 'atlas' }, { timeout: T });
      const path = () => card('atlas').querySelector('[data-cut-edge] path')?.getAttribute('d');
      await waitFor(() => expect(path()).toBe(cutFramePath(420, 300, 16)));
      w = 500;
      for (const f of seen) f();
      await waitFor(() => expect(path()).toBe(cutFramePath(500, 300, 16)));
    } finally {
      ow.mockRestore();
      oh.mockRestore();
    }
  });

  it('List keeps its rows (no cards)', async () => {
    await renderPage(page, { path: '/computers' });
    await screen.findByRole('article', { name: 'atlas' }, { timeout: T });
    await userEvent.click(screen.getByRole('radio', { name: 'List' }));
    await waitFor(() => expect(screen.queryByRole('article', { name: 'atlas' })).toBeNull());
  });
});
