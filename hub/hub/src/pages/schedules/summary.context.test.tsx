// Vitest: the header's summary line holds links (Computers ›, N programs running ›), so it is the
// header's context row, never its subtitle. The subtitle is a two-line clamp (kit PageHeader): beside the header's buttons
// (600 to 860 px wide) it cut "9 programs running ›" off while the link kept its place in the Tab order, so focus landed
// on nothing seen. The context row is never clamped.
import { renderPage, screen } from '@app/testing';
import { expect, it } from 'vitest';
import page from './page';
import strings from './strings.en.json';

it('the summary links sit in the header, outside its clamped subtitle', async () => {
  await renderPage(page);
  const computers = await screen.findByRole('button', { name: strings['sum.computers'] });
  const programs = await screen.findByRole('button', { name: /running ›$/ });
  for (const link of [computers, programs]) {
    const head = link.closest('header');
    expect(head?.querySelector('h1[data-hub-title]')).not.toBeNull();
    // The subtitle is the header's <p>; the context row is a <div>.
    expect(link.closest('p')).toBeNull();
  }
  // The line reads as before: the counts, then each link after its dot (the space after a dot is a no-break space, see
  // parts/SummaryLine.tsx).
  const line = (computers.closest('header')!.textContent ?? '').replaceAll('\u00a0', ' ');
  expect(line).toMatch(/schedules? on .+ · Computers ›.* · \d+ programs? running ›/);
});
