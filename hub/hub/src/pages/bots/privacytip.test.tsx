// Vitest: the Bots table's "Telegram privacy on" tag carries an info tip saying what it means, with a link to how to
// turn it off. A Bot without privacy on shows neither.
import { renderPage, screen, userEvent, within } from '@app/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import page from './page';
import strings from './strings.en.json';

beforeAll(async () => {
  await import('./view');
}, 30000);

const rowOf = async (name: string) => (await screen.findAllByText(name)).map((el) => el.closest('tr')).find(Boolean) as HTMLElement;

describe('Telegram privacy tip', () => {
  it('the privacy tag has an info tip that says what privacy on means and links to how to turn it off', async () => {
    const { router } = await renderPage(page, { state: 'chatsWaiting' });
    const row = await rowOf('Chief');
    // The tag's own words are the trigger (the kit Tag tip's term form).
    const tip = within(row).getByRole('button', { name: /Telegram\s*privacy on/ });
    await userEvent.click(tip);
    expect(await screen.findByText(strings['list.privacyTip'])).toBeInTheDocument();
    // The link goes to the FAQ's Telegram privacy answer.
    expect(screen.getByRole('link', { name: strings['list.privacyFaq'] }).getAttribute('href')).toMatch(/telegramPrivacy/);
    // Pressing the tip opens only the tip: the row is not opened (no Bot selected).
    expect(router.state.location.search).not.toHaveProperty('sel');
    expect(screen.queryByRole('heading', { name: 'Chief', level: 2 })).toBeNull();
  });

  it('a Bot without Telegram privacy on has no privacy tip', async () => {
    await renderPage(page, { state: 'default' });
    await screen.findAllByRole('row');
    expect(screen.queryByRole('button', { name: /privacy on/ })).toBeNull();
  });
});
