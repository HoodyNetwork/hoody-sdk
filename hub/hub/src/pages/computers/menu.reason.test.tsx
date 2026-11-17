// The reason on a terminal entry that needs a running computer follows the computer's status: the next step for it
// is what it says.
import { describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, within } from '@app/testing';
import type { Translate } from '@kit';
import { notRunningReason } from './parts/menu';
import page from './page';
import strings from './strings.en.json';

const tt = ((k: keyof typeof strings) => strings[k]) as Translate<typeof strings>;

describe('computers: why a terminal entry is off', () => {
  it('names the next step for each status group', () => {
    expect(notRunningReason('stopped', tt)).toBe(strings['menu.startFirst']);
    for (const s of ['starting', 'creating', 'restarting']) expect(notRunningReason(s, tt)).toBe(strings['menu.waitStarting']);
    expect(notRunningReason('stopping', tt)).toBe(strings['menu.waitStopping']);
    expect(notRunningReason('paused', tt)).toBe(strings['menu.resumeFirst']);
    expect(notRunningReason('failed', tt)).toBe(strings['menu.restartFirst']);
    expect(notRunningReason('deleting', tt)).toBe(strings['menu.deleting']);
    for (const s of ['frozen', '', undefined]) expect(notRunningReason(s, tt)).toBe(strings['menu.notRunning']);
  });

  it('in the row menu, Open terminal gives the failed computer Restart first and the paused one Resume first', { timeout: 60000 }, async () => {
    await renderPage(page, { path: '/computers' });
    for (const [name, key] of [['ember', 'menu.restartFirst'], ['fjord', 'menu.resumeFirst'], ['cedar', 'menu.startFirst']] as const) {
      const card = await screen.findByRole('article', { name }, { timeout: 30000 });
      await userEvent.click(within(card).getByRole('button', { name: /actions/i }));
      const menu = await screen.findByRole('menu');
      const item = within(menu).getByRole('menuitem', { name: new RegExp(strings['menu.openTerminal']) });
      expect(item).toHaveAttribute('aria-disabled', 'true');
      expect(menu.textContent).toContain(strings[key]);
      expect(menu.textContent).not.toContain(name === 'cedar' ? strings['menu.restartFirst'] : strings['menu.startFirst']);
      await userEvent.keyboard('{Escape}');
    }
  });
});
