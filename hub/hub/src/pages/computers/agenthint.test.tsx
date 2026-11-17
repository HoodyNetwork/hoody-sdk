// "Use with your agent": the page header offers it in every view, before the Get button when that is a
// header action (a detail open) and beside the floating primary otherwise.
import { describe, expect, it } from 'vitest';
import { renderPage, screen } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

const HINT = 'Use with your agent';

describe('computers: agent hint', () => {
  it('the list header offers it', async () => {
    await renderPage(page, { path: '/computers' });
    expect(await screen.findByRole('button', { name: HINT }, { timeout: 8000 })).toBeInTheDocument();
  });

  it('with a detail open it comes before the Get button', async () => {
    await renderPage(page, { path: '/computers?sel=borealis.00b2' });
    const get = await screen.findByRole('button', { name: strings['action.get'] }, { timeout: 8000 });
    const hint = screen.getByRole('button', { name: HINT });
    expect(hint.compareDocumentPosition(get) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('the servers and projects views keep it', async () => {
    for (const path of ['/computers/servers', '/computers/projects']) {
      const r = await renderPage(page, { path });
      expect(await screen.findByRole('button', { name: HINT }, { timeout: 8000 })).toBeInTheDocument();
      r.unmount();
    }
  });
});
