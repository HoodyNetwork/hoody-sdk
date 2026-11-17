// Vitest: a read that failed on the Bots page keeps its rejection (the Details fold, "Copy details for support"), and an
// open Bot's pane is the one region with a primary: the page header's New Bot steps aside while it is open.
import { renderPage, screen } from '@app/testing';
import { beforeAll, describe, expect, it } from 'vitest';
import page from './page';
import strings from './strings.en.json';

beforeAll(async () => {
  await import('./view');
}, 30000);

const CHIEF = 'c-atlas~a1b2c3d4e5f60718293a4b5c~chief';

describe('the Bots list that could not be read', () => {
  it('shows the rejection\'s details', async () => {
    await renderPage(page, { state: 'error' });
    expect(await screen.findByRole('button', { name: /Details/ })).toBeInTheDocument();
  });
});

describe('New Bot in the page header', () => {
  it('is there with no Bot open', async () => {
    await renderPage(page);
    expect(await screen.findByRole('button', { name: strings['action.new'] })).toBeInTheDocument();
  });

  it('steps aside while a Bot\'s pane is open', async () => {
    await renderPage(page, { path: `/bots?sel=${encodeURIComponent(CHIEF)}` });
    await screen.findByRole('tab', { name: /Talk|Activity/ });
    expect(screen.queryByRole('button', { name: strings['action.new'] })).toBeNull();
  });
});
