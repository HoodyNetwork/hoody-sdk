// Vitest: the key drawer opened for a key (`?drawer=key:<id>`) only ever edits that key. When the key is no longer in the
// list (revoked elsewhere while the drawer is open) or the list is not read, the drawer says so and sends nothing: it
// never turns into New key, whose button would make a new key and show its secret. A drawer opened for no key still makes one.
import { CoreQueryProvider, bootFixtureCore } from '@core';
import { render, screen, userEvent, waitFor } from '@app/testing';
import { describe, expect, it, vi } from 'vitest';
import type { Change, LinkKey } from './data';
import { KeyDrawer } from './parts/LinkDrawers';
import strings from './strings.en.json';

const key: LinkKey = { id: 'k1', name: 'ci', prefix: 'hk_k1', enabled: true, allowlist: [], expiresAt: null, notes: '', holderNote: '', createdAt: '2026-10-01T00:00:00Z', rotatedAt: null };
const change = (run: Change<unknown, never>['run']) =>
  ({ run, outcome: 'idle', data: undefined, code: undefined, details: undefined, idem: undefined, running: false, readBack: async () => true, dismiss: () => undefined, reset: () => undefined }) as never;

function setup() {
  const mint = vi.fn(async () => ({ outcome: 'done' as const }));
  const edit = vi.fn(async () => ({ outcome: 'done' as const }));
  bootFixtureCore({ rules: [] });
  const ui = (p: { editing: LinkKey | null; editId?: string; known?: boolean }) => (
    <KeyDrawer open onClose={() => undefined} mint={change(mint as never)} edit={change(edit as never)} {...p} />
  );
  return { mint, edit, ui };
}
/** The drawer's send button, whatever it is called. */
const sendButton = (): HTMLButtonElement | null =>
  (screen.queryByRole('button', { name: strings['ui.save'] }) ?? screen.queryByRole('button', { name: strings['keyForm.create'] })) as HTMLButtonElement | null;
/** Nothing in the drawer can make a key, and pressing what is there sends nothing. */
async function sendsNothing(mint: ReturnType<typeof vi.fn>, edit: ReturnType<typeof vi.fn>) {
  expect(screen.queryByRole('button', { name: strings['keyForm.create'] })).toBeNull();
  expect(screen.queryByRole('dialog', { name: strings['keyForm.newTitle'] })).toBeNull();
  expect(screen.getByRole('dialog', { name: strings['keyForm.editTitle'] })).toBeInTheDocument();
  const b = sendButton();
  if (b) {
    expect(b.disabled || b.getAttribute('aria-disabled') === 'true').toBe(true);
    await userEvent.click(b).catch(() => undefined);
  }
  expect(mint).not.toHaveBeenCalled();
  expect(edit).not.toHaveBeenCalled();
}

describe('the key drawer opened for a key', () => {
  it('the key goes from the list mid-edit: the drawer says so and cannot make a key', async () => {
    const { mint, edit, ui } = setup();
    const view = render(ui({ editing: key, editId: 'k1', known: true }), { wrapper: CoreQueryProvider });
    expect((screen.getByLabelText(strings['keyForm.name']) as HTMLInputElement).value).toBe('ci');
    // Revoked elsewhere: the next read of the link has no such key.
    view.rerender(ui({ editing: null, editId: 'k1', known: true }));
    await sendsNothing(mint, edit);
    expect(screen.getByText(strings['keyForm.gone'])).toBeInTheDocument();
    expect(screen.queryByLabelText(strings['keyForm.name'])).toBeNull();
  });

  it('the list is not read at open: the drawer says so and cannot make a key; the key read later is edited', async () => {
    const { mint, edit, ui } = setup();
    const view = render(ui({ editing: null, editId: 'k1', known: false }), { wrapper: CoreQueryProvider });
    await sendsNothing(mint, edit);
    expect(screen.getByText(strings['keyForm.unread'])).toBeInTheDocument();
    expect(screen.queryByText(strings['keyForm.gone'])).toBeNull();
    view.rerender(ui({ editing: key, editId: 'k1', known: true }));
    await waitFor(() => expect((screen.getByLabelText(strings['keyForm.name']) as HTMLInputElement).value).toBe('ci'));
    await userEvent.click(screen.getByRole('button', { name: strings['ui.save'] }));
    await waitFor(() => expect(edit).toHaveBeenCalledTimes(1));
    expect(edit).toHaveBeenCalledWith(expect.objectContaining({ keyId: 'k1', action: 'edit' }));
    expect(mint).not.toHaveBeenCalled();
  });

  it('opened for no key it still makes one', async () => {
    const { mint, edit, ui } = setup();
    render(ui({ editing: null }), { wrapper: CoreQueryProvider });
    expect(screen.getByRole('dialog', { name: strings['keyForm.newTitle'] })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: strings['keyForm.create'] }));
    await waitFor(() => expect(mint).toHaveBeenCalledTimes(1));
    expect(edit).not.toHaveBeenCalled();
  });
});
