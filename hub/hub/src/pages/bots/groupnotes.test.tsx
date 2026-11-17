// Vitest: on the Bots list as a table (List), a note about one computer lives in that computer's group: its
// first row, under its header, without the computer's name again, and with its action (Resume, Try again). A computer
// whose Bots are all paused still gets its group, with the note as its only content; collapsing a group hides its note
// and keeps the header's paused count. Only what names no group stays above the table.
import { act, renderPage as renderPageRaw, screen, userEvent, waitFor, within } from '@app/testing';
import type * as Fixtures from '@app/fixtures';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localSetting } from '@core';
import page from './page';
import strings from './strings.en.json';
import K from '@kit/data/GroupNotes.strings.en.json';

// The page's changes as sent (fixture mode sends a change through the source's mutation, not the network).
const W = vi.hoisted(() => ({ sent: [] as Array<{ key: string; vars: unknown }> }));
vi.mock('@app/fixtures', async (orig) => {
  const fx = await orig<typeof Fixtures>();
  return {
    ...fx,
    fixtureSource: (pageId: string) => {
      const real = fx.fixtureSource(pageId);
      return {
        ...real,
        useMutation: <T, V = void>(key: string) => {
          const mu = real.useMutation<T, V>(key);
          return {
            ...mu,
            mutateAsync: (vars: V, o?: unknown) => {
              W.sent.push({ key, vars });
              return (mu.mutateAsync as (a: V, b?: unknown) => Promise<unknown>)(vars, o);
            },
          } as typeof mu;
        },
      };
    },
  };
});
beforeEach(() => {
  W.sent = [];
});
// The groups are the List presentation's (cards are one grid with the notes above it: list.cards.test.tsx).
// These tests read the dense table: the page opens on cards, so each render picks List (the remembered choice; a
// render starts with clean storage, so it is set once the page is up).
const present = () => localSetting('hub.v3.table.present.bots');
const renderPage = async (...a: Parameters<typeof renderPageRaw>) => {
  const r = await renderPageRaw(...a);
  await act(async () => void present().set('list'));
  return r;
};
afterEach(() => void present().set(null));

const paused = (n: number) => strings[n === 1 ? 'notice.paused_one' : 'notice.paused_other'].replace('{{count}}', String(n));
const chip = (n: number) => strings[n === 1 ? 'group.paused_one' : 'group.paused_other'].replace('{{count}}', String(n));
const rowsText = () => [...document.querySelectorAll('table tbody tr')].map((tr) => tr.textContent?.replace(/\s+/g, ' ').trim() ?? '').filter(Boolean);
// The group header's collapse button (the group's Resume also names its computer, so it is left out).
const headerOf = (name: string) => {
  const heads = screen.getAllByRole('button', { name: new RegExp(name) }).filter((b) => b.textContent !== strings['notice.resume']);
  expect(heads).toHaveLength(1);
  return heads[0]!;
};

