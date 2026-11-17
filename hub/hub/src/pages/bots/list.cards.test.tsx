// Vitest: the Bots list opens on cards. Each Bot is a card with its mark, name, status, a plain line of what it is doing,
// what it is for, where it lives and how to reach it; the summary above counts the Bots and shows those it names; a Bot
// that needs the person carries the one button that answers it; cards are one grid (no computer groups) with the
// computers' notes above it; List, the remembered choice, is the grouped table.
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { localSetting } from '@core';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import page from './page';
import pane from './parts/pane.module.css';
import strings from './strings.en.json';

// The page opens on cards; List (the remembered choice) is the dense table. Set once the page is up: a render starts with
// clean storage.
const asTable = () => act(async () => void localSetting('hub.v3.table.present.bots').set('list'));
afterEach(() => void localSetting('hub.v3.table.present.bots').set(null));
beforeAll(async () => {
  await import('./view');
}, 30000);

const list = () => screen.findByRole('table', { name: strings.title });
const card = async (name: RegExp) => within(await list()).findByRole('row', { name });
const stat = (label: string) => {
  const dt = within(document.querySelector(`dl[aria-label="${strings['strip.label']}"]`) as HTMLElement).getByText(label);
  return dt.parentElement as HTMLElement;
};
const searchOf = (router: { state: { location: { search: unknown } } }) => router.state.location.search as Record<string, unknown>;

describe('the Bots cards', () => {
  it('open by default: a card per Bot with what it is doing, what it is for and how to reach it', async () => {
    await renderPage(page);
    const support = await card(/Support/);
    expect(support.textContent).toContain(strings['now.working']);
    expect(support.textContent).toContain('Answers questions about the shop');
    expect(within(support).getByText(strings['chan.kind.discord'])).toBeInTheDocument();
    const chief = await card(/Chief/);
    expect(chief.textContent).toContain(strings['now.waiting']);
    expect(within(chief).getByText(strings['reach.link'])).toBeInTheDocument();
    // No filler: a Bot reached only from the Hub says so; no dash, no "Not yet".
    const digest = await card(/Digest/);
    expect(digest.textContent).toContain(strings['reach.hubOnly']);
    expect(digest.textContent).not.toMatch(/—|Not yet/);
    // No column headers in cards.
    expect(screen.queryByRole('columnheader', { name: strings['col.status'] })).toBeNull();
  });

  it('a Bot waiting for an answer carries Answer, which opens it; a Bot needing nothing has no such button', async () => {
    const { router } = await renderPage(page);
    const chief = await card(/Chief/);
    await userEvent.click(within(chief).getByRole('button', { name: `Answer Chief` }));
    await waitFor(() => expect(String(searchOf(router).sel)).toMatch(/~chief$/));
    const support = await card(/Support/);
    expect(within(support).queryByRole('button', { name: /^Answer|^Write to|^Let in/ })).toBeNull();
  });

  it('a Bot paused at its limit carries Write to, which opens it', async () => {
    const { router } = await renderPage(page);
    const ledger = await card(/Ledger/);
    expect(ledger.textContent).toContain(strings['now.paused']);
    await userEvent.click(within(ledger).getByRole('button', { name: 'Write to Ledger' }));
    await waitFor(() => expect(String(searchOf(router).sel)).toMatch(/~ledger$/));
  });

  it('groups asking to be let in are the card\'s "now" line (not a tag in the foot), with Let in; privacy stays a quiet note', async () => {
    await renderPage(page, { state: 'chatsWaiting' });
    const chief = await card(/Chief/);
    expect(within(chief).getAllByText('2 groups waiting')).toHaveLength(1);
    expect(chief.textContent).toMatch(/Telegram\s*privacy on/);
    expect(within(chief).getByRole('button', { name: strings['row.letInName'].replace('{{name}}', 'Chief') })).toBeInTheDocument();
  });

  it('the Bots that need the person come first', async () => {
    await renderPage(page);
    const rows = within(await list()).getAllByRole('row').filter((r) => r.hasAttribute('data-row-id'));
    const names = rows.map((r) => r.getAttribute('data-row-id')!.split('~')[2]);
    expect(names.slice(0, 2).sort()).toEqual(['chief', 'ledger']);
  });

  it('cards are one grid: no computer groups, each card names its computer; the paused note sits above with Resume', async () => {
    await renderPage(page, { state: 'suspendedNotice' });
    await list();
    expect(screen.queryByRole('button', { name: /atlas.*Bots/ })).toBeNull();
    const scout = await card(/Scout/);
    expect(within(scout).getByRole('link', { name: /cinder/ })).toBeInTheDocument();
    const note = await screen.findByText(strings['notice.paused_other'].replace('{{count}}', '2'), { exact: false });
    expect(note).toBeInTheDocument();
    expect(screen.getByRole('button', { name: new RegExp(strings['notice.resume']) })).toBeInTheDocument();
  });

  it('every card foot is the two-line height (a 60 px band) with its words centred, so the cards of a row end level (with a chat app or without)', async () => {
    await renderPage(page);
    const css = readFileSync(join(import.meta.dirname, 'parts/pane.module.css'), 'utf8');
    const rule = /\.reach\s*\{([^}]*)\}/.exec(css)?.[1]?.replace(/\s+/g, ' ').trim();
    expect(rule).toBe('display: grid; align-content: center; min-block-size: calc(60px - var(--sp-4) - var(--bw));');
    // The foot's words of a Bot with a chat app (Support) and of one reached only from the Hub (Digest) sit in that box.
    for (const [name, text] of [[/Support/, strings['chan.kind.discord']], [/Digest/, strings['reach.hubOnly']]] as const) {
      const box = within(await card(name)).getByText(text).closest(`.${pane.reach}`);
      expect(box, String(name)).not.toBeNull();
      expect(box!.childElementCount).toBe(1);
    }
  });

  it('the Cards | List switch above the list picks the table (the radio the browser specs click)', async () => {
    await renderPage(page);
    await list();
    expect(screen.getByRole('radio', { name: /^Cards$/i })).toBeChecked();
    await userEvent.click(screen.getByRole('radio', { name: /^List$/i }));
    expect(await screen.findByRole('columnheader', { name: strings['col.status'] })).toBeInTheDocument();
  });

  it('List is the dense table, grouped by computer, the computer with paused Bots first', async () => {
    await renderPage(page, { state: 'suspendedNotice' });
    await asTable();
    await list();
    expect(await screen.findByRole('columnheader', { name: strings['col.status'] })).toBeInTheDocument();
    const heads = [...document.querySelectorAll('table tbody tr')].map((tr) => tr.textContent ?? '').filter((x) => /\d+ Bots?|No Bots/.test(x) && /atlas|cinder|boreal/.test(x));
    expect(heads[0]).toMatch(/atlas/);
  });
});

