// Vitest: Panic and a key's Revoke send nothing until their
// confirmation is pressed, then exactly one change. Each change the page sends is recorded at the fixture source's mutation
// (the same recorder as link.toggle.test).
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import type * as Fixtures from '@app/fixtures';
import page from './page';
import strings from './strings.en.json';
import K from '@kit/strings.en.json';

const W = vi.hoisted(() => ({ sent: [] as Array<{ key: string; body: Record<string, unknown> }> }));

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
          if (pageId !== 'bots' || (key !== 'panic' && key !== 'keyChange')) return mu;
          const note = (vars: unknown): void => {
            const { linkId: _id, ...body } = (vars ?? {}) as Record<string, unknown>;
            W.sent.push({ key, body });
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
const open = () => renderPage(page, { path: `/bots?sel=${encodeURIComponent(CHIEF)}&tab=link` });

describe('Panic and a key Revoke send only on their confirmation', () => {
  it('Panic: the dialog opens with nothing sent, Cancel sends nothing, the confirmation sends one panic', async () => {
    await open();
    const head = (await screen.findByRole('heading', { name: strings['addr.title'] })).closest('header') as HTMLElement;
    const openDialog = async () => {
      await userEvent.click(within(head).getByRole('button', { name: 'More actions' }));
      await userEvent.click(await screen.findByRole('menuitem', { name: new RegExp(`^${strings['panic.button']}`) }));
      return screen.findByRole('alertdialog', { name: strings['panic.confirmTitle'] });
    };
    let dialog = await openDialog();
    expect(W.sent).toEqual([]);
    await userEvent.click(within(dialog).getByRole('button', { name: K['action.cancel'] }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(W.sent).toEqual([]);
    dialog = await openDialog();
    expect(W.sent).toEqual([]);
    await userEvent.click(within(dialog).getByRole('button', { name: strings['panic.confirm'] }));
    await waitFor(() => expect(W.sent).toHaveLength(1));
    expect(W.sent[0]?.key).toBe('panic');
  });

  it("a key's Revoke: the dialog opens with nothing sent, Escape sends nothing, the confirmation sends one revoke of that key", async () => {
    await open();
    const table = await screen.findByRole('table', { name: /^\d+ keys?$/ });
    const row = within(table).getByRole('row', { name: /website widget/ });
    const openDialog = async () => {
      await userEvent.click(within(row).getByRole('button', { name: 'Row actions' }));
      await userEvent.click(await screen.findByRole('menuitem', { name: new RegExp(`^${strings['key.revoke']}`) }));
      return screen.findByRole('alertdialog', { name: strings['key.revokeTitle'] });
    };
    await openDialog();
    expect(W.sent).toEqual([]);
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(W.sent).toEqual([]);
    const dialog = await openDialog();
    expect(W.sent).toEqual([]);
    await userEvent.click(within(dialog).getByRole('button', { name: strings['key.revoke'] }));
    await waitFor(() => expect(W.sent).toHaveLength(1));
    expect(W.sent[0]?.key).toBe('keyChange');
    expect(W.sent[0]?.body).toMatchObject({ action: 'revoke' });
    // The key of the row that was pressed (the fixture's website widget), not any key.
    expect(W.sent[0]?.body.keyId).toBe('k1a2b3c4d5e6');
  });
});