describe('the Bots list: each computer\'s notes in its own group', () => {
  it('a paused note is the first row of its computer\'s group, never a named strip above the table', async () => {
    await renderPage(page, { state: 'railPaused', path: '/bots' });
    await screen.findByText(paused(2));
    const texts = rowsText();
    const lemur = texts.findIndex((x) => x.includes('sunny-red-lemur'));
    expect(lemur).toBeGreaterThan(-1);
    expect(texts[lemur + 1]).toContain(paused(2));
    expect(texts[lemur + 1]).toContain(strings['notice.resume']);
    // The name is in the header only: no "<computer>: …" note anywhere on the page.
    expect(document.body.textContent).not.toMatch(/(sunny-red-lemur|glad-silver-falcon|daring-mint-walrus): /);
    expect(screen.getAllByText(paused(2))).toHaveLength(1);
  });

  it('a computer with every Bot paused and none listed still has its group, its note the only row', async () => {
    await renderPage(page, { state: 'railPaused', path: '/bots' });
    await screen.findByText(paused(1));
    const texts = rowsText();
    const falcon = texts.findIndex((x) => x.includes('glad-silver-falcon'));
    expect(falcon).toBeGreaterThan(-1);
    expect(texts[falcon + 1]).toContain(paused(1));
    const next = texts[falcon + 2];
    expect(next === undefined || /sunny-red-lemur|daring-mint-walrus/.test(next)).toBe(true);
  });

  it('the header keeps a paused count, which stays when the group is collapsed; the note goes with the group', async () => {
    await renderPage(page, { state: 'railPaused', path: '/bots' });
    await screen.findByText(paused(2));
    const head = headerOf('sunny-red-lemur').closest('tr') as HTMLElement;
    // In the count's own words, after it: "1 Bot · 2 paused".
    expect(within(head).getByText(`${countWords(1)} · ${chip(2)}`)).toBeInTheDocument();
    await userEvent.click(headerOf('sunny-red-lemur'));
    expect(screen.queryByText(paused(2))).toBeNull();
    expect(within(headerOf('sunny-red-lemur').closest('tr') as HTMLElement).getByText(`${countWords(1)} · ${chip(2)}`)).toBeInTheDocument();
    // A computer with no paused Bots has no chip.
    expect(within(headerOf('daring-mint-walrus').closest('tr') as HTMLElement).queryByText(/paused/)).toBeNull();
  });

  it('Resume in a group resumes that computer\'s Bots, and sits between its header and its first Bot in the tab order', async () => {
    await renderPage(page, { state: 'railPaused', path: '/bots' });
    await screen.findByText(paused(2));
    const head = headerOf('sunny-red-lemur');
    head.focus();
    await userEvent.tab();
    const resume = document.activeElement as HTMLElement;
    expect(resume.textContent).toBe(strings['notice.resume']);
    expect(resume.closest('tr')?.textContent).toContain(paused(2));
    // Its name says which computer it acts on; the other computer's Resume says its own.
    expect(resume).toHaveAccessibleName(K['groupNotes.actionOn'].replace('{{action}}', strings['notice.resume']).replace('{{name}}', 'sunny-red-lemur'));
    expect(screen.getByRole('button', { name: K['groupNotes.actionOn'].replace('{{action}}', strings['notice.resume']).replace('{{name}}', 'glad-silver-falcon') })).toBeInTheDocument();
    // Pressing it resumes that computer's Bots: one resume change, for sunny-red-lemur's computer (c-atlas) alone.
    await userEvent.keyboard('{Enter}');
    await waitFor(() => expect(W.sent.filter((x) => x.key === 'botAction').map((x) => x.vars)).toEqual([{ action: 'resume', computerId: 'c-atlas', suspended: 2 }]));
    // The next stop is the group's first Bot.
    head.focus();
    await userEvent.tab();
    await userEvent.tab();
    expect((document.activeElement as HTMLElement).closest('tr')?.textContent).toContain('bright-crimson-lynx');
  });

  it('a search that matches no Bot keeps every computer\'s notes, named, above the table', async () => {
    await renderPage(page, { state: 'railPaused', path: '/bots' });
    await screen.findByText(paused(2));
    await userEvent.type(screen.getAllByRole('searchbox')[0]!, 'no-such-bot-anywhere');
    await screen.findByText(new RegExp(`^sunny-red-lemur: ${paused(2)}`));
    expect(screen.getByText(new RegExp(`^glad-silver-falcon: ${paused(1)}`))).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: strings['notice.resume'] })).toHaveLength(2);
  });

  it('a failed read and a starting computer show in their groups too, with Try again on the failed one', async () => {
    await renderPage(page, { state: 'partial', path: '/bots' });
    await screen.findByText(strings['notice.failedShort']);
    const texts = rowsText();
    const failedAt = texts.findIndex((x) => x.includes(strings['notice.failedShort']));
    expect(texts[failedAt - 1]).toMatch(/cinder/);
    expect(texts[failedAt]).toContain(strings['action.tryAgain']);
    // Its Try again names the computer it reads again (the visible text stays "Try again").
    expect(screen.getByRole('button', { name: K['groupNotes.actionOn'].replace('{{action}}', strings['action.tryAgain']).replace('{{name}}', 'cinder') })).toHaveTextContent(strings['action.tryAgain']);
    const startingAt = texts.findIndex((x) => x.includes(strings['notice.starting']));
    expect(texts[startingAt - 1]).toMatch(/boreal/);
    expect(document.body.textContent).not.toMatch(/(atlas|boreal|cinder): /);
  });

});

