// Sheets and popovers at their edges: a sheet that mounts open together with its Dialog still sits above it, and a
// Popover whose caller takes or gives back control of its open state never reopens or closes by itself.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { boot } from '@core/test/env';
import { Button } from '../controls/Button';
import { Dialog, Popover, Sheet } from './Overlays';

vi.mock('../states/Toast', () => ({ showToast: () => 'k', closeToast: () => undefined }));

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
  setPhone(true);
});
afterEach(() => {
  cleanup();
  setPhone(false);
  document.body.replaceChildren();
});

describe('a Sheet that mounts open together with its Dialog', () => {
  it('sits above the Dialog (inside it)', async () => {
    render(
      <Dialog isOpen onOpenChange={() => undefined} title="Move">
        <Sheet isOpen onOpenChange={() => undefined} title="Places">
          <p>rows</p>
        </Sheet>
      </Dialog>,
    );
    await act(async () => {});
    expect(screen.getByRole('dialog', { name: 'Places' }).closest('[data-over-dialog]')).not.toBeNull();
  });

  it('sits above the Dialog (beside it)', async () => {
    render(
      <>
        <Dialog isOpen onOpenChange={() => undefined} title="Move">
          <p>body</p>
        </Dialog>
        <Sheet isOpen onOpenChange={() => undefined} title="Places">
          <p>rows</p>
        </Sheet>
      </>,
    );
    await act(async () => {});
    expect(screen.getByRole('dialog', { name: 'Places' }).closest('[data-over-dialog]')).not.toBeNull();
  });

  it('control: with no Dialog it stays at the drawer layer', async () => {
    render(
      <Sheet isOpen onOpenChange={() => undefined} title="Places">
        <p>rows</p>
      </Sheet>,
    );
    await act(async () => {});
    expect(screen.getByRole('dialog', { name: 'Places' }).closest('[data-over-dialog]')).toBeNull();
  });
});

describe('a Popover whose caller takes and gives back control', () => {
  const pop = (isOpen?: boolean) => (
    <Popover label="Pick" phone="sheet" trigger={<Button>Open</Button>} {...(isOpen === undefined ? {} : { isOpen })}>
      <p>rows</p>
    </Popover>
  );

  it('opened by itself, closed by the caller, then released: stays closed', async () => {
    const r = render(pop());
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    });
    expect(screen.queryByRole('dialog', { name: 'Pick' })).not.toBeNull();
    r.rerender(pop(false));
    await act(async () => {});
    expect(screen.queryByRole('dialog', { name: 'Pick' })).toBeNull();
    r.rerender(pop());
    await act(async () => {});
    expect(screen.queryByRole('dialog', { name: 'Pick' })).toBeNull();
  });

  it('opened by the caller, then released: stays open', async () => {
    const r = render(pop(true));
    await act(async () => {});
    expect(screen.queryByRole('dialog', { name: 'Pick' })).not.toBeNull();
    r.rerender(pop());
    await act(async () => {});
    expect(screen.queryByRole('dialog', { name: 'Pick' })).not.toBeNull();
  });
});
