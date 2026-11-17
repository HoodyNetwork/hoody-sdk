// The kit's session row is one fixed line: where the list pane is narrow (a phone, or a desktop narrowed by the sidebar,
// the inspector or the Ask dock) it names the session only, so it never wraps over the rows below; the connection
// address and streams stay in the inspector. jsdom has no layout, so the pane's measured width is given here.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderPage, screen, waitFor, within } from '@app/testing';
import page from './page';
import strings from './strings.en.json';

const atWidth = (width: number) =>
  class {
    constructor(private cb: (e: { contentRect: { width: number } }[]) => void) {}
    observe() {
      this.cb([{ contentRect: { width } }]);
    }
    unobserve() {}
    disconnect() {}
  };

describe('tunnels: the session row on a narrow list pane', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('a desktop list pane of 480 px (sidebar and Ask dock open) names each session only', async () => {
    vi.stubGlobal('ResizeObserver', atWidth(480));
    await renderPage(page, { state: 'disconnect' });
    const tb = await screen.findByRole('table', { name: strings.title });
    await waitFor(() => expect(within(tb).getByText('Session 4f2a9c…')).toBeInTheDocument());
    expect(within(tb).getByText('Session 9b1d7e…')).toBeInTheDocument();
    expect(within(tb).queryByText(/streams of 1024/)).toBeNull();
  });

  it('a list pane wide enough keeps the full label: the connection address and the streams', async () => {
    vi.stubGlobal('ResizeObserver', atWidth(900));
    await renderPage(page, { state: 'disconnect' });
    const tb = await screen.findByRole('table', { name: strings.title });
    expect(await within(tb).findByText('Session 4f2a9c… · from 203.0.113.x · 3 streams of 1024')).toBeInTheDocument();
  });
});
