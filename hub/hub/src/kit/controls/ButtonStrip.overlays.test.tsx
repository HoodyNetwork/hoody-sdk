// A strip's scope ends at the overlays its buttons open. The agent hint's drawer (the whole screen on a phone) and the More
// menu's phone tray are new surfaces (CardScopeReset, CardEdge.tsx), so the buttons in them (Hide on this page, the
// sheet's back arrow, the tray's Close) keep their own look: no strip marker, no strip class, and a glyph button keeps
// its end glyph.
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { boot } from '@core/test/env';
import { Popover } from '../overlays/Overlays';
import { ActionMenu } from '../overlays/Menu';
import overlayStrings from '../overlays/strings.en.json';
import { AgentHint } from '../widgets/AgentHint';
import hint from '../widgets/AgentHint.strings.en.json';
import { Button } from './Button';
import s from './Button.module.css';
import { ButtonStrip } from './ButtonStrip';

function setPhone(phone: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (q: string) => ({ matches: phone && q.includes('600'), media: q, addEventListener: () => undefined, removeEventListener: () => undefined }),
  });
}

beforeEach(async () => {
  await new Promise((r) => setTimeout(r, 5));
  boot();
  setPhone(false);
});
afterEach(() => {
  cleanup();
  setPhone(false);
  window.dispatchEvent(new Event('blur'));
});

const noop = () => undefined;
const strip = () => (
  <ButtonStrip label="Page actions">
    <AgentHint page="vault" facts={{ realm: null, computer: null }} />
    <ActionMenu items={[{ id: 'export', label: 'Export', onAction: noop }]} />
  </ButtonStrip>
);
/** The hint's links read the router (as on every page): the hint's tests mount one. */
const routed = async () => {
  const router = createRouter({ routeTree: createRootRoute({ component: strip }), history: createMemoryHistory({ initialEntries: ['/'] }) });
  await act(async () => {
    render(<RouterProvider router={router} />);
    await router.load();
  });
};
const press = async (el: HTMLElement) => {
  await act(async () => {
    fireEvent.click(el);
  });
};
function expectOwnLook(b: HTMLElement) {
  expect(b.hasAttribute('data-strip')).toBe(false);
  expect(b.className.split(/\s+/)).not.toContain(s.inStrip);
}

describe('overlays a strip button opens keep their own buttons', () => {
  it('control: the two strip buttons themselves take the strip look', () => {
    render(strip());
    const group = screen.getByRole('group', { name: 'Page actions' });
    for (const b of within(group).getAllByRole('button')) expect(b.hasAttribute('data-strip')).toBe(true);
  });

  it("the agent hint's drawer: Hide on this page", async () => {
    await routed();
    await press(screen.getByRole('button', { name: hint['hint.label'] }));
    const dialog = await screen.findByRole('dialog', { name: hint['hint.title'] });
    expectOwnLook(within(dialog).getByRole('button', { name: hint['hint.hide'] }));
  });

  it("the agent hint's phone sheet: the back arrow and Hide on this page", async () => {
    setPhone(true);
    await routed();
    await press(screen.getByRole('button', { name: hint['hint.label'] }));
    const dialog = await screen.findByRole('dialog', { name: hint['hint.title'] });
    // The hint is a kit Drawer: its phone back arrow and its × both read Close (CSS shows one per width).
    for (const b of within(dialog).getAllByRole('button', { name: overlayStrings.close })) expectOwnLook(b);
    expectOwnLook(within(dialog).getByRole('button', { name: hint['hint.hide'] }));
  });

  it("the More menu's phone tray: Close", async () => {
    setPhone(true);
    render(strip());
    await press(screen.getByRole('button', { name: overlayStrings.more }));
    const tray = document.querySelector<HTMLElement>('[data-hub-tray]');
    expect(tray).not.toBeNull();
    expectOwnLook(within(tray!).getByRole('button', { name: overlayStrings.close }));
  });

  it('a glyph button in a popover a strip button opens keeps its glyph', async () => {
    render(
      <ButtonStrip label="Page actions">
        <Popover label="Details" trigger={<Button variant="ghost">Details</Button>}>
          <Button variant="primary">Continue</Button>
        </Popover>
      </ButtonStrip>,
    );
    await press(screen.getByRole('button', { name: 'Details' }));
    const go = await screen.findByRole('button', { name: 'Continue' });
    expectOwnLook(go);
    expect(go.hasAttribute('data-glyph')).toBe(true);
    expect(go.querySelector(':scope > [data-glyph-mark]')).not.toBeNull();
  });
});
