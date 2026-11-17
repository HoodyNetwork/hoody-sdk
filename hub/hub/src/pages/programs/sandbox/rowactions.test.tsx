// While a sandbox save of a program may have gone through (held by core, or unclear in this tab), the
// program's start, stop and restart wait: the list's buttons are off, and a press from anywhere on the page (the
// inspector included) sends nothing. Another program is untouched.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { resetChanges } from '@core/changes';
import { snapshot } from '@core/ctx';
import { opsStore } from '../parts/ops';
import page from '../page';
import { putNote, resetSandboxNotesForTests } from './notes';
import ts from './strings.en.json';

const opOf = (rowKey: string) => {
  for (const [k, op] of opsStore.snapshot()) if (k.endsWith(`|${rowKey}`)) return op;
  return undefined;
};
function holdUnclear(rowKey: string) {
  const c = snapshot();
  const t = c.target;
  if (!t) throw new Error('no computer');
  putNote(`${c.account ?? '-'}|${c.realm}|${t.project.id}/${t.container.id}|${rowKey}`, { outcome: { kind: 'unclear' }, sentFp: 'a', sentBlock: null, beforeFp: 'b' });
}

beforeEach(() => {
  resetChanges();
  resetSandboxNotesForTests();
});
afterEach(() => resetSandboxNotesForTests());

describe('row actions wait for a held sandbox save of the same program', () => {
  it('Restart is off for that program only, and a press from the inspector sends nothing', async () => {
    await renderPage(page, { state: 'many', path: '/programs?sel=prog%3A1' });
    const webRestarts = await screen.findAllByRole('button', { name: 'Restart web' });
    expect(webRestarts.every((b) => !(b as HTMLButtonElement).disabled)).toBe(true);
    holdUnclear('prog:1');
    // The list row's inline Restart: off with the sandbox's reason (the kit's soft disable, still focusable).
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Restart web' })[0]).toHaveAttribute('aria-disabled', 'true'));
    expect(screen.getAllByRole('button', { name: 'Restart web' })[0]).toHaveAccessibleDescription(expect.stringContaining(ts['sb.actionsWait']));
    expect(screen.getAllByRole('button', { name: 'Restart all ports of api' })[0]).toBeEnabled();
    // Its menu's Stop is off with the same reason, and choosing it sends nothing.
    const row = screen.getAllByRole('row').find((x) => within(x).queryByText('web', { exact: true }) !== null && x.closest('[role="table"], table') !== null) as HTMLElement;
    await userEvent.click(within(row).getByRole('button', { name: 'Row actions' }));
    const stop = within(await screen.findByRole('menu')).getByRole('menuitem', { name: /^Stop web/ });
    expect(stop).toHaveAttribute('aria-disabled', 'true');
    expect(stop).toHaveAccessibleDescription(expect.stringContaining(ts['sb.actionsWait']));
    await userEvent.click(stop);
    await userEvent.keyboard('{Escape}');
    // Every Restart of web on the page, enabled or not: none sends.
    for (const b of screen.getAllByRole('button', { name: 'Restart web' })) (b as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 50));
    expect(opOf('prog:1')).toBeUndefined();
  });
});
