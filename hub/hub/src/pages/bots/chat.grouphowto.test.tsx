// Vitest: how a group joins, as a StepList under a place label
// per side (in the app, back here), the command as a CodeLine with copy, the mention rules in one closed Why that ends
// with the page FAQ's answer, and one Band with "Open Settings" when the app's group access blocks a join.
// eslint-disable-next-line no-restricted-imports -- a router harness for the kit links GroupHowTo draws, not page code
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, render, renderPage, screen, userEvent, within } from '@app/testing';
import { CoreQueryProvider } from '@core';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Channel } from './data';
import { GroupHowTo } from './parts/ChatFlow';
import { resetCodesForTests } from './codes';
import page from './page';
import strings from './strings.en.json';

beforeAll(async () => {
  await import('./view');
}, 30000);
afterEach(() => resetCodesForTests());

const KEY = 'c-atlas~a1b2c3d4e5f60718293a4b5c~chief';
const S = strings as Record<string, string>;
const fill = (text: string, vars: Record<string, string>) => Object.entries(vars).reduce((acc, [k, v]) => acc.split(`{{${k}}}`).join(v), text);
const mode = (m: string) => ({ setting: S['set.n.group_mode'] ?? '', value: S[`set.v.group_mode.${m}`] ?? '', allowed: S['set.n.allowed_chats'] ?? '' });
const named = (s: string) => s.replace('{{telegram}}', 'Telegram').replace('{{slack}}', 'Slack').replace('{{discord}}', 'Discord');
const whole = (text: string) => (_: string, el: Element | null) => !!el && (el.textContent ?? '').includes(text) && ![...el.children].some((c) => (c.textContent ?? '').includes(text));

const chats = async (state: string, app: string) => {
  await renderPage(page, { state, path: `/bots?sel=${encodeURIComponent(KEY)}&tab=apps&app=${app}` });
  const d = await screen.findByRole('dialog');
  await userEvent.click(within(d).getByRole('button', { name: strings['chan.rail.chats'] }));
  // The steps open while the app has no group; once it has one they are one click away.
  const title = within(d).getByRole('button', { name: strings['flow.group.title'] });
  if (title.getAttribute('aria-expanded') === 'false') await userEvent.click(title);
  return d;
};
/** The group steps' own list (the StepList's accessible name). */
const steps = (d: HTMLElement) => within(d).getByRole('group', { name: strings['flow.group.steps'] });
const rows = (d: HTMLElement) => within(steps(d)).getAllByRole('listitem');

describe('how a group joins, as steps', () => {
  it('Slack: numbered steps under IN THE CHAT APP and BACK HERE; the command is a CodeLine with copy; who may send it is a note', async () => {
    const d = await chats('channelGroupAsks', 'ch-sl');
    const list = steps(d);
    expect(within(list).getByText(strings['flow.group.where.app'])).toBeInTheDocument();
    expect(within(list).getByText(strings['flow.group.where.here'])).toBeInTheDocument();
    const r = rows(d);
    expect(r).toHaveLength(3);
    expect(r[0]).toHaveTextContent(strings['flow.group.add.slack']);
    // The bind row: the command with the mention, as a CodeLine with its own copy button.
    const code = within(r[1]!).getByText(`!bind ${strings['flow.group.atBot']}`);
    expect(code.tagName).toBe('CODE');
    expect(within(r[1]!).getByRole('button')).toBeInTheDocument();
    expect(r[1]).toHaveTextContent(strings['flow.group.bindWho']);
    expect(within(r[1]!).getByText(whole(named(strings['flow.group.bindPlain'].replace('{{app}}', '{{slack}}'))))).toBeInTheDocument();
    expect(r[2]).toHaveTextContent(strings['flow.group.approveRow']);
    expect(r[2]).toHaveTextContent(strings['flow.group.approveNote']);
    // No Band while the default group access lets a group ask.
    expect(within(d).queryByRole('button', { name: strings['flow.group.settings'] })).toBeNull();
  });

  it('Telegram: privacy first as its own row, with /setprivacy as a CodeLine and Disable in bold; @name; /bind', async () => {
    const d = await chats('channelGroupAsks', 'ch-tg');
    const r = rows(d);
    expect(r).toHaveLength(4);
    expect(within(r[0]!).getByText('/setprivacy').tagName).toBe('CODE');
    expect(within(r[0]!).getByText(strings['flow.group.privacyButton']).tagName).toBe('STRONG');
    expect(r[0]).toHaveTextContent(strings['flow.group.privacyNote']);
    expect(r[1]).toHaveTextContent(strings['flow.group.addRow.telegram']);
    expect(within(r[1]!).getByText('@atlas_support_bot').tagName).toBe('CODE');
    expect(within(r[2]!).getByText('/bind').tagName).toBe('CODE');
    expect(within(steps(d)).getByText(strings['flow.group.where.app'])).toBeInTheDocument();
  });


  for (const app of ['ch-sl', 'ch-tg', 'ch-dc']) {
    it(`${app}: every row reads in 70 characters or fewer, by what it shows`, async () => {
      const d = await chats('channelGroupAsks', app);
      for (const li of rows(d)) {
        // the row's text line (its note, when any, is a separate line), as it shows: copy buttons left out
        const text = li.children[1]?.firstElementChild?.cloneNode(true) as HTMLElement;
        for (const b of [...text.querySelectorAll('button')]) b.remove();
        const line = text.textContent ?? '';
        expect(line.length, `${app}: ${line}`).toBeLessThanOrEqual(70);
      }
    });
  }

  it('the mention rules sit in one closed Why that ends with the FAQ link', async () => {
    const d = await chats('channelGroupAsks', 'ch-sl');
    const why = within(d).getByRole('button', { name: strings['flow.group.why'] });
    expect(why).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(why);
    expect(within(d).getByText(whole(named(strings['flow.group.mentionOnAddressed'].replace('{{app}}', '{{slack}}'))))).toBeVisible();
    expect(within(d).getByRole('link', { name: new RegExp(strings['flow.group.whyMore']) })).toBeVisible();
  });

  it('group access open: no approval step; the row says the group shows below once it asks, the note says why', async () => {
    const d = await chats('channelGroupOpen', 'ch-tg');
    const last = rows(d).at(-1)!;
    expect(last).toHaveTextContent(strings['flow.group.openRow']);
    expect(last).toHaveTextContent(fill(strings['flow.group.openNote'], mode('open')));
    expect(within(d).queryByText(strings['flow.group.approveRow'])).toBeNull();
  });

  for (const [state, m, key] of [
    ['channelGroupsOff', 'off', 'flow.group.modeOff'],
    ['channelGroupAllowlist', 'allowlist', 'flow.group.modeAllowlist'],
  ] as const) {
    it(`group access ${m}: one Band says so, and its Open Settings button opens this app's Settings`, async () => {
      const d = await chats(state, 'ch-sl');
      const band = within(d).getByText(fill(strings[key], mode(m)));
      expect(band.closest('[role=alert]')).not.toBeNull();
      await userEvent.click(within(d).getByRole('button', { name: strings['flow.group.settings'] }));
      expect(within(d).queryByRole('group', { name: strings['flow.group.steps'] })).toBeNull();
      expect(within(d).getAllByText(S['set.n.group_mode'] ?? '').length).toBeGreaterThan(0);
    });
  }

  it('group access the page does not know: a neutral Band, no bind or approval row', async () => {
    const d = await chats('channelGroupModeUnknown', 'ch-tg');
    const band = within(d).getByText(fill(strings['flow.group.modeUnknown'], { setting: S['set.n.group_mode'] ?? '' }));
    expect(band.closest('[role=status]')).not.toBeNull();
    expect(within(d).queryByText('/bind')).toBeNull();
    expect(within(d).queryByText(strings['flow.group.approveRow'])).toBeNull();
  });
});

