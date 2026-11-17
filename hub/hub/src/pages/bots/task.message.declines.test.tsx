// Vitest: the Bot's pane opens the task message form with what a send does to the Bot's waiting approval. While the Bot waits on
// its own approval, the form says before Send that sending declines it (the agent declines it for any message, as the main
// composer says); with no approval waiting it says nothing of the kind.
import { renderPage, screen, within } from '@app/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import page from './page';
import strings from './strings.en.json';

beforeAll(async () => {
  await import('./view');
}, 30000);

const CHIEF = 'c-atlas~a1b2c3d4e5f60718293a4b5c~chief';
const open = (state?: string) => renderPage(page, { ...(state ? { state } : {}), path: `/bots?sel=${encodeURIComponent(CHIEF)}&tab=work&msg=sess-a1` });

describe('the task message form and the waiting approval', () => {
  it('a Bot waiting on its approval: the form says sending declines it', async () => {
    await open('waitingApprove');
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(strings['say.declines'])).toBeInTheDocument();
  }, 30000);

  it('no approval waiting: no such line', async () => {
    await open('chatAppAttention');
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByText(strings['say.declines'])).toBeNull();
  }, 30000);
});
