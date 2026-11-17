// Vitest, the Support page: one filled (primary) button at a time. With a ticket open its reply box owns Send, so the
// header's New ticket turns quiet; with no ticket open New ticket is the page's primary.
import { renderPage, screen } from '@app/testing';
import { expect, it } from 'vitest';
import { T_OPEN } from './fixtures';
import page from './page';
import strings from './strings.en.json';

const T = { timeout: 10000 };
const variantOf = (name: string) => screen.getByRole('button', { name }).getAttribute('data-variant');

it('no ticket open: New ticket is the primary', async () => {
  await renderPage(page, { path: '/support' });
  await screen.findByRole('button', { name: strings['action.new'] }, T);
  expect(variantOf(strings['action.new'])).toBe('primary');
});

it('a ticket open: Send is the only primary, New ticket is quiet', async () => {
  await renderPage(page, { path: `/support?sel=${String(T_OPEN.id)}` });
  await screen.findByRole('textbox', { name: strings['reply.label'] }, T);
  expect(variantOf(strings['action.send'])).toBe('primary');
  expect(variantOf(strings['action.new'])).not.toBe('primary');
});
