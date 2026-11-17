// Vitest: Pause all / Resume all chat apps. The page reads the Bot's channel-wide settings (never "not paused"
// whatever the Bot's setting was); the toggle is a held change like every Bot change: a lost answer is read back (the
// setting now shows the wanted value) or dismissed, never sent again.
import { answers, bootFixtureCore, reply, type FixtureRequest } from '@core';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { IDENTITIES, LOCK_KEYS, PROVES, ROUTES, channelSettingsOf, registerTargets, sendChannelsPause } from './data';
import page from './page';
import strings from './strings.en.json';

const KEY = 'c-atlas~global~chief';

describe('channelSettingsOf reads the effective values', () => {
  it('takes the value that applies, with the Bot-level setting as fallback', () => {
    expect(channelSettingsOf({ settings: {}, effective: { channels_paused: { value: true, source: 'bot' }, max_channels: { value: 8, source: 'default' }, rate_bot_per_day: { value: 200, source: 'bot' } } })).toMatchObject({ ok: true, paused: true, maxChannels: 8, rateBotPerDay: 200 });
    expect(channelSettingsOf({ settings: { channels_paused: true }, effective: {} })).toMatchObject({ ok: false, paused: true });
    expect(channelSettingsOf({ settings: {}, effective: {} })).toEqual({ ok: false, paused: false, maxChannels: 0, rateBotPerDay: 0, view: { settings: {}, effective: {} } });
    expect(channelSettingsOf({ settings: { lang: 'de' }, effective: { lang: { value: 'de', source: 'bot' } } }).view).toEqual({ settings: { lang: 'de' }, effective: { lang: { value: 'de', source: 'bot' } } });
    expect(channelSettingsOf('nope').ok).toBe(false);
  });
});

describe('what proves a pause or resume', () => {
  // One refresh answers every read of the change in one flat list (settings, chat apps, the Bot view): the judge tells them apart by what they carry.
  const view = (uid: string, viewId: string | null = 'chief') => ({ [KEY]: { ok: true, ...(viewId === null ? {} : { id: viewId }), uid, name: 'Chief' } });
  const settings = (paused: boolean | null) => ({ [KEY]: paused === null ? undefined : { ok: true, paused, maxChannels: 4, rateBotPerDay: 0 } });
  const read = (paused: boolean | null, uid = 'u1', viewId: string | null = 'chief') => [[settings(paused), view(uid, viewId)]] as const;
  const id = { botKey: KEY, uid: 'u1', paused: true };
  it('a read showing the wanted value proves it; the other value or no read proves nothing', () => {
    expect(PROVES.channelsPause?.(id, read(true))).toBe('applied');
    expect(PROVES.channelsPause?.(id, read(false))).toBeUndefined();
    expect(PROVES.channelsPause?.(id, read(null))).toBeUndefined();
    expect(PROVES.channelsPause?.(id, [[]])).toBeUndefined();
    expect(PROVES.channelsPause?.({ ...id, paused: false }, [[{ [KEY]: { ok: false, paused: false, maxChannels: 0, rateBotPerDay: 0 } }, view('u1')]])).toBeUndefined();
  });
  it('a replacement Bot (another uid) or a read without the Bot view proves nothing', () => {
    expect(PROVES.channelsPause?.(id, read(true, 'u2'))).toBeUndefined();
    expect(PROVES.channelsPause?.(id, [[settings(true)]])).toBeUndefined();
    // The view must name this Bot: no id, or another Bot's id with the same uid, proves nothing.
    expect(PROVES.channelsPause?.(id, read(true, 'u1', null))).toBeUndefined();
    expect(PROVES.channelsPause?.(id, read(true, 'u1', 'other'))).toBeUndefined();
    expect(PROVES.channelsPause?.(id, read(true, 'u1', 'chief'))).toBe('applied');
    expect(PROVES.channelsPause?.({ botKey: KEY, paused: true }, read(true))).toBeUndefined();
  });
  it('Pause and Resume share one lock, and the identity names the Bot, its uid and the wanted state', () => {
    expect(LOCK_KEYS.channelsPause?.({ botKey: KEY, uid: 'u1', paused: false, extra: 'x' })).toEqual({ botKey: KEY });
    expect(LOCK_KEYS.channelsPause?.({ botKey: KEY, uid: 'u1', paused: true })).toEqual(LOCK_KEYS.channelsPause?.({ botKey: KEY, uid: 'u1', paused: false }));
    expect(IDENTITIES.channelsPause?.({ botKey: KEY, uid: 'u1', paused: false, extra: 'x' })).toEqual({ botKey: KEY, uid: 'u1', paused: false });
  });
});

