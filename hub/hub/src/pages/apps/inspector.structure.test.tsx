// Vitest: the app detail panel says each thing once, so no action such as Remove is offered twice. One danger group
// at the end holds exactly the actions that exist: Stop (a running app; its confirm as the row menu's) and taking the row
// off the list, each with a line saying what it does and what it leaves alone. Facts show only what is known.
import { beforeEach, describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, within } from '@app/testing';
import { ops } from './parts/ops';
import { harness as page } from './launch/harness';
import strings from './strings.en.json';

const open = async (key: string, name: string, state?: string) => {
  await renderPage(page, { path: `/apps?appsel=${key}`, ...(state ? { state } : {}) });
  await screen.findByRole('heading', { name });
  return screen.getByRole('group', { name: strings['insp.end'] });
};
const fill = (k: keyof typeof strings, name: string) => strings[k].replace('{{name}}', name);

describe('app detail: one danger group, each action once', () => {
  beforeEach(() => ops.reset());

  it('a running app: Stop and Remove from this list are two rows, each said once with what it leaves alone', async () => {
    const end = await open('b2c3d4', 'htop');
    expect(within(end).getAllByRole('button').map((b) => b.textContent)).toEqual([strings['act.stop'], strings['act.remove']]);
    expect(within(end).getByText(fill('insp.stopRow', 'htop'))).toBeInTheDocument();
    expect(within(end).getByText(strings['stop.body'])).toBeInTheDocument();
    expect(within(end).getAllByText(strings['act.forget'])).toHaveLength(1);
    expect(within(end).getByText(fill('insp.forgetRunning', 'htop'))).toBeInTheDocument();
    // No heading that only says "Remove" above the row.
    expect(screen.queryByRole('heading', { name: 'Remove' })).toBeNull();
    // Stop asks first, with the same dialog as the row menu's Stop.
    await userEvent.click(within(end).getByRole('button', { name: strings['act.stop'] }));
    expect(within(await screen.findByRole('alertdialog')).getByText(strings['stop.body'])).toBeInTheDocument();
  });

  it('an app that is not running: only the remove row, saying nothing on the computer changes', async () => {
    const end = await open('f6a7b8', 'btop');
    expect(within(end).getAllByRole('button').map((b) => b.textContent)).toEqual([strings['act.remove']]);
    expect(within(end).getByText(strings['insp.forgetStopped'])).toBeInTheDocument();
  });

  it('an Open that may still be going through: the remove row reads Stop tracking with its warning, no Remove', async () => {
    const end = await open('a1b2c3', 'JupyterLab', 'held');
    expect(within(end).getAllByRole('button').map((b) => b.textContent)).toEqual([strings['act.stop'], strings['act.dismiss']]);
    expect(within(end).getByText(strings['insp.heldRow'])).toBeInTheDocument();
    expect(within(end).getByText(strings['dismiss.body'])).toBeInTheDocument();
  });

  it('the Board is one row of the body: Put on Board where it has a place, why not where the Board cannot show it', async () => {
    await open('b2c3d4', 'htop', 'board');
    const row = screen.getByRole('group', { name: strings['insp.board'] });
    expect(within(row).getByRole('link', { name: strings['act.board'] })).toBeInTheDocument();
    expect(within(row).getByText(strings['insp.boardHelp'])).toBeInTheDocument();
    // The head keeps its one primary: no second button beside Open.
    expect(within(screen.getByRole('heading', { name: 'htop' }).closest('header') as HTMLElement).queryByRole('link', { name: strings['act.board'] })).toBeNull();
  });

  it('facts show what is known: no "Nothing yet" for a place or settings it does not have', async () => {
    await open('b8c9d0', 'Open WebUI');
    expect(screen.queryByText(strings['insp.where'])).toBeNull();
    expect(screen.queryByText(strings['insp.settings'])).toBeNull();
  });
});
