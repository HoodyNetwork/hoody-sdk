// Vitest: wherever the Bots
// page names Telegram, Slack or Discord, the app's official logo (kit/icons.tsx) sits right before the name: labels (the empty
// list, the app cards, the add drawer's picker and setup heading, the manage drawer's subtitle, a message's sender line), a
// setting of one app only (before its label), and running sentences (the tab's description, through the kit's ChatNames).
import { act, renderPage, screen, userEvent, within } from '@app/testing';
import { localSetting } from '@core';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { senderLine } from './logic';
import page from './page';
import strings from './strings.en.json';

beforeAll(async () => {
  await import('./view');
}, 30000);

const KEY = 'c-atlas~a1b2c3d4e5f60718293a4b5c~chief';
const apps = (state?: string, app?: string) => renderPage(page, { state, path: `/bots?sel=${encodeURIComponent(KEY)}&tab=apps${app ? `&app=${app}` : ''}` });

// Each official mark is known by the start of its path (kit/icons.test.tsx compares every path with its source in full).
const START = { telegram: 'M11.944 0A12', slack: 'M27.2 80c0', discord: 'M20.317 4.3698' } as const;
type Kind = keyof typeof START;
const NAME: Record<Kind, string> = { telegram: 'Telegram', slack: 'Slack', discord: 'Discord' };
const markIn = (el: Element): Kind | null => {
  const d = el.querySelector('svg path')?.getAttribute('d') ?? '';
  return (Object.keys(START) as Kind[]).find((k) => d.startsWith(START[k])) ?? null;
};
// The logo comes right before the name: the svg's next sibling holds the name.
const markBefore = (svg: Element | null | undefined) => (svg?.nextSibling?.textContent ?? '').trim();

describe('the Chat apps list', () => {
  it('the empty list shows each app with its own logo before its name', async () => {
    await apps('noChannels');
    const tab = (await screen.findByText(strings['chan.empty'])).closest('section') as HTMLElement;
    for (const k of Object.keys(NAME) as Kind[]) {
      // The empty list's platform row names the app once (the section's description names no app).
      const items = within(tab).getAllByText(NAME[k]);
      expect(items).toHaveLength(1);
      for (const item of items) {
        expect([k, markIn(item)]).toEqual([k, k]);
        expect(markBefore(item.querySelector('svg'))).toBe(NAME[k]);
      }
    }
  });

  it("each app's row shows its app's logo before the app's name in the Kind column, never a letter tile", async () => {
    await apps();
    const rows: Record<string, Kind> = { 'Support chat': 'telegram', 'Team workspace': 'slack', 'Community server': 'discord' };
    for (const [label, k] of Object.entries(rows)) {
      const row = await screen.findByRole('row', { name: new RegExp(label) });
      const kind = row.querySelectorAll('td')[1] as HTMLElement;
      expect([label, markIn(kind)]).toEqual([label, k]);
      expect(markBefore(kind.querySelector('svg'))).toBe(NAME[k]);
      expect(row.querySelector('[class*="monogram"]')).toBeNull();
    }
  });
});

describe('the Bots table', () => {
  afterEach(() => void localSetting('hub.v3.table.present.bots').set(null));

  it("each app in the Chat apps column shows its logo before its name", async () => {
    await renderPage(page, {});
    // The Chat apps column is the List presentation's (the page opens on cards); set once the page is up.
    await act(async () => void localSetting('hub.v3.table.present.bots').set('list'));
    await screen.findByRole('columnheader', { name: strings['col.apps'] });
    const tags = await screen.findAllByText((_, el) => !!el && el.hasAttribute('data-chat-app') && !!el.closest('table'));
    expect(tags.length).toBeGreaterThan(0);
    for (const tag of tags) {
      const k = tag.getAttribute('data-chat-app') as Kind;
      expect([k, markIn(tag)]).toEqual([k, k]);
      expect(markBefore(tag.querySelector('svg'))).toBe(NAME[k]);
    }
    // No plain app name anywhere in the table, and the Bot with all three apps shows three marked names in order.
    const table = tags[0]!.closest('table') as HTMLElement;
    const walk = document.createTreeWalker(table, NodeFilter.SHOW_TEXT);
    const plain: string[] = [];
    for (let n = walk.nextNode(); n; n = walk.nextNode()) if (/\b(Telegram|Slack|Discord)\b/.test(n.textContent ?? '') && !n.parentElement?.closest('[data-chat-app]')) plain.push(n.textContent ?? '');
    expect(plain).toEqual([]);
    const cell = [...table.querySelectorAll('td')].find((td) => td.querySelector('[data-chat-app="discord"]')) as HTMLElement;
    // One running line of marked names, space-separated (read aloud as three words).
    expect(cell.textContent).toBe('Telegram Slack Discord');
    expect([...cell.querySelectorAll('[data-chat-app]')].map((a) => [a.getAttribute('data-chat-app'), markIn(a)])).toEqual([
      ['telegram', 'telegram'],
      ['slack', 'slack'],
      ['discord', 'discord'],
    ]);
  });

  it('each app on a card (the default) shows its logo before its name, and no app is named plain', async () => {
    await renderPage(page, {});
    const table = await screen.findByRole('table', { name: strings.title });
    const tags = await within(table).findAllByText((_, el) => !!el && el.hasAttribute('data-chat-app'));
    expect(tags.length).toBeGreaterThan(0);
    for (const tag of tags) {
      const k = tag.getAttribute('data-chat-app') as Kind;
      expect([k, markIn(tag)]).toEqual([k, k]);
      expect(markBefore(tag.querySelector('svg'))).toBe(NAME[k]);
    }
    const walk = document.createTreeWalker(table, NodeFilter.SHOW_TEXT);
    const plain: string[] = [];
    for (let n = walk.nextNode(); n; n = walk.nextNode()) if (/\b(Telegram|Slack|Discord)\b/.test(n.textContent ?? '') && !n.parentElement?.closest('[data-chat-app]')) plain.push(n.textContent ?? '');
    expect(plain).toEqual([]);
  });
});

