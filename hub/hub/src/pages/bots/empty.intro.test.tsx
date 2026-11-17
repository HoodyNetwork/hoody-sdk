// Vitest: the empty Bots page says a Bot can be reached from anywhere that speaks HTTP (naming only doors that exist: the
// OpenAI, Anthropic and MCP addresses of its link, and the Telegram, Slack and Discord chat apps), and offers a quiet
// "How to connect" that opens the Guide's Bots section: through the router when the Hub serves the Guide, by the classic
// Guide's own anchor (#g-bots) when it does not.
import { render, renderPage, screen, userEvent } from '@app/testing';
import type { PageManifest } from '@kit/page';
// eslint-disable-next-line no-restricted-imports -- the shell's link provider, a test harness for the link, not page code
import { PagesProvider } from '@shell/pageLinks';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { guideConnectTarget } from './logic';
import page from './page';
import { GuideConnectLink } from './parts/Bits';
import strings from './strings.en.json';

beforeAll(async () => {
  await import('./view');
}, 30000);
afterEach(() => vi.restoreAllMocks());

const served = (...ids: string[]) => ids.map((id) => ({ id, path: `/${id}`, title: id, strings: {}, status: 'ready' }) as unknown as PageManifest);

describe('the empty Bots page intro', () => {
  it('says what a Bot is in one line, then names the doors and the HTTP reach, in plain words', async () => {
    await renderPage(page, { state: 'empty' });
    const body = await screen.findByText(/A Bot is an assistant/);
    expect(body.textContent).toBe(strings['empty.body']);
    const reach = await screen.findByText(/^Talk to it here/);
    const text = reach.textContent ?? '';
    for (const door of ['Telegram', 'Slack', 'Discord', 'HTTP', 'OpenAI', 'Anthropic', 'MCP']) expect(text).toContain(door);
    // Each chat app is named in place of its placeholder, with its mark.
    expect(text).toBe(strings['empty.reach'].replace('{{telegram}}', 'Telegram').replace('{{slack}}', 'Slack').replace('{{discord}}', 'Discord'));
    expect([...reach.querySelectorAll('[data-chat-app] svg')]).toHaveLength(3);
    // Public text: no internal header names, hosts or dashes.
    for (const t of [body.textContent ?? '', text]) expect(t).not.toMatch(/X-Hoody|hoody\.[a-z]{2,}(?![a-z0-9(_-]|\.[a-z])|—|–/);
  });

  it('the empty list holds the one New Bot: the header shows none while it does', async () => {
    await renderPage(page, { state: 'empty' });
    await screen.findByText(/A Bot is an assistant/);
    expect(screen.getAllByRole('button', { name: strings['action.new'] })).toHaveLength(1);
  });

  it('"How to connect" opens the Guide Bots section in the Hub', async () => {
    const { router } = await renderPage(page, { state: 'empty' });
    await userEvent.click(await screen.findByRole('button', { name: strings['empty.connect'] }));
    expect(router.state.location.pathname).toBe('/guide');
    expect(router.state.location.hash).toBe('bots');
  });
});

describe('where "How to connect" goes', () => {
  it('the Hub Guide by #bots', () => {
    expect(guideConnectTarget({ kind: 'hub', href: '/guide' })).toBe('/guide#bots');
  });

  it('a load that serves Bots but not the Guide offers no How to connect (no classic Guide)', () => {
    render(
      <PagesProvider pages={served('bots')}>
        <GuideConnectLink />
      </PagesProvider>,
    );
    expect(screen.queryByRole('button', { name: strings['empty.connect'] })).toBeNull();
    expect(screen.queryByRole('link', { name: strings['empty.connect'] })).toBeNull();
  });

  it('a load that serves the Guide offers it too', () => {
    render(
      <PagesProvider pages={served('bots', 'guide')}>
        <GuideConnectLink />
      </PagesProvider>,
    );
    expect(screen.getByRole('button', { name: strings['empty.connect'] })).toBeTruthy();
  });
});
