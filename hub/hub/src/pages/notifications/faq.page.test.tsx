// Vitest: where the notifications questions show up. The Get notified page lists all seven under "Questions" and its short lines link to
// them; the Inbox's empty state has no questions section, so its link opens the answer where it stands.
import { beforeEach, describe, expect, it } from 'vitest';
import { bootFixtureCore } from '@core';
import { renderPage, screen, userEvent, waitFor, within } from '@app/testing';
import kitStrings from '@kit/strings.en.json';
import { resetFixtureServer } from './fixtures';
import page from './page';
import strings from './strings.en.json';

const IDS = ['kinds', 'bellInbox', 'timing', 'browser', 'email', 'iphone', 'android'] as const;
const q = (id: (typeof IDS)[number]) => strings[`faq.${id}.q` as const];
const a = (id: (typeof IDS)[number]) => strings[`faq.${id}.a` as const];

describe('notifications questions', () => {
  beforeEach(() => {
    bootFixtureCore();
    resetFixtureServer();
  });

  it('Get notified lists the seven questions, each closed, under the kit "Questions" heading', async () => {
    await renderPage(page, { path: '/notifications/learn' });
    await screen.findByRole('heading', { name: kitStrings['faq.title'] });
    for (const id of IDS) {
      const trigger = await screen.findByRole('button', { name: q(id) });
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
    }
  });

  it('a short line on Get notified opens its answer: the timing link opens "how soon" and shows the answer', async () => {
    await renderPage(page, { path: '/notifications/learn' });
    await userEvent.click(await screen.findByRole('link', { name: strings['h.timing.more'] }));
    const trigger = await screen.findByRole('button', { name: q('timing') });
    await waitFor(() => expect(trigger).toHaveAttribute('aria-expanded', 'true'));
    expect(screen.getByText(a('timing'))).toBeInTheDocument();
  });

  it('the iPhone and Android lines each open their own question', async () => {
    await renderPage(page, { path: '/notifications/learn' });
    await userEvent.click(await screen.findByRole('link', { name: strings['h.phone.android.h'] }));
    await waitFor(() => expect(screen.getByRole('button', { name: q('android') })).toHaveAttribute('aria-expanded', 'true'));
    expect(screen.getByRole('button', { name: q('iphone') })).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(screen.getByRole('link', { name: strings['h.phone.ios.h'] }));
    await waitFor(() => expect(screen.getByRole('button', { name: q('iphone') })).toHaveAttribute('aria-expanded', 'true'));
  });

  it('the Inbox empty state links to what notices are; the answer opens in place, not on another page', async () => {
    await renderPage(page, { state: 'empty' });
    const link = await screen.findByRole('link', { name: strings['h.kinds.more'] }, { timeout: 8000 });
    await userEvent.click(link);
    const peek = await screen.findByRole('dialog');
    expect(within(peek).getByText(a('kinds'))).toBeInTheDocument();
  });
});
