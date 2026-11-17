// Vitest: a drawer footer with a send in flight or an unknown outcome refuses a plain close, like the
// kit's FormFooter: the dirty "Discard changes?" ask must not offer to throw away a pending save.
import { Drawer } from '@kit';
import { render, screen, userEvent } from '@app/testing';
import { describe, expect, it } from 'vitest';
import { DrawerFooter } from './parts/Bits';

const ui = (o: { busy?: boolean; pending?: boolean }) => (
  <Drawer resizeKey="test-footer-test" isOpen onOpenChange={() => undefined} title="T" dirty footer={<DrawerFooter cancelLabel="Cancel" submitLabel="Save" onSubmit={() => undefined} {...o} />}>
    body
  </Drawer>
);

describe('DrawerFooter reports its send state to the drawer', () => {
  it('a pending save: Cancel does not ask to discard', async () => {
    render(ui({ pending: true }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('Discard changes?')).toBeNull();
  });

  it('a send in flight: Cancel is refused', async () => {
    render(ui({ busy: true }));
    expect((screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('nothing sent: a dirty Cancel still asks', async () => {
    render(ui({}));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByText('Discard changes?')).toBeTruthy();
  });
});