describe('the summary above the list', () => {
  it('counts the Bots, the working ones, the ones that need you and the ones in chat apps', async () => {
    await renderPage(page);
    await list();
    expect(stat(strings['strip.bots']).textContent).toContain('23');
    expect(stat(strings['strip.working']).textContent).toContain('1');
    expect(stat(strings['strip.needs']).textContent).toContain('2');
    expect(stat(strings['strip.inChat']).textContent).toContain('3');
  });

  it('Show on a count shows those Bots (in the URL); Show all brings every Bot back', async () => {
    const { router } = await renderPage(page);
    await list();
    await userEvent.click(screen.getByRole('button', { name: strings['strip.showWorking'] }));
    await waitFor(() => expect(searchOf(router).status).toBe('working'));
    await waitFor(() => expect(within(screen.getByRole('table', { name: strings.title })).queryByRole('row', { name: /Chief/ })).toBeNull());
    await userEvent.click(screen.getByRole('button', { name: strings['strip.showAllBots'] }));
    await waitFor(() => expect(searchOf(router).status).toBeUndefined());
  });

  it('Need you shows the Bots waiting on the person', async () => {
    const { router } = await renderPage(page);
    await list();
    await userEvent.click(screen.getByRole('button', { name: strings['strip.showNeeds'] }));
    await waitFor(() => expect(searchOf(router).needs).toBe('yes'));
    await waitFor(() => {
      const ids = within(screen.getByRole('table', { name: strings.title }))
        .getAllByRole('row')
        .map((r) => r.getAttribute('data-row-id'))
        .filter(Boolean)
        .map((id) => id!.split('~')[2])
        .sort();
      expect(ids).toEqual(['chief', 'ledger']);
    });
  });

  it('the Bots paused after a sign-in change count as needing you', async () => {
    await renderPage(page, { state: 'suspendedNotice' });
    await list();
    expect(stat(strings['strip.needs']).textContent).toContain('4');
  });

  it('is not drawn on an empty list', async () => {
    await renderPage(page, { state: 'empty' });
    await screen.findByText(/A Bot is an assistant/);
    expect(document.querySelector(`dl[aria-label="${strings['strip.label']}"]`)).toBeNull();
  });
});
