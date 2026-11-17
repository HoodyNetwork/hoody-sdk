// Vitest: the Programs source of the Logs page. Program output is explained from the button beside it, so the bar's
// menu holds no second Explain there (it read the event list, which is empty on this source, and said the view had
// no lines while output was on screen).
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, renderPage, screen, userEvent, within } from '@app/testing';
import strings from './strings.en.json';

const { default: page } = await import('./page');

afterEach(cleanup);

describe('Logs page: Programs', () => {
  it('the bar menu offers no Explain; the output keeps its own', async () => {
    await renderPage(page, { path: '/logs?src=programs' });
    const explain = await screen.findByRole('button', { name: strings['act.explain'] });
    expect(explain).toBeEnabled();
    await userEvent.setup().click(screen.getByRole('button', { name: strings['act.barMore'] }));
    const menu = await screen.findByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: new RegExp('^' + strings['v.save']) })).toBeInTheDocument();
    expect(within(menu).queryByRole('menuitem', { name: new RegExp('^' + strings['act.explain']) })).toBeNull();
  });
});

describe('Logs page: Everything', () => {
  it('the bar menu still offers Explain', async () => {
    await renderPage(page, { path: '/logs' });
    await userEvent.setup().click(await screen.findByRole('button', { name: strings['act.barMore'] }));
    const menu = await screen.findByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: new RegExp('^' + strings['act.explain']) })).toBeInTheDocument();
  });
});
