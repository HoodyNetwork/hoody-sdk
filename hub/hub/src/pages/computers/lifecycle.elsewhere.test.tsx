// A lifecycle change another page sent (Home's Stop, Board's, its answer lost) is that page's to settle: Computers'
// detail banner shows Home's read-only, naming Home, and the Home widget shows Board's read-only, naming Board, with
// no Dismiss (core frees a change only for its sender) and no second press.
import { computerLifecycle, fixtureWorld } from '@core';
import { describe, expect, it } from 'vitest';
import { act, renderPage, screen } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

const atlas = fixtureWorld.current;
const homeText = strings['held.elsewhere'].replace('{{page}}', strings['held.from.home']);
const boardText = strings['held.elsewhere'].replace('{{page}}', strings['held.from.board']);
async function stops(page: 'home' | 'board') {
  await act(async () => { expect((await computerLifecycle.forPage(page).run({ id: atlas.id, op: 'stop' })).outcome).toBe('pending'); });
}

describe('computers: a lifecycle change Home sent', () => {
  it('the detail banner is read-only and names Home', async () => {
    await renderPage(page, { state: 'pendingOps', path: '/computers?sel=atlas.00a1' });
    await stops('home');
    expect(await screen.findByText(homeText, {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: strings['held.dismiss'] })).toBeNull();
    expect(screen.queryByText(strings['held.lifecycle'].replace('{{name}}', 'atlas'))).toBeNull();
  });

  it("the Home widget shows Board's read-only, naming Board", async () => {
    await renderPage({ ...page, load: () => import('./widget') }, { state: 'pendingOps' });
    await stops('board');
    expect(await screen.findByText(boardText, {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: strings['held.dismiss'] })).toBeNull();
  });
});
