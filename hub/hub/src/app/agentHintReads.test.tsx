// The "Use with your agent" hint on Keys and Vault adds no read:
// those pages act on no one computer, so their hint names none (useAgentScopeFacts(null)) and
// never reads the computers list. `undefined` instead of `null` would name the shell's computer and read the list: this
// test watches every fetch of the containers route while each page renders and its hint opens.
import { afterEach, describe, expect, it } from 'vitest';
import { renderPage, screen, userEvent, waitFor } from '@app/testing';
import { containersRoute, queryClient } from '@core';
import keys from '../pages/keys/page';
import vault from '../pages/vault/page';

let stop: (() => void) | undefined;
afterEach(() => stop?.());

/** Records every fetch the query cache starts for the containers route (any page, any query) from now on. */
function watchComputerReads(): unknown[][] {
  const seen: unknown[][] = [];
  stop = queryClient.getQueryCache().subscribe((e) => {
    if (e.type === 'updated' && e.action.type === 'fetch' && e.query.queryKey.includes(containersRoute.id)) seen.push([...e.query.queryKey]);
  });
  return seen;
}

describe('the agent hint on Keys and Vault reads no computers', () => {
  for (const [name, page] of [['Keys', keys], ['Vault', vault]] as const) {
    it(`${name}: the page and its open hint start no computers read`, async () => {
      const seen = watchComputerReads();
      const r = await renderPage(page);
      await userEvent.click(await screen.findByRole('button', { name: 'Use with your agent' }, { timeout: 30_000 }));
      const sheet = await screen.findByRole('dialog', { name: 'Use with your agent' });
      await waitFor(() => expect(sheet.querySelector('[data-prompt="main"]')?.textContent ?? '').toMatch(/^Use the Hoody skill\./), { timeout: 15_000 });
      // Past the page's own first reads and their answers (fixture latency is instant): a read the hint asked for has started.
      await new Promise((done) => setTimeout(done, 300));
      expect(seen).toEqual([]);
      r.unmount();
    }, 120_000);
  }
});
