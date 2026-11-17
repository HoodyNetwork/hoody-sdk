// Test helpers of the Permissions tab: the computers page rendered on one computer's Permissions tab. A test file hands
// in the app's testing tools (only test files may import them): `permissionsTesting({ renderPage, screen, userEvent, waitFor })`.
import type { computers } from './fixtures';
import { links } from './links';
import { handleOf } from './logic';
import page from './page';

export const SLOW = { timeout: 8000 };
// A file's first render pays the page's cold start (over 8 s under load).
const COLD = { timeout: 30000 };

type Find = (role: string, opts?: Record<string, unknown>, wait?: { timeout: number }) => Promise<HTMLElement>;
interface Tools<R> {
  renderPage: (p: typeof page, o: { path: string; state?: string }) => Promise<R>;
  screen: { findByRole: Find; getByRole: (role: string, opts?: Record<string, unknown>) => HTMLElement };
  userEvent: { click: (el: Element) => Promise<void> };
  waitFor: (check: () => void, o?: { timeout: number }) => Promise<unknown>;
}

export function permissionsTesting<R>({ renderPage, screen, userEvent, waitFor }: Tools<R>) {
  return {
    /** The page on `c`'s Permissions tab (a fixture state by name), and the tab's panel once it shows. */
    async openPermissions(c: (typeof computers)[number], state?: string) {
      const r = await renderPage(page, { path: links.permissions(handleOf(c)), ...(state ? { state } : {}) });
      const panel = await screen.findByRole('tabpanel', undefined, COLD);
      return Object.assign(panel, { rendered: r });
    },
    /** Leave the Permissions tab for Overview and come back: the tab's parts unmount and mount again (a new opening). */
    async leaveAndReturn(strings: { 'tab.overview': string; 'tab.permissions': string }) {
      await userEvent.click(screen.getByRole('tab', { name: strings['tab.overview'] }));
      await waitFor(() => { if (screen.getByRole('tab', { name: strings['tab.overview'] }).getAttribute('aria-selected') !== 'true') throw new Error('still on Permissions'); });
      await userEvent.click(screen.getByRole('tab', { name: strings['tab.permissions'] }));
      return screen.findByRole('tabpanel', undefined, SLOW);
    },
    /** The tab's panel as it is now, also while an overlay over the page hides it from assistive technology. */
    tabPanel: (): HTMLElement => screen.getByRole('tabpanel', { hidden: true }),
    /** A way in landed on a computer's Permissions tab: the tab is the selected one and shows the access part. */
    async landedOnPermissions(strings: { 'tab.permissions': string }, title: string, timeout = 8000) {
      await screen.findByRole('tab', { name: strings['tab.permissions'], selected: true }, { timeout });
      const panel = await screen.findByRole('tabpanel', undefined, { timeout });
      await waitFor(() => { if (!panel.textContent?.includes(title)) throw new Error('the access part is not shown'); }, { timeout });
      return panel;
    },
  };
}
