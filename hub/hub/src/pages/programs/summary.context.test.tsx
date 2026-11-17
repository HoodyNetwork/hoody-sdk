// Vitest: the Programs summary ("19 programs on atlas · 11 running · 4 need a look", the name a link) is
// live status, so it is the header's context row, never its subtitle: the subtitle is a two-line clamp (kit PageHeader)
// that cut "4 need a look" off beside the header's three buttons at 768 px. The context row is never clamped.
import { expect, it } from 'vitest';
import { renderPage, screen } from '@app/testing';
import page from './page';

it('the summary sits in the header context row, outside its clamped subtitle', async () => {
  await renderPage(page, { state: 'attention' });
  const a = await screen.findByRole('link', { name: 'atlas' });
  const h1 = a.closest('header')?.querySelector('h1[data-hub-title]');
  expect(h1).toBeTruthy();
  // PageHeader: the title box holds the title line, the subtitle <p> (the clamp) and the context row <div>.
  const titles = h1!.parentElement!.parentElement!;
  const row = [...titles.children].find((c) => c.contains(a));
  expect(row?.tagName).toBe('DIV');
  expect(row).not.toBe(h1!.parentElement);
  expect(row?.textContent).toMatch(/^\d+ programs? on atlas · \d+ running · \d+ needs? a look$/);
});

it('the computer name in the summary is underlined at rest: a link in muted text, not set apart by its colour alone', async () => {
  await renderPage(page, { state: 'attention' });
  const a = await screen.findByRole('link', { name: 'atlas' });
  expect(a).toHaveAttribute('data-underlined');
});
