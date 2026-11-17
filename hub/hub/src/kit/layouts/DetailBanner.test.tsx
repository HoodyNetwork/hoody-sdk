// Vitest: DetailPage's banner sits between the header and the body in both branches, the
// full page and a ListDetail pane, before the object's own notice; without it nothing is drawn.
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { DetailPage } from './Layouts';
import { DetailPaneContext } from './pane';

async function mount(el: () => ReactElement) {
  const router = createRouter({ routeTree: createRootRoute({ component: el }), history: createMemoryHistory({ initialEntries: ['/'] }) });
  await act(async () => {
    render(<RouterProvider router={router} />);
    await router.load();
  });
}

const PANE = { mode: 'fill' as const, listHidden: false, toggleList: () => undefined, close: () => undefined };

function Detail({ pane, banner = true }: { pane: boolean; banner?: boolean }) {
  const page = (
    <DetailPage header={{ title: 'Plans' }} banner={banner ? <p>the banner</p> : undefined} notice={<p>the notice</p>}>
      <p>the body</p>
    </DetailPage>
  );
  return pane ? <DetailPaneContext.Provider value={PANE}>{page}</DetailPaneContext.Provider> : page;
}

/** The direct child of the page root that holds `el`. */
const slotOf = (root: Element, el: Element) => [...root.children].find((c) => c.contains(el))!;

describe('DetailPage banner', () => {
  for (const pane of [false, true])
    it(`${pane ? 'pane' : 'full page'}: header, banner, notice, body, in that order`, async () => {
      await mount(() => <Detail pane={pane} />);
      const title = screen.getByRole('heading', { name: 'Plans' });
      const body = screen.getByText('the body');
      // The page root: the element whose children hold the title and the body apart.
      const page = [...document.querySelectorAll('div')].find((d) => d.contains(title) && d.contains(body) && slotOf(d, title) !== slotOf(d, body))!;
      const order = ['Plans', 'the banner', 'the notice', 'the body'].map((text) => {
        const el = text === 'Plans' ? title : text === 'the body' ? body : screen.getByText(text);
        return [...page.children].indexOf(slotOf(page, el));
      });
      expect(order.every((i) => i >= 0)).toBe(true);
      expect(order).toEqual([...order].sort((a, b) => a - b));
      expect(new Set(order).size).toBe(4); // each in its own slot
    });

  for (const pane of [false, true])
    it(`${pane ? 'pane' : 'full page'}: draws nothing without a banner`, async () => {
      await mount(() => <Detail pane={pane} banner={false} />);
      const notice = screen.getByText('the notice').parentElement!;
      expect(notice.previousElementSibling?.contains(screen.getByRole('heading', { name: 'Plans' }))).toBe(true);
    });
});
