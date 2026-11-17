// Keys page, token (shared-access) session: the limited state shows and the tab badges' counts ask for nothing, so
// the key list is never requested.
import { describe, expect, it, vi } from 'vitest';
import { renderPage, screen } from '@app/testing';
import * as data from './data';
import page from './page';
import strings from './strings.en.json';

vi.mock('./data', async (orig) => {
  const real = await orig<typeof data>();
  return { ...real, useIsAccount: () => false, useKeyList: vi.fn(real.useKeyList) };
});

describe('keys: a token session', () => {
  it('shows the limited state and starts no key-list query', async () => {
    await renderPage(page);
    expect(await screen.findByText(strings['st.limited.title'])).toBeInTheDocument();
    expect(vi.mocked(data.useKeyList)).not.toHaveBeenCalled();
  }, 30000);
});
