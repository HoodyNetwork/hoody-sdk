// The Bot page puts the keyboard on a waiting Bot's approval card (its Allow once) only while nobody holds it: opening a waiting Bot lands
// on the card, but a card that arrives while the person types (the Activity composer, any field) or has a dialog open
// leaves their focus where it is, so the rest of their letters never fall through to page shortcuts (s opened Settings).
import { act, renderPage, screen, userEvent, waitFor } from '@app/testing';
import type * as Fixtures from '@app/fixtures';
import { useSyncExternalStore } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BotView } from './data';
import page from './page';
import S from './strings.en.json';
import K from '@kit/agent/Conversation.strings.en.json';

const CHIEF = 'c-atlas~a1b2c3d4e5f60718293a4b5c~chief';
const at = `/bots?sel=${encodeURIComponent(CHIEF)}`;

// `hidden`: while true, the view read of CHIEF has no gate (it has not arrived yet); `arrive()` brings it in.
// `replace()` swaps the gate for a newer one (another id) with no empty read between.
const W = vi.hoisted(() => {
  const subs = new Set<() => void>();
  const tell = () => {
    for (const f of subs) f();
  };
  return {
    hidden: false,
    gateId: '',
    subs,
    arrive() {
      this.hidden = false;
      tell();
    },
    replace(id: string) {
      this.gateId = id;
      tell();
    },
  };
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
          const snap = useSyncExternalStore(
            (f) => {
              W.subs.add(f);
              return () => W.subs.delete(f);
            },
            () => `${W.hidden}:${W.gateId}`,
          );
          if (pageId !== 'bots' || key !== 'view' || snap === 'false:' || !r.data) return r;
          const views = r.data as unknown as Record<string, BotView>;
          const v = views[CHIEF];
          if (!v) return r;
          const gate = W.hidden ? null : v.gate && W.gateId ? { ...v.gate, id: W.gateId } : v.gate;
          return { ...r, data: { ...views, [CHIEF]: { ...v, gate } } as unknown as T };
        },
      };
    },
  };
});

afterEach(() => {
  vi.restoreAllMocks();
});
const extra: Element[] = [];
beforeEach(() => {
  W.hidden = false;
  W.gateId = '';
  for (const el of extra.splice(0)) el.remove();
});
/** The page's own slot (data-hub-page), as the shell's page host draws it. */
const pageSlot = () => document.querySelector<HTMLElement>('[data-hub-page]')!;
/** Something put in the document for the test, outside the page unless `into` says where (removed after it). */
function addToDocument(html: string, into: HTMLElement = document.body): HTMLElement {
  const box = document.createElement('div');
  box.innerHTML = html;
  into.append(box);
  extra.push(box);
  return box;
}
/** Every element focus() is called on from now on (the card must never be one while the person holds the keys). */
const focusCalls = () => vi.spyOn(HTMLElement.prototype, 'focus').mock.contexts;

const card = () => screen.findByRole('region', { name: K['agent.needsApproval'] });
/** The card's primary control, where the page puts the keyboard (the kit rule: the first enabled control, not the card). */
const allow = () => screen.findByRole('button', { name: new RegExp(`^${K['agent.allowOnce']}`) });
/** focus() was called on the card or anything in it. */
const touched = (calls: unknown[], c: HTMLElement) => calls.some((el) => el instanceof Node && c.contains(el));
/** CHIEF's row in the Bot list (the list's own row control, as a person clicks or tabs to it). */
const listRow = () => screen.findByRole('row', { name: /chief/i });
/** Past the page's hand-off delay (80 ms) with room to spare. */
const settle = () => act(() => new Promise((r) => window.setTimeout(r, 300)));

