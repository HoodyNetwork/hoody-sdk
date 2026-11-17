// Vitest: a Servers card's footer shows the server's AI use, five lanes by core's lane rule (as Billing).
// What was not read is never a 0: a failed read, a server past the read's limit, one the answer could not read, and a
// lane with no reading each say so. List view makes no AI read at all.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { localSetting } from '@core';
import { act, render, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { aiReads } from './fixtures';
import { ServerAiFoot } from './parts/ServerAi';
import page from './page';
import strings from './strings.en.json';

const present = () => localSetting('hub.v3.table.present.machines');
beforeEach(() => {
  aiReads.length = 0;
});
afterEach(() => {
  present().set(null);
});

const card = (name: string) => screen.getByText(name, { selector: 'strong' }).closest('[data-row-id]') as HTMLElement;
const footOf = (name: string) => card(name).querySelector('[class*="cardFoot"]') as HTMLElement;
const lanesOf = (name: string) => within(footOf(name)).getAllByRole('listitem').map((li) => li.textContent);

describe('computers: AI use on each Servers card', () => {
  it('shows the five lanes in order: percent, not used, off and no reading in words', async () => {
    await renderPage(page, { path: '/computers/servers' });
    await screen.findByText('ash-3', { selector: 'strong' }, { timeout: 8000 });
    await waitFor(() => expect(within(footOf('ash-3')).queryAllByRole('listitem')).toHaveLength(5), { timeout: 8000 });
    expect(lanesOf('ash-3')).toEqual(['Chat40%', 'Quick decisions0%', 'Web search90%', 'SpeechNot on this server', 'TranscriptionNo reading']);
    // The bar carries the full sentence, drop-back time included.
    const chat = within(footOf('ash-3')).getByRole('meter', { name: /^Chat: 40% used · drops back about / });
    expect(chat.getAttribute('aria-valuenow')).toBe('40');
    expect(within(footOf('ash-3')).getByRole('meter', { name: 'Web search: 90% used' })).toBeTruthy();
    // fra-7 is at its limit on Chat.
    expect(within(footOf('fra-7')).getByRole('meter', { name: /^Chat: Limit reached · back about / })).toBeTruthy();
  });

  it('a server the answer could not read says so, with no bar and no percent', async () => {
    await renderPage(page, { path: '/computers/servers' });
    await screen.findByText('n12', { selector: 'strong' }, { timeout: 8000 });
    await within(card('n12')).findByText(strings['srv.ai.unavailable'], {}, { timeout: 8000 });
    expect(within(footOf('n12')).queryByRole('meter')).toBeNull();
    expect(footOf('n12').textContent).not.toMatch(/%/);
  });

  it('a failed read says it could not be read on every card, never 0', async () => {
    await renderPage(page, { path: '/computers/servers', state: 'serversAiDown' });
    await screen.findByText('ash-3', { selector: 'strong' }, { timeout: 8000 });
    for (const name of ['ash-3', 'fra-7', 'n12']) {
      await within(card(name)).findByText(strings['aiu.loadErr'], {}, { timeout: 8000 });
      expect(within(footOf(name)).queryByRole('meter')).toBeNull();
    }
  });

  it('servers past the read say they were not read; a server the answer leaves out says so too', async () => {
    await renderPage(page, { path: '/computers/servers', state: 'serversAiCapped' });
    await screen.findByText('ash-3', { selector: 'strong' }, { timeout: 8000 });
    await waitFor(() => expect(within(footOf('ash-3')).queryAllByRole('listitem')).toHaveLength(5), { timeout: 8000 });
    for (const name of ['fra-7', 'n12']) expect(within(card(name)).getByText(strings['srv.ai.notReadMore'])).toBeTruthy();
  });

  it('a server missing from a complete answer was not read', async () => {
    await renderPage(page, { path: '/computers/servers', state: 'serversKinds' });
    await screen.findByText('old-1', { selector: 'strong' }, { timeout: 8000 });
    await within(card('old-1')).findByText(strings['srv.ai.notRead'], {}, { timeout: 8000 });
  });

  it('list view reads no AI use and shows none; switching to cards reads it once', async () => {
    // renderPage boots with clean storage: List is picked on Computers (which never reads AI use), then Servers opens.
    const { router } = await renderPage(page, { path: '/computers' });
    await userEvent.click(await screen.findByRole('radio', { name: 'List' }, { timeout: 8000 }));
    expect(present().get()).toBe('list');
    await act(async () => {
      router.history.push('/computers/servers');
    });
    await screen.findByText('n12', { selector: 'strong' }, { timeout: 8000 });
    await new Promise((r) => setTimeout(r, 300));
    expect(aiReads).toHaveLength(0);
    expect(screen.queryByText(strings['srv.col.ai'])).toBeNull();
    await userEvent.click(screen.getByRole('radio', { name: 'Cards' }));
    await waitFor(() => expect(within(footOf('ash-3')).queryAllByRole('listitem')).toHaveLength(5), { timeout: 8000 });
    expect(aiReads).toHaveLength(1);
  });

  for (const state of [undefined, 'serversAiDown'] as const) {
    it(`reads once per visit: List and back to Cards never reads again (${state ? 'after a failed read' : 'after a good read'})`, async () => {
      await renderPage(page, { path: '/computers/servers', state });
      await screen.findByText('ash-3', { selector: 'strong' }, { timeout: 8000 });
      await waitFor(() => expect(aiReads).toHaveLength(1), { timeout: 8000 });
      for (let i = 0; i < 2; i += 1) {
        await userEvent.click(screen.getByRole('radio', { name: 'List' }));
        await userEvent.click(screen.getByRole('radio', { name: 'Cards' }));
      }
      await new Promise((r) => setTimeout(r, 300));
      expect(aiReads).toHaveLength(1);
      // The footer still shows the one read's outcome.
      await within(card('ash-3')).findByText(state ? strings['aiu.loadErr'] : strings['aiu.lane.chat'], {}, { timeout: 8000 });
    });
  }
});

describe('computers: a failed reread never keeps showing an older reading', () => {
  it('a read that failed after an earlier answer says it failed, with no bar and no percent', async () => {
    const old = { byId: { s1: { ok: true, lanes: [{ lane: 'chat' as const, off: false, pct: 0, resets: null }] } }, truncated: false };
    render(<ServerAiFoot id="s1" read={{ data: old, error: { kind: 'forbidden' } }} />);
    expect(screen.getByText(strings['aiu.noAccess'])).toBeTruthy();
    expect(screen.queryByRole('meter')).toBeNull();
    expect(screen.queryByText(/%/)).toBeNull();
  });
});
