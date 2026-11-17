// Vitest: Options opened from Launch an app replaces that drawer, and its back button names where it goes back to
// (Launch an app), never the drawer it is in.
import { beforeEach, describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import { ops } from './parts/ops';
import { harness as page } from './launch/harness';
import strings from './strings.en.json';

describe('Options from Launch an app: the back button', () => {
  beforeEach(() => ops.reset());

  it('reads Back to Launch an app and returns there', async () => {
    await renderPage(page, { path: '/apps?launch=1' });
    const drawer = await screen.findByRole('dialog', { name: strings['launch.title'] });
    const rowOf = () =>
      within(drawer).queryAllByText('JupyterLab').map((n) => n.closest<HTMLElement>('li, tr, [role="row"]')).find((r) => r && within(r).queryByRole('button', { name: /^(Row actions|More actions for )/ }));
    await waitFor(() => expect(rowOf()).toBeTruthy(), { timeout: 8000 });
    const row = rowOf() as HTMLElement;
    await userEvent.click(within(row).getByRole('button', { name: /^(Row actions|More actions for )/ }));
    await userEvent.click(await screen.findByRole('menuitem', { name: new RegExp(`^${strings['act.options']}`) }));
    const title = strings['opt.title'].replace('{{name}}', 'JupyterLab');
    const options = await screen.findByRole('dialog', { name: title });
    const back = within(options).getByRole('button', { name: strings['opt.back'] });
    expect(strings['opt.back']).toContain(strings['launch.title']);
    expect(within(options).queryByRole('button', { name: new RegExp(title) })).toBeNull();
    await userEvent.click(back);
    expect(await screen.findByRole('dialog', { name: strings['launch.title'] })).toBeInTheDocument();
  });
});
