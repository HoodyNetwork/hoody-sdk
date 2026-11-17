// Vitest: the link's on/off switch, now in the Addresses head menu. Turn link on sends
// { enabled: true } at once, with no confirmation; Turn link off asks first and sends { enabled: false } only on the
// confirmation; a frozen link offers neither. Each change the page sends is recorded at the fixture source's mutation.
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import type * as Fixtures from '@app/fixtures';
import page from './page';
import strings from './strings.en.json';

const W = vi.hoisted(() => ({ sent: [] as unknown[] }));

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
          if (pageId !== 'bots' || key !== 'patchLink') return mu;
          const note = (vars: unknown): void => {
            const { linkId: _id, ...body } = (vars ?? {}) as Record<string, unknown>;
            W.sent.push(body);
          };
          return {
            ...mu,
            mutate: (vars: V, o?: unknown) => {
              note(vars);
              return (mu.mutate as (a: V, b?: unknown) => void)(vars, o);
            },
            mutateAsync: (vars: V, o?: unknown) => {
              note(vars);
              return (mu.mutateAsync as (a: V, b?: unknown) => Promise<unknown>)(vars, o);
            },
          } as typeof mu;
        },
      };
    },
  };
});

beforeAll(async () => {
  await import('./view');
}, 30000);

beforeEach(() => {
  W.sent = [];
});

const CHIEF = 'c-atlas~a1b2c3d4e5f60718293a4b5c~chief';
const openMenu = async (state: string) => {
  await renderPage(page, { state, path: `/bots?sel=${encodeURIComponent(CHIEF)}&tab=link` });
  const head = (await screen.findByRole('heading', { name: strings['addr.title'] })).closest('header') as HTMLElement;
  await userEvent.click(within(head).getByRole('button', { name: 'More actions' }));
};

describe('the link switch in the Addresses menu', () => {
  it('Turn link on sends enabled: true at once, with no confirmation', async () => {
    await openMenu('linkOff');
    await userEvent.click(await screen.findByRole('menuitem', { name: strings['addr.turnOn'] }));
    await waitFor(() => expect(W.sent).toEqual([{ enabled: true }]));
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('Turn link off asks first, and sends enabled: false only on the confirmation', async () => {
    await openMenu('idle');
    await userEvent.click(await screen.findByRole('menuitem', { name: new RegExp(`^${strings['addr.turnOff']}`) }));
    const dialog = await screen.findByRole('alertdialog', { name: strings['link.offTitle'] });
    expect(W.sent).toEqual([]);
    await userEvent.click(within(dialog).getByRole('button', { name: strings['link.turnOff'] }));
    await waitFor(() => expect(W.sent).toEqual([{ enabled: false }]));
  });

  it('a frozen link cannot be turned off from the menu', async () => {
    await openMenu('linkFrozen');
    const off = await screen.findByRole('menuitem', { name: new RegExp(`^${strings['addr.turnOff']}`) });
    expect(off).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(off);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(W.sent).toEqual([]);
  });
});
