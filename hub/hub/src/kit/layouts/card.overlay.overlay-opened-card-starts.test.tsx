// An overlay is a new surface, not part of the card that opened it. A Panel inside a
// Dialog, Drawer, Popover or Sheet opened from a Widget is an outermost card again and gets the corner; inside the
// overlay a card in a card stays square, and a Panel in a Widget with no overlay between them stays square.
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { act, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { boot } from '@core/test/env';
import { Button } from '../controls/Button';
import { Dialog, Drawer, Popover, Sheet } from '../overlays/Overlays';
import { Panel, Widget } from './Layouts';

vi.mock('../states/Toast', () => ({ showToast: () => 'k', closeToast: () => undefined }));

beforeEach(async () => {
  await new Promise((r) => setTimeout(r, 5));
  boot();
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(() => 400);
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(() => 200);
});

afterEach(() => {
  vi.restoreAllMocks();
  setPhone(false);
});

function setPhone(phone: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (q: string) => ({ matches: phone && q.includes('600'), media: q, addEventListener: () => undefined, removeEventListener: () => undefined }),
  });
}

async function inRouter(Component: () => ReactElement) {
  const router = createRouter({ routeTree: createRootRoute({ component: Component }), history: createMemoryHistory({ initialEntries: ['/'] }) });
  await act(async () => {
    render(<RouterProvider router={router} />);
    await router.load();
  });
}

const none = () => undefined;
const section = (name: string) => screen.getByRole('heading', { name }).closest('section')!;
const cornered = (el: Element) => el.hasAttribute('data-card-cut') && el.querySelector(':scope > svg[data-card-edge]') !== null;
const square = (el: Element) => !el.hasAttribute('data-card-cut') && el.querySelector(':scope > svg[data-card-edge]') === null;

const body = (
  <Panel title="In overlay">
    <Panel title="Nested in overlay">n</Panel>
  </Panel>
);
const overlays: Array<[string, () => ReactElement]> = [
  ['Dialog', () => <Dialog isOpen onOpenChange={none} title="Edit" primaryLabel="Save" onPrimary={none}>{body}</Dialog>],
  ['Drawer', () => <Drawer resizeKey="test-d4-card-overlay" isOpen onOpenChange={none} title="Share">{body}</Drawer>],
  ['Popover', () => <Popover isOpen onOpenChange={none} label="More" trigger={<Button variant="ghost">More</Button>}>{body}</Popover>],
  ['Sheet', () => <Sheet isOpen onOpenChange={none} title="Filters">{body}</Sheet>],
];

// Every slot an overlay takes arbitrary nodes in, not only its children.
const slot = <Panel title="In slot">s</Panel>;
const slots: Array<[string, () => ReactElement]> = [
  ['Dialog body', () => <Dialog isOpen onOpenChange={none} title="Edit" body={slot} primaryLabel="Save" onPrimary={none} />],
  ['Drawer actions', () => <Drawer resizeKey="test-d4-card-actions" isOpen onOpenChange={none} title="Share actions" actions={slot}>b</Drawer>],
  ['Drawer footer', () => <Drawer resizeKey="test-d4-card-footer" isOpen onOpenChange={none} title="Share" footer={slot}>b</Drawer>],
  ['Sheet actions', () => <Sheet isOpen onOpenChange={none} title="Filters" actions={slot}>b</Sheet>],
  ['Sheet footer', () => <Sheet isOpen onOpenChange={none} title="Filters" footer={slot}>b</Sheet>],
  [
    'Popover phone="sheet" on a phone',
    () => {
      setPhone(true);
      return <Popover isOpen onOpenChange={none} label="More" phone="sheet" trigger={<Button variant="ghost">More</Button>}>{slot}</Popover>;
    },
  ],
];

describe('an overlay opened from a card starts a new card scope', () => {
  it.each(overlays)('Widget > %s > Panel: the Panel has the corner; a Panel in it stays square', async (_n, overlay) => {
    const Overlay = overlay;
    await inRouter(() => (
      <Widget title="Opener">
        <Overlay />
      </Widget>
    ));
    expect(cornered(section('Opener'))).toBe(true);
    expect(cornered(section('In overlay'))).toBe(true);
    expect(square(section('Nested in overlay'))).toBe(true);
  });
  it('Widget > Panel with no overlay between them: the Panel stays square', async () => {
    await inRouter(() => (
      <Widget title="Opener">
        <Panel title="Inline">x</Panel>
      </Widget>
    ));
    expect(cornered(section('Opener'))).toBe(true);
    expect(square(section('Inline'))).toBe(true);
  });
  it.each(slots)('Widget > %s > Panel: the Panel in that slot has the corner', async (_n, overlay) => {
    const Overlay = overlay;
    await inRouter(() => (
      <Widget title="Opener">
        <Overlay />
      </Widget>
    ));
    expect(cornered(section('In slot'))).toBe(true);
  });
  it.each(overlays)('%s opened outside any card: its Panel has the corner, as before', async (_n, overlay) => {
    await inRouter(overlay);
    expect(cornered(section('In overlay'))).toBe(true);
    expect(square(section('Nested in overlay'))).toBe(true);
  });
});