// GroupHowTo on its own, for what the page fixtures do not hold: a Discord invite, a 64-character bot name, bind turned off.
const eff = (e: Record<string, unknown>) => Object.fromEntries(Object.entries(e).map(([k, value]) => [k, { value, source: 'default' }]));
const app = (over: Partial<Channel>, settings: Record<string, unknown> = {}): Channel => ({
  id: 'ch-x', kind: 'telegram', label: 'X', enabled: true, state: 'running', needsOwner: false, people: 0, chats: 0, homeChat: null, reason: '', principals: [], chatRows: [], notes: [],
  view: { settings: {}, effective: eff({ group_mode: 'owner_approves', mention_only: true, ...settings }) },
  ...over,
} as Channel);
/** Draws one element under a router (the kit's links need one). */
const draw = async (el: ReactNode) => {
  const router = createRouter({ routeTree: createRootRoute({ component: () => el }), history: createMemoryHistory({ initialEntries: ['/bots'] }) });
  await act(async () => {
    render(
      <CoreQueryProvider>
        <RouterProvider router={router} />
      </CoreQueryProvider>,
    );
    await router.load();
  });
};

describe('GroupHowTo on its own', () => {
  it('Discord: the invite URL is the open link at the end of the place label', async () => {
    await draw(<GroupHowTo channel={app({ kind: 'discord', identity: { name: 'Atlas', username: 'atlas', inviteUrl: 'https://discord.com/oauth2/authorize?client_id=1' } })} />);
    const list = screen.getByRole('group', { name: strings['flow.group.steps'] });
    const link = within(list).getByRole('link', { name: new RegExp(strings['flow.group.invite']) });
    expect(link).toHaveAttribute('href', 'https://discord.com/oauth2/authorize?client_id=1');
  });

  it('Telegram: a 64-character bot name keeps the add row to one short line; the name is a CodeLine in its note', async () => {
    const name = 'a'.repeat(64);
    await draw(<GroupHowTo channel={app({ identity: { name: 'Long', username: name, inviteUrl: '' } })} />);
    const r = within(screen.getByRole('group', { name: strings['flow.group.steps'] })).getAllByRole('listitem');
    expect(r[1]!.children[1]?.firstElementChild?.textContent).toBe(strings['flow.group.addRow.telegram']);
    expect(within(r[1]!).getByText(`@${name}`).tagName).toBe('CODE');
  });

  it('bind turned off: a warn Band says so with Open Settings, and there is no bind row', async () => {
    const onSettings = vi.fn();
    await draw(<GroupHowTo channel={app({ kind: 'slack' }, { chat_commands: ['help'] })} onSettings={onSettings} />);
    const band = screen.getByText(strings['flow.group.bindOff']);
    expect(band.closest('[role=alert]')).not.toBeNull();
    expect(screen.queryByText(/bind/)).toBe(band);
    await userEvent.click(screen.getByRole('button', { name: strings['flow.group.settings'] }));
    expect(onSettings).toHaveBeenCalledTimes(1);
  });

  it('the first blocker wins: group access off outranks bind turned off', async () => {
    await draw(<GroupHowTo channel={app({ kind: 'slack' }, { group_mode: 'off', chat_commands: ['help'] })} />);
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.queryByText(strings['flow.group.bindOff'])).toBeNull();
  });
});
