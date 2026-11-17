// Vitest: the Bot pane's pending banners (a Bot action or a stop whose answer was lost). Stop tracking is the warned
// Dismiss (C9): it asks first, and the confirm frees exactly the sends the banner showed when it was pressed
// (dismissShown), never "whatever is held now" (dismiss()), so a send held after the warning armed is not let go unseen.
import { renderPage, screen, userEvent, within } from '@app/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import page from './page';

const spy = vi.hoisted(() => ({ rows: [] as Array<{ identity: unknown; hold: string }>, dismiss: vi.fn(), dismissShown: vi.fn(async () => true), which: 'botAction' as 'botAction' | 'stopTurn' }));

vi.mock('./data', async (importOriginal) => {
  const real = await importOriginal<object>();
  type Hook = (...a: unknown[]) => Record<string, unknown>;
  const r = real as Record<string, Hook>;
  const held = (orig: Hook, key: 'botAction' | 'stopTurn'): Hook => (...a) => {
    const c = orig(...a);
    // The pane's own hooks only (they name the Bot): the list's Resume has its own banner (resume.banner.test.tsx).
    if (spy.which !== key || !(a[0] as { botKey?: unknown } | undefined)?.botKey) return c;
    return { ...c, outcome: 'pending', running: false, held: () => spy.rows, dismiss: spy.dismiss, dismissShown: spy.dismissShown, readBack: async () => false };
  };
  return { ...real, useBotAction: held(r.useBotAction as Hook, 'botAction'), useStopTurn: held(r.useStopTurn as Hook, 'stopTurn') };
});

const CHIEF = 'c-atlas~a1b2c3d4e5f60718293a4b5c~chief';
const stopTracking = () => screen.findByRole('button', { name: 'Stop tracking' });
const warning = async () => {
  const d = await screen.findByRole('alertdialog');
  return { d, go: within(d).getAllByRole('button').find((b) => /Stop tracking/.test(b.textContent ?? '')) as HTMLElement };
};

beforeEach(() => {
  spy.rows = [{ identity: { botKey: CHIEF }, hold: 'inc1#n1~o1' }];
  spy.dismiss.mockClear();
  spy.dismissShown.mockClear();
});

describe.each(['botAction', 'stopTurn'] as const)('the pane\'s pending banner (%s), Stop tracking', (which) => {
  beforeEach(() => {
    spy.which = which;
  });

  it('asks first; the confirm frees the sends shown when it armed, not what is held at confirm', async () => {
    await renderPage(page, { path: `/bots?sel=${encodeURIComponent(CHIEF)}` });
    await userEvent.click(await stopTracking());
    const shown = spy.rows;
    spy.rows = [{ identity: { botKey: CHIEF }, hold: 'inc2#n1~o1' }];
    const { go } = await warning();
    await userEvent.click(go);
    expect(spy.dismiss).not.toHaveBeenCalled();
    expect(spy.dismissShown).toHaveBeenCalledTimes(1);
    expect(spy.dismissShown).toHaveBeenCalledWith(shown);
  });

  it('closing the warning frees nothing', async () => {
    await renderPage(page, { path: `/bots?sel=${encodeURIComponent(CHIEF)}` });
    await userEvent.click(await stopTracking());
    const { d } = await warning();
    await userEvent.click(within(d).getByRole('button', { name: /Cancel/ }));
    expect(spy.dismiss).not.toHaveBeenCalled();
    expect(spy.dismissShown).not.toHaveBeenCalled();
  });
});
