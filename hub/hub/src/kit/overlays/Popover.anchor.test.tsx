// Vitest: Popover's opt-in `anchor` places the popover against that element (React Aria triggerRef);
// unset, nothing changes for any caller: no triggerRef is passed and the popover is placed against its trigger.
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef, type RefObject } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as RAC from 'react-aria-components';

const seen: Array<{ has: boolean; ref: unknown }> = [];
vi.mock('react-aria-components', async (orig) => {
  const m = await orig<typeof RAC>();
  const Real = m.Popover;
  return { ...m, Popover: (p: Parameters<typeof Real>[0]) => { seen.push({ has: 'triggerRef' in p, ref: (p as { triggerRef?: unknown }).triggerRef }); return <Real {...p} />; } };
});
const { Popover } = await import('./Popover');
const { Button } = await import('../controls/Button');

afterEach(() => { cleanup(); seen.length = 0; });

describe('Popover anchor', () => {
  it('unset: no triggerRef, as before', async () => {
    render(<Popover label="Pop" trigger={<Button>Open</Button>}>body</Popover>);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Open' }));
    await screen.findByRole('dialog', { name: 'Pop' });
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((x) => !x.has)).toBe(true);
  });

  it('set: the anchor ref is the triggerRef, and the trigger still opens it', async () => {
    const anchor = createRef<HTMLDivElement>() as RefObject<HTMLDivElement | null>;
    render(
      <>
        <div ref={anchor} data-testid="anchor" />
        <Popover label="Pop" anchor={anchor} trigger={<Button>Open</Button>}>body</Popover>
      </>,
    );
    await userEvent.setup().click(screen.getByRole('button', { name: 'Open' }));
    await screen.findByRole('dialog', { name: 'Pop' });
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((x) => x.ref === anchor)).toBe(true);
  });
});
