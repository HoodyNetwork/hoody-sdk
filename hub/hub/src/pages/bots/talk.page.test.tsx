// Vitest on the Bot page: the Activity composer and Stop, through the page as drawn.
// Stop sends the turn its confirm opened on, also when the Bot's view moves to a later turn while the confirm is open (the hook alone
// is tested in talk.say.live.test.tsx). A message sent while the Bot's own approval waits goes to the Bot as a message only: the page
// sends no gate decision with it (the agent declines the gate itself when a person writes).
import { act, renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import type * as Fixtures from '@app/fixtures';
import type * as Core from '@core';
import { useSyncExternalStore } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BotView } from './data';
import page from './page';
import { formatDateTime } from '@kit';
import S from './strings.en.json';
import K from '@kit/agent/Conversation.strings.en.json';

const CHIEF = 'c-atlas~a1b2c3d4e5f60718293a4b5c~chief';
const at = (extra = '') => `/bots?sel=${encodeURIComponent(CHIEF)}${extra}`;
/** As `turn`: the view reads no running turn (the one the confirm froze ended). */
const ENDED = '<ended>';
/** The moved body up to its time. */
const AT_HEAD = S['bot.stopAt'].slice(0, S['bot.stopAt'].indexOf('{{time}}'));
const MOVED_HEAD = S['bot.stopMoved'].slice(0, S['bot.stopMoved'].indexOf('{{time}}'));

// `turn`: when set, the view read of CHIEF names this turn instead (the Bot moved on); `sent`: every change the page runs, by key.
const W = vi.hoisted(() => {
  const subs = new Set<() => void>();
  return {
    turn: undefined as string | undefined,
    sent: [] as { key: string; vars: unknown }[],
    /** Every core call that is not a read (GET), whatever page code made it: a change sent outside the page source shows here. */
    apiSent: [] as string[],
    subs,
    setTurn(t: string | undefined) {
      this.turn = t;
      for (const f of subs) f();
    },
  };
});

vi.mock('@core', async (orig) => {
  const real = await orig<typeof Core>();
  const recorded = ((route: { path?: string; method?: string }, opts?: unknown) => {
    if ((route.method ?? 'GET') !== 'GET') W.apiSent.push(`${route.method ?? ''} ${route.path ?? ''}`);
    return (real.api as (...a: unknown[]) => unknown)(route, opts);
  }) as typeof real.api;
  return { ...real, api: recorded };
});