describe('the add drawer', () => {
  it('the platform picker shows each logo before its name', async () => {
    await apps(undefined, 'new');
    for (const k of Object.keys(NAME) as Kind[]) {
      const radio = await screen.findByRole('radio', { name: new RegExp(NAME[k]) });
      const option = radio.closest('label') as HTMLElement;
      expect([k, markIn(option)]).toEqual([k, k]);
      expect(markBefore(option.querySelector('svg'))).toBe(NAME[k]);
    }
  });

  it("the add flow's done app row carries the chosen app's logo before its name", async () => {
    await apps('channelSetupSlack', 'new');
    await userEvent.click(await screen.findByRole('radio', { name: /Slack/ }));
    await userEvent.click(await screen.findByRole('button', { name: strings['ui.next'] }));
    const row = (await screen.findByText(new RegExp(`^${strings['chan.addFlow.step.kind']}`))).closest('li') as HTMLElement;
    expect(row).toHaveAttribute('data-state', 'done');
    const app = row.querySelector('[data-chat-app]') as HTMLElement;
    expect(markIn(app)).toBe('slack');
    expect(markBefore(app.querySelector('svg'))).toBe('Slack');
  }, 60_000);
});

describe('the manage drawer', () => {
  it("names the app under its title with the app's logo", async () => {
    await apps(undefined, 'ch-dc');
    const dialog = await screen.findByRole('dialog');
    // The subtitle, and the setup checklist's "Connect Discord": each with the mark before the name.
    const names = await within(dialog).findAllByText(NAME.discord);
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      expect(markIn(name)).toBe('discord');
      expect(markBefore(name.querySelector('svg'))).toBe(NAME.discord);
    }
  });
});

describe("a chat app's own settings", () => {
  const settingsOf = async (app: string) => {
    await apps(undefined, app);
    await userEvent.click(await screen.findByRole('button', { name: strings['chan.rail.settings'] }));
    await userEvent.click(await screen.findByRole('button', { name: new RegExp(strings['set.all']) }));
  };
  it('a setting of one app only carries that app\'s logo before its name, and the control keeps the name', async () => {
    await settingsOf('ch-sl');
    const name = strings['set.n.connection_opens_per_hour'];
    const label = await screen.findByText(name);
    expect(markIn(label)).toBe('slack');
    expect(markBefore(label.querySelector('svg'))).toBe(name);
    expect(screen.getByRole('textbox', { name })).toBeInTheDocument();
  }, 60_000);
  it('the two Discord login limits do the same', async () => {
    await settingsOf('ch-dc');
    for (const key of ['set.n.identify_per_hour', 'set.n.identify_per_day'] as const) {
      const label = await screen.findByText(strings[key]);
      expect([key, markIn(label)]).toEqual([key, 'discord']);
      expect(screen.getByRole('textbox', { name: strings[key] })).toBeInTheDocument();
    }
  }, 60_000);
  it('the Telegram markup choice shows the Telegram logo and keeps its name', async () => {
    await settingsOf('ch-tg');
    const name = strings['set.n.parse_mode'];
    const label = await screen.findByText(name);
    expect(markIn(label)).toBe('telegram');
    expect(screen.getAllByLabelText(name).length).toBeGreaterThan(0);
  }, 60_000);
  it('a setting for every app has no logo', async () => {
    await settingsOf('ch-sl');
    const label = await screen.findByText(strings['set.n.hide_secrets']);
    expect(markIn(label.closest('[data-sg-row]')!)).toBeNull();
  }, 60_000);
});

describe("a message's sender line", () => {
  const t = (key: string, params?: Record<string, string>) => {
    const text = (strings as Record<string, string>)[key];
    return Object.entries(params ?? {}).reduce((acc, [k, v]) => acc.replace(`{{${k}}}`, v), text ?? key);
  };
  it('splits around a chat app door so its logo sits right before the name', () => {
    expect(senderLine(t, { via: 'telegram', who: 'Sam' })).toEqual({ before: 'Sam · ', mark: 'telegram', door: 'Telegram', after: '' });
    expect(senderLine(t, { via: 'discord', who: '' })).toEqual({ before: '', mark: 'discord', door: 'Discord', after: '' });
    // A name that reads like the app keeps its words; only the door gets the logo.
    expect(senderLine(t, { via: 'slack', who: 'Slack' })).toEqual({ before: 'Slack · ', mark: 'slack', door: 'Slack', after: '' });
  });
  it('a door that is no chat app has no logo and the line as before', () => {
    expect(senderLine(t, { via: 'openai', who: 'key:website widget' })).toEqual({ before: 'Key “website widget” · OpenAI-style link', mark: null, door: '', after: '' });
    expect(senderLine(t, { via: '', who: '' })).toEqual({ before: strings['sender.direct'], mark: null, door: '', after: '' });
    expect(senderLine(t, { via: 'carrier-pigeon', who: 'Sam' })).toEqual({ before: 'Sam · Another door', mark: null, door: '', after: '' });
  });
  it('the Activity log shows the Telegram logo before "Telegram"', async () => {
    await renderPage(page, { path: `/bots?sel=${encodeURIComponent(KEY)}` });
    const log = within(await screen.findByRole('list', { name: strings['activity.title'] }));
    const line = (await log.findAllByText('Sam · Telegram'))[0]!;
    expect(markIn(line)).toBe('telegram');
    expect(markBefore(line.querySelector('svg'))).toBe('Telegram');
  });
});
