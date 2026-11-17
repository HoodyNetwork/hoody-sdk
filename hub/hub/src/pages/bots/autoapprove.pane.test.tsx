// The Bot page itself carries the Auto-approve pill: it is in the header whatever the Bot's state, and
// pressing it while Off asks first (the fixture Bot is Off).
import { renderPage, screen, userEvent } from '@app/testing';
import { describe, expect, it } from 'vitest';
import page from './page';
import strings from './strings.en.json';

const CHIEF = 'c-atlas~a1b2c3d4e5f60718293a4b5c~chief';

describe('bots: the Bot pane shows Auto-approve as a pill', () => {
  it('shows the state in the header and asks before turning it On', async () => {
    await renderPage(page, { path: `/bots?sel=${encodeURIComponent(CHIEF)}` });
    const pill = await screen.findByRole('button', { name: strings['bot.autoApproveOff'] });
    expect(pill).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(pill);
    expect(await screen.findByRole('alertdialog')).toHaveTextContent(strings['autoapprove.confirmTitle']);
  });
});
