// Vitest: "Ask the Agent" about access is mounted on this page: in the access drawer's head (a computer's
// Overview has no Explain of its own; its access action opens the drawer), and in the list's toolbar, where it opens
// the kit's drawer. Both sit behind the access drawer's own gate (resources.proxy_aliases), the list's only when it
// shows computers.
import { describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, within } from '@app/testing';
import ask from '@kit/widgets/AskAgent.strings.en.json';
import page from './page';
import pageStrings from './strings.en.json';

const SLOW = { timeout: 8000 };

describe('computers: Ask the Agent about access is mounted', () => {
  it('on a computer’s Permissions tab, in the head of "Who can open its programs", never as a button of Overview’s access fact', async () => {
    await renderPage(page, { path: '/computers?sel=atlas.00a1' });
    await screen.findByRole('tab', { name: pageStrings['tab.permissions'] }, SLOW);
    expect(screen.queryByRole('button', { name: /^Explain/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Ask the Agent about access/ })).toBeNull();
    await userEvent.click(screen.getByRole('tab', { name: pageStrings['tab.permissions'] }));
    const d = await screen.findByRole('tabpanel', undefined, SLOW);
    expect(await within(d).findByRole('button', { name: /^Ask the Agent about access/ }, SLOW)).toBeInTheDocument();
  }, 30000);

  it('in the computers list toolbar, opening the kit drawer with Explain first', async () => {
    await renderPage(page, { path: '/computers' });
    await userEvent.click(await screen.findByRole('button', { name: ask['aa.label'] }, SLOW));
    const d = await screen.findByRole('dialog');
    expect(within(d).getByRole('button', { name: ask['aa.explain'] })).toBeInTheDocument();
  }, 30000);
});