describe('the live send', () => {
  it('is one PATCH of channels_paused to the Bot, and nothing else', async () => {
    const bodies: unknown[] = [];
    registerTargets([{ id: 'c-atlas', project_id: 'p-1', server_name: 'atlas-srv' }]);
    bootFixtureCore({
      rules: [
        reply(ROUTES.chanSettingsPatch, (req: FixtureRequest) => {
          bodies.push(req.body);
          return answers.ok({ settings: { channels_paused: true }, effective: { channels_paused: { value: true, source: 'bot' } }, applied: 'live', warnings: [] });
        }),
      ],
    });
    await sendChannelsPause({ botKey: KEY, paused: true });
    await sendChannelsPause({ botKey: KEY, paused: false });
    expect(bodies).toEqual([{ channels_paused: true }, { channels_paused: false }]);
  });
});

describe('the Chat apps tab', () => {
  const tab = (state?: string) => renderPage(page, { state, path: `/bots?sel=${encodeURIComponent(`${KEY.replace('global', 'a1b2c3d4e5f60718293a4b5c')}`)}&tab=apps` });
  beforeEach(() => undefined);

  it('offers Pause all while the apps run, and Resume all when the Bot has paused them', async () => {
    await tab();
    expect(await screen.findByRole('button', { name: strings['chan.pauseAll'] })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: strings['chan.resumeAll'] })).toBeNull();
  });

  it('a paused Bot says so and offers Resume all', async () => {
    await tab('channelsPaused');
    expect(await screen.findByRole('button', { name: strings['chan.resumeAll'] })).toBeInTheDocument();
    expect(screen.getByText(strings['chan.pausedAll'])).toBeInTheDocument();
  });

  /** Every app's Needs you cell says Nothing and no row offers a fix (owner, privacy, requested groups, webhook...). */
  const asksNothing = (table: HTMLElement) => {
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.length).toBeGreaterThan(0);
    const fixes = Object.entries(strings).filter(([k]) => k.startsWith('flow.wait.go.')).map(([, v]) => v);
    for (const r of rows) {
      expect(r.querySelectorAll('td')[5]?.textContent).toBe(strings['apps.needsNone']);
      for (const f of fixes) expect(within(r).queryByRole('button', { name: f })).toBeNull();
    }
  };

  // A paused app asks nothing (no badge, no waiting lines), as does every app while the Bot has them paused.
  it('paused apps put no count on the Chat apps tab and nothing in the Needs you column', async () => {
    await tab('channelsPaused');
    await screen.findByRole('button', { name: strings['chan.resumeAll'] });
    expect(screen.getByRole('tab', { name: new RegExp(`^${strings['tab.apps']}`) })).toHaveTextContent(new RegExp(`^${strings['tab.apps']}$`));
    asksNothing(await screen.findByRole('table', { name: strings['apps.table'].replace('{{name}}', 'Chief') }));
  });

  it('while the Bot has its chat apps paused, apps that still read as running ask nothing either', async () => {
    await tab('channelsPausedBot');
    await screen.findByRole('button', { name: strings['chan.resumeAll'] });
    expect(screen.getByRole('tab', { name: new RegExp(`^${strings['tab.apps']}`) })).toHaveTextContent(new RegExp(`^${strings['tab.apps']}$`));
    asksNothing(await screen.findByRole('table', { name: strings['apps.table'].replace('{{name}}', 'Chief') }));
  });

  it('the same apps, not paused, show their count and what waits in the Needs you column', async () => {
    await tab();
    await screen.findByRole('button', { name: strings['chan.pauseAll'] });
    expect(screen.getByRole('tab', { name: new RegExp(`^${strings['tab.apps']}`) })).not.toHaveTextContent(new RegExp(`^${strings['tab.apps']}$`));
    expect(screen.getAllByText(strings['apps.need.privacy']).length).toBeGreaterThan(0);
  });

  it('an empty list of a paused Bot still offers Resume all', async () => {
    await tab('noChannelsPaused');
    expect(await screen.findByRole('button', { name: strings['chan.resumeAll'] })).toBeInTheDocument();
  });

  it('an empty list of a Bot that is not paused offers no Pause all', async () => {
    await tab('noChannels');
    await screen.findByText(strings['chan.empty']);
    expect(screen.queryByRole('button', { name: strings['chan.pauseAll'] })).toBeNull();
  });

  it('a lost answer says the pause may have gone through, with Check again, and holds the button', async () => {
    await tab('pauseUnknown');
    await userEvent.click(await screen.findByRole('button', { name: strings['chan.pauseAll'] }));
    expect(await screen.findByText(strings['chan.pause.maybe'])).toBeInTheDocument();
    // The head's Pause all is held with its reason (a head action, aria-disabled so the reason can show).
    await waitFor(() => expect(screen.getByRole('button', { name: strings['chan.pauseAll'] })).toHaveAttribute('aria-disabled', 'true'));
  });
});