// Bots list grouped by computer: the computer's header names it, so the rows under it do not
// repeat it in a COMPUTER column, and the header says in words how many Bots it holds ("2 Bots", "No Bots" for a group
// that only has its note), words that stay in the header button's name.
const countWords = (n: number) => (n === 0 ? strings['group.countNone'] : strings[n === 1 ? 'list.count_one' : 'list.count_other'].replace('{{count}}', String(n)));
/** A group header row: one cell across the table holding the collapse button (a Bot row's menu button is no header). */
const headerBtn = (tr: Element) => (tr.children.length === 1 && tr.children[0]!.getAttribute('colspan') !== null && !tr.querySelector('[data-group-note]') ? tr.querySelector<HTMLElement>('button[aria-expanded]') : null);
/** Each group header button with the number of Bot rows drawn under it (its note row is not a Bot). */
const groupsDrawn = () => {
  const out: Array<{ btn: HTMLElement; rows: number }> = [];
  for (const tr of document.querySelectorAll('table tbody tr')) {
    const btn = headerBtn(tr);
    if (btn) out.push({ btn, rows: 0 });
    else if (!tr.querySelector('[data-group-note]') && tr.querySelector('td') && out.length > 0 && tr.getAttribute('aria-hidden') !== 'true') out[out.length - 1]!.rows++;
  }
  return out;
};

describe('the Bots list grouped by computer reads as computer, then its Bots', () => {
  it('each header says how many Bots it holds in words, in its button name; a group with rows says how many', async () => {
    await renderPage(page, { state: 'railPaused', path: '/bots' });
    await screen.findByText(paused(1));
    const gs = groupsDrawn();
    expect(gs.length).toBeGreaterThan(1);
    expect(gs.some((g) => g.rows === 0)).toBe(true);
    expect(gs.some((g) => g.rows > 0)).toBe(true);
    for (const g of gs.filter((x) => x.rows > 0)) {
      // The count ends the header, its paused Bots after it in the same words ("1 Bot · 2 paused").
      expect(g.btn.textContent?.trim()).toMatch(new RegExp(`${countWords(g.rows)}( · \\d+ paused)?$`));
      expect(g.btn).toHaveAccessibleName(expect.stringContaining(countWords(g.rows)));
    }
  });

  it('a computer whose only Bots are paused shows no count: "No Bots" beside "1 paused" would be false', async () => {
    await renderPage(page, { state: 'railPaused', path: '/bots' });
    await screen.findByText(paused(1));
    const pausedOnly = groupsDrawn().filter((g) => g.rows === 0);
    expect(pausedOnly.length).toBeGreaterThan(0);
    for (const g of pausedOnly) expect(g.btn.textContent).not.toContain(strings['group.countNone']);
  });

  it('a computer whose Bots could not be read says so in its header, never "No Bots"', async () => {
    await renderPage(page, { state: 'railLong', path: '/bots' });
    await waitFor(() => expect(groupsDrawn().some((g) => g.btn.textContent?.includes(strings['group.countFailed']))).toBe(true));
    for (const g of groupsDrawn()) expect(g.btn.textContent).not.toContain(strings['group.countNone']);
  });

  it('the table has no COMPUTER column while it groups by computer: each row sits under its computer\'s name', async () => {
    await renderPage(page, { state: 'railPaused', path: '/bots' });
    await screen.findByText(paused(1));
    expect(groupsDrawn().length).toBeGreaterThan(1);
    expect(screen.queryByRole('columnheader', { name: strings['col.computer'] })).toBeNull();
    // A Bot row names no computer: the names appear in the headers only.
    for (const tr of document.querySelectorAll('table tbody tr')) {
      if (headerBtn(tr) || tr.querySelector('[data-group-note]') || tr.getAttribute('aria-hidden') === 'true') continue;
      expect(tr.textContent ?? '').not.toMatch(/sunny-red-lemur|glad-silver-falcon|daring-mint-walrus/);
    }
  });
});
