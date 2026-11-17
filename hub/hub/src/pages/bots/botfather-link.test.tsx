// Vitest: wherever the Bots page names @BotFather, the name is a link to its chat in Telegram
// (the kit Link: an absolute https address opens in a new tab): the Setup privacy step's sentence, the group steps,
// the agent's note under a setting and the agent's own setup steps. (Page FAQ answers are plain text by contract.)
import { render, renderPage, screen, userEvent, within } from '@app/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import { ChatNames } from '@kit';
import page from './page';
import { BOTFATHER_URL, withBotFather } from './parts/botFather';
import strings from './strings.en.json';

beforeAll(async () => {
  await import('./view');
}, 30000);

const KEY = 'c-atlas~a1b2c3d4e5f60718293a4b5c~chief';
const open = (state: string, extra = '') => renderPage(page, { state, path: `/bots?sel=${encodeURIComponent(KEY)}&tab=apps${extra}` });
const drawer = () => screen.findByRole('dialog');
const step = (k: keyof typeof strings) => new RegExp(`^${strings[k]}`);
const botFatherLinks = (el: HTMLElement) => within(el).queryAllByRole('link', { name: '@BotFather' });

describe('@BotFather is a link', () => {
  it('withBotFather draws each @BotFather as a link to its chat, opening in a new tab, the rest as it is', () => {
    render(<p data-testid="p">{withBotFather('Send /setprivacy to @BotFather, then ask @BotFather again.')}</p>);
    const p = screen.getByTestId('p');
    expect(p).toHaveTextContent('Send /setprivacy to @BotFather, then ask @BotFather again.');
    const links = botFatherLinks(p);
    expect(links).toHaveLength(2);
    for (const a of links) {
      expect(a).toHaveAttribute('href', BOTFATHER_URL);
      expect(a).toHaveAttribute('target', '_blank');
    }
    expect(BOTFATHER_URL).toBe('https://t.me/BotFather');
  });

  it('text drawn with app marks keeps its marks around the link (agent notes and setup steps)', () => {
    render(<p data-testid="p">{withBotFather('Open \u0000telegram\u0000 and talk to @BotFather.', (x) => <ChatNames text={x} />)}</p>);
    const p = screen.getByTestId('p');
    expect(p.querySelector('[data-chat-app="telegram"]')).not.toBeNull();
    expect(botFatherLinks(p)).toHaveLength(1);
    expect(p).toHaveTextContent('Open Telegram and talk to @BotFather.');
  });

  it('Setup: the privacy step says "Send /setprivacy to @BotFather" with @BotFather a link', async () => {
    await open('channelGroupAsks', '&app=ch-tg');
    const d = await drawer();
    const card = within(d).getByRole('region', { name: step('setup.step.privacy') });
    const links = botFatherLinks(card);
    expect(links.length).toBeGreaterThan(0);
    for (const a of links) expect(a).toHaveAttribute('href', BOTFATHER_URL);
  });

  it('Add a chat app: the agent\'s setup step that names @BotFather draws it as a link to its chat, the words unchanged', async () => {
    await renderPage(page, { path: `/bots?sel=${encodeURIComponent(KEY)}&tab=apps&app=new` });
    await userEvent.click(await screen.findByRole('button', { name: strings['ui.next'] }));
    const list = await screen.findByRole('group', { name: strings['chan.setup.title'].replace('{{app}}', 'Telegram') }, { timeout: 10000 });
    const first = within(list).getAllByRole('listitem')[0] as HTMLElement;
    expect(first).toHaveTextContent('Open Telegram and start a chat with @BotFather.');
    const links = botFatherLinks(first);
    expect(links).toHaveLength(1);
    const a = links[0] as HTMLElement;
    expect(a).toHaveAttribute('href', 'https://t.me/BotFather');
    expect(a).toHaveAccessibleName('@BotFather');
    expect(a).toHaveAttribute('target', '_blank');
    expect(a.getAttribute('rel') ?? '').toMatch(/noopener/);
    expect(a.getAttribute('rel') ?? '').toMatch(/noreferrer/);
  }, 60_000);

  it('Chats: the group steps name @BotFather as a link', async () => {
    await open('channelGroupAsks', '&app=ch-tg');
    await userEvent.click(within(await drawer()).getByRole('button', { name: strings['chan.rail.chats'] }));
    const d = await drawer();
    await userEvent.click(within(d).getByRole('button', { name: strings['flow.group.title'] }));
    const row = within(d).getByText('/setprivacy').closest('li') as HTMLElement;
    expect(botFatherLinks(row)).toHaveLength(1);
    expect(botFatherLinks(row)[0]).toHaveAttribute('href', BOTFATHER_URL);
  });
});