describe('the approval card and the keyboard', () => {
  it('opening a Bot that waits for you puts the keyboard on its card', async () => {
    await renderPage(page, { state: 'waitingApprove', path: at });
    await card();
    const a = await allow();
    await waitFor(() => expect(a).toHaveFocus());
  });

  it('opening a waiting Bot from the list with the pointer puts the keyboard on its card', async () => {
    await renderPage(page, { state: 'waitingApprove', path: '/bots' });
    await userEvent.click(await listRow());
    await waitFor(async () => expect(await allow()).toHaveFocus());
  });

  it('opening a waiting Bot from the list with Enter puts the keyboard on its card', async () => {
    await renderPage(page, { state: 'waitingApprove', path: '/bots' });
    (await listRow()).focus();
    await userEvent.keyboard('{Enter}');
    await waitFor(async () => expect(await allow()).toHaveFocus());
  });

  it('a card that arrives while the person types in the composer leaves their focus there, and every letter in the box', async () => {
    W.hidden = true;
    await renderPage(page, { state: 'waitingApprove', path: at });
    const box = await screen.findByRole('textbox', { name: S['say.label'] });
    await userEvent.click(box);
    await userEvent.type(box, 'no, ');
    act(() => W.arrive());
    await card();
    await settle();
    expect(box).toHaveFocus();
    await userEvent.keyboard('use the release branch');
    expect(box).toHaveValue('no, use the release branch');
    // The page's s shortcut (Settings) never ran on a letter meant for the box.
    expect(screen.queryByRole('dialog', { name: /settings/i })).toBeNull();
  });

  it('a card that arrives while a dialog is open leaves the focus in the dialog', async () => {
    W.hidden = true;
    await renderPage(page, { state: 'waitingApprove', path: at });
    await userEvent.click(await screen.findByRole('button', { name: new RegExp(`^${S['bot.settingsButton']}`) }));
    const dlg = await screen.findByRole('dialog');
    const inside = document.activeElement;
    expect(dlg.contains(inside)).toBe(true);
    const calls = focusCalls();
    act(() => W.arrive());
    const c = await card();
    await settle();
    expect(touched(calls, c)).toBe(false);
    expect(document.activeElement).toBe(inside);
  });

  it('a card that arrives while a Select list is open leaves the keyboard on the list, and with focus fallen to the page', async () => {
    W.hidden = true;
    await renderPage(page, { state: 'waitingApprove', path: at });
    await screen.findByRole('textbox', { name: S['say.label'] });
    // A React Aria Select or ComboBox draws its options in a popover portaled to the body (data-trigger marks it).
    const list = addToDocument('<div data-trigger="Select"><div role="listbox" aria-label="Model"><div role="option" tabindex="-1" aria-selected="false">One</div></div></div>');
    const option = list.querySelector<HTMLElement>('[role="option"]')!;
    option.focus();
    const calls = focusCalls();
    act(() => W.arrive());
    const c = await card();
    await settle();
    expect(touched(calls, c)).toBe(false);
    expect(option).toHaveFocus();
    // Focus that fell off to the body while the list stays open still leaves the card alone.
    option.blur();
    W.hidden = true;
    act(() => W.replace(''));
    await waitFor(() => expect(screen.queryByRole('region', { name: K['agent.needsApproval'] })).toBeNull());
    act(() => W.arrive());
    const again = await card();
    await settle();
    expect(touched(calls, again)).toBe(false);
  });

  it('a card that arrives while a program frame in the page holds the keys leaves them there', async () => {
    W.hidden = true;
    await renderPage(page, { state: 'waitingApprove', path: at });
    await screen.findByRole('textbox', { name: S['say.label'] });
    const frame = addToDocument('<div data-hub-keys="frame"><button type="button">Program</button></div>', pageSlot());
    const inside = frame.querySelector('button')!;
    inside.focus();
    act(() => W.arrive());
    await card();
    await settle();
    expect(inside).toHaveFocus();
  });

  it('a card that arrives while focus is outside the page (the Ask dock, the top bar) leaves it there', async () => {
    W.hidden = true;
    await renderPage(page, { state: 'waitingApprove', path: at });
    await screen.findByRole('textbox', { name: S['say.label'] });
    const dock = addToDocument('<aside data-hub-dock=""><button type="button">Ask</button></aside>');
    const ask = dock.querySelector('button')!;
    ask.focus();
    act(() => W.arrive());
    await card();
    await settle();
    expect(ask).toHaveFocus();
  });

  it('a newer gate takes the keyboard over from the card it replaces, and leaves focus held elsewhere', async () => {
    await renderPage(page, { state: 'waitingApprove', path: at });
    const old = await card();
    const oldAllow = await allow();
    await waitFor(() => expect(oldAllow).toHaveFocus());
    act(() => W.replace('gate-2'));
    await waitFor(async () => {
      const next = await card();
      expect(next).not.toBe(old);
      expect(await allow()).toHaveFocus();
    });
    // Focus on another control of the page stays there when the gate is replaced again.
    const settings = screen.getByRole('button', { name: new RegExp(`^${S['bot.settingsButton']}`) });
    settings.focus();
    act(() => W.replace('gate-3'));
    await settle();
    expect(settings).toHaveFocus();
  });
});