vi.mock('@app/fixtures', async (orig) => {
  const fx = await orig<typeof Fixtures>();
  return {
    ...fx,
    fixtureSource: (pageId: string) => {
      const real = fx.fixtureSource(pageId);
      return {
        ...real,
        useQuery: <T,>(key: string) => {
          const r = real.useQuery<T>(key);
          // Subscribed on every read, so a turn change draws the page again (same hook order whatever the key).
          const turn = useSyncExternalStore(
            (f) => {
              W.subs.add(f);
              return () => W.subs.delete(f);
            },
            () => W.turn,
          );
          if (pageId !== 'bots' || key !== 'view' || turn === undefined || !r.data) return r;
          const views = r.data as unknown as Record<string, BotView>;
          const v = views[CHIEF];
          const now = turn === ENDED ? { turnRunning: false, turnId: null } : { turnRunning: true, turnId: turn };
          return v ? { ...r, data: { ...views, [CHIEF]: { ...v, ...now } } as unknown as T } : r;
        },
        useMutation: <T, V = void>(key: string) => {
          const mu = real.useMutation<T, V>(key);
          if (pageId !== 'bots') return mu;
          // Both entry points are recorded: a change run with mutate() is seen as one run with mutateAsync().
          return {
            ...mu,
            mutate: (vars: V, o?: unknown) => {
              W.sent.push({ key, vars });
              (mu.mutate as (a: V, b?: unknown) => void)(vars, o);
            },
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
  W.turn = undefined;
  W.sent = [];
  W.apiSent = [];
});

const sentOf = (key: string) => W.sent.filter((s) => s.key === key).map((s) => s.vars);

describe('Stop on the Bot page', () => {
  it('a turn that starts while the confirm is open is never taken: Stop sends the turn it opened on', async () => {
    // A fixed clock, so the confirm's time is known: it names when the Hub picked the turn and keeps that time after the view moves.
    const SAW = Date.UTC(2026, 10, 7, 14, 2);
    const clock = vi.spyOn(Date, 'now').mockReturnValue(SAW);
    try {
      await renderPage(page, { state: 'working', path: at() });
      await userEvent.click(await screen.findByRole('button', { name: S['bot.stop'] }));
      const dlg = await screen.findByRole('alertdialog');
      const saw = formatDateTime(SAW);
      expect(dlg).toHaveTextContent(S['bot.stopAt'].replace('{{time}}', saw));
      // The Bot's view now reads a later turn (the opened one ended, another started).
      clock.mockReturnValue(SAW + 3_600_000);
      act(() => W.setTurn('turn-later'));
      // The body says the Bot no longer shows that turn and later turns are not stopped.
      expect(dlg).toHaveTextContent(S['bot.stopMoved'].replace('{{time}}', saw));
      expect(dlg).not.toHaveTextContent(AT_HEAD);
      expect(dlg).not.toHaveTextContent(S['bot.stopLater']);
      const go = within(dlg).getByRole('button', { name: S['bot.stopGo'] });
      expect(go).toBeEnabled();
      await userEvent.click(go);
      await waitFor(() => expect(sentOf('stopTurn')).toHaveLength(1));
      expect(sentOf('stopTurn')[0]).toMatchObject({ turnId: 'turn-7f3a' });
    } finally {
      clock.mockRestore();
    }
  });

  it('a frozen turn that ends with nothing running after it says the work running now is not stopped', async () => {
    await renderPage(page, { state: 'working', path: at() });
    await userEvent.click(await screen.findByRole('button', { name: S['bot.stop'] }));
    const dlg = await screen.findByRole('alertdialog');
    act(() => W.setTurn(ENDED));
    expect(dlg).toHaveTextContent(MOVED_HEAD);
    expect(dlg).not.toHaveTextContent(AT_HEAD);
    expect(dlg).not.toHaveTextContent(S['bot.stopLater']);
    expect(within(dlg).getByRole('button', { name: S['bot.stopGo'] })).toBeEnabled();
  });

  it('the body for a turn still shown asks it to stop, with the time the Hub picked it', async () => {
    const SAW = Date.UTC(2026, 10, 7, 9, 30);
    const clock = vi.spyOn(Date, 'now').mockReturnValue(SAW);
    let dlg: HTMLElement;
    try {
      await renderPage(page, { state: 'working', path: at() });
      await userEvent.click(await screen.findByRole('button', { name: S['bot.stop'] }));
      dlg = await screen.findByRole('alertdialog');
      // Later reads of the same turn keep the time the Hub first picked it.
      clock.mockReturnValue(SAW + 7_200_000);
      act(() => W.setTurn('turn-7f3a'));
    } finally {
      clock.mockRestore();
    }
    expect(dlg).toHaveTextContent(S['bot.stopAt'].replace('{{time}}', formatDateTime(SAW)));
    expect(dlg).not.toHaveTextContent(MOVED_HEAD);
    const go = within(dlg).getByRole('button', { name: S['bot.stopGo'] });
    expect(go).toBeEnabled();
    await userEvent.click(go);
    await waitFor(() => expect(sentOf('stopTurn')).toHaveLength(1));
    expect(sentOf('stopTurn')[0]).toMatchObject({ turnId: 'turn-7f3a' });
  });

  it('a Stop opened by link takes the turn of the first read; a turn that starts later is never sent', async () => {
    await renderPage(page, { state: 'working', path: at('&do=stop') });
    const dlg = await screen.findByRole('alertdialog');
    act(() => W.setTurn('turn-later'));
    const go = within(dlg).getByRole('button', { name: S['bot.stopGo'] });
    expect(go).toBeEnabled();
    await userEvent.click(go);
    await waitFor(() => expect(sentOf('stopTurn')).toHaveLength(1));
    expect(sentOf('stopTurn')[0]).toMatchObject({ turnId: 'turn-7f3a' });
  });

  it('a Stop opened by link while no turn runs says a turn that starts later is not stopped from here', async () => {
    await renderPage(page, { state: 'idle', path: at('&do=stop') });
    const dlg = await screen.findByRole('alertdialog');
    expect(dlg).toHaveTextContent(S['bot.stopBody']);
    expect(dlg).not.toHaveTextContent(S['bot.stopLater']);
    // No turn was frozen, so the confirm names no read time.
    expect(dlg).not.toHaveTextContent(AT_HEAD);
    act(() => W.setTurn('turn-later'));
    await waitFor(() => expect(dlg).toHaveTextContent(S['bot.stopLater']));
    expect(within(dlg).getByRole('button', { name: S['bot.stopGo'] })).toBeDisabled();
    expect(sentOf('stopTurn')).toEqual([]);
  });

  it('a Stop opened again after the turn moved takes the turn read then', async () => {
    await renderPage(page, { state: 'working', path: at() });
    act(() => W.setTurn('turn-later'));
    await userEvent.click(await screen.findByRole('button', { name: S['bot.stop'] }));
    const dlg = await screen.findByRole('alertdialog');
    await userEvent.click(within(dlg).getByRole('button', { name: S['bot.stopGo'] }));
    await waitFor(() => expect(sentOf('stopTurn')).toHaveLength(1));
    expect(sentOf('stopTurn')[0]).toMatchObject({ turnId: 'turn-later' });
  });
});

describe('the composer while the Bot waits for approval', () => {
  it('Send posts the message to the Bot and sends no gate decision', async () => {
    await renderPage(page, { state: 'waitingApprove', path: at() });
    expect(await screen.findAllByRole('region', { name: K['agent.needsApproval'] })).toHaveLength(1);
    const box = await screen.findByRole('textbox', { name: S['say.label'] });
    expect(box).toHaveAccessibleDescription(S['say.declines']);
    await userEvent.type(box, 'no, use the release branch');
    await userEvent.click(screen.getByRole('button', { name: S['say.send'] }));
    expect(await screen.findByText(S['say.sent'])).toBeInTheDocument();
    expect(sentOf('say')).toEqual([expect.objectContaining({ botKey: CHIEF, text: 'no, use the release branch' })]);
    // The message is the only change: no gate decision (approve or decline), nothing else, through the page source or around it.
    expect(W.sent.map((s) => s.key)).toEqual(['say']);
    expect(W.apiSent.filter((r) => !/^POST \/bots\/:id\/messages$/.test(r))).toEqual([]);
  });
});
