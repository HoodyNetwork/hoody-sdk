// Vitest: a Logs view of one dynamic script's runs names it as the Scripts page does ("Orders by
// id") in its "for" band and its filter chip, never by its bracket file name.
import { describe, expect, it } from 'vitest';
import { renderPage, screen } from '@app/testing';
import page from './page';

describe('Logs: a dynamic script is named in words', () => {
  it('the band and the chip read "Orders by id", never "[id]"', async () => {
    await renderPage(page, { path: '/logs?src=scripts&script=orders%2F%5Bid%5D.ts' });
    expect(await screen.findByText('Runs of Orders by id')).toBeInTheDocument();
    expect(screen.queryByText(/\[id\]/)).toBeNull();
  });
});
