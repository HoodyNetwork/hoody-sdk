// Vitest: the Computers zero state. An older build's computer-create record, converted on load, is held with
// no sender and no identity: no page can name or prove it, so the zero state reads "couldn't check". Its way out
// is the person's warned Dismiss, here, through the real change store: confirmed, it frees that hold and Create
// comes back; cancelled, nothing is freed. A setup read that failed with no such hold offers no Dismiss.
import { describe, expect, it, vi } from 'vitest';
import { act } from '@testing-library/react';
import { renderPage, screen, userEvent } from '@app/testing';
import { CHANGE_STORE_KEY, SENDING_STALE_MS, readChanges, writeChanges, type StoredChange } from '@core/change-store';
import * as C from '@core/changes';
import page from './page';
import strings from './strings.en.json';

const R1 = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const COULD_NOT_CHECK = "We couldn't check whether a computer is being set up";

// The shape core converts on load (core/changes.converted-create.test.ts): a computer.create record with no
// metadata and no format marks, its stamp past the sending window. Made by a real send whose outcome stayed unknown, then stripped.
async function seedConverted(): Promise<void> {
  await C.guarded(C.realmScoped('s'), 'd', () => Promise.resolve({ outcome: 'pending' as const, idem: 'K-old' }));
  const r = readChanges()!.find((x) => x.id.includes(C.realmScoped('s')))!;
  const { fmt: _f, oc: _o, meta: _m, ...older } = r as StoredChange & { meta?: unknown };
  void _f; void _o; void _m;
  // Stamped past the sending window, as a record left by a closed tab is when the Hub loads again.
  const old = Date.now() - SENDING_STALE_MS - 1000;
  const converted = { ...older, t: old, at: old, id: r.id.replace(C.realmScoped('s'), C.realmScoped('lock:computer.create')) } as StoredChange;
  C.reloadChangesForTests();
  writeChanges([converted]);
  act(() => { window.dispatchEvent(new StorageEvent('storage', { key: CHANGE_STORE_KEY })); });
  // Conversion runs at the start of the store-lock turn the load queued (changes.ts convertStored).
  await vi.waitFor(() => expect(C.heldChanges('computer.create', { realm: R1 })).toMatchObject([{ by: undefined, identity: undefined, realm: null }]), { timeout: 5000 });
}

describe('computers zero state: a way out of an unidentified held create', () => {
  it('offers a warned Dismiss; confirmed, it frees that hold and Create comes back', async () => {
    await renderPage(page, { state: 'emptyNone', realm: R1 });
    await act(async () => { await seedConverted(); });
    expect(await screen.findByText(COULD_NOT_CHECK, {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.getByText(strings['zero.unknown.oldBody'])).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings['zero.retry'] })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: strings['zero.unknown.dismiss'] }));
    expect(await screen.findByText(strings['held.dismissBody'])).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: strings['held.dismissGo'] }));
    expect(await screen.findByRole('button', { name: strings['zero.empty.create'] }, { timeout: 8000 })).toBeInTheDocument();
    expect(C.heldChanges('computer.create', { realm: R1 })).toHaveLength(0);
  });
  it('cancelled, nothing is freed: still held, still "couldn\'t check"', async () => {
    await renderPage(page, { state: 'emptyNone', realm: R1 });
    await act(async () => { await seedConverted(); });
    await userEvent.click(await screen.findByRole('button', { name: strings['zero.unknown.dismiss'] }, { timeout: 8000 }));
    await userEvent.click(await screen.findByRole('button', { name: /cancel/i }));
    expect(screen.getByText(COULD_NOT_CHECK)).toBeInTheDocument();
    expect(C.heldChanges('computer.create', { realm: R1 })).toHaveLength(1);
  });
  it('a failed setup read with no such hold offers Check again only, no Dismiss', async () => {
    C.resetChanges();
    await renderPage(page, { state: 'emptySetupDown', realm: R1 });
    expect(await screen.findByText(COULD_NOT_CHECK, {}, { timeout: 8000 })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: strings['zero.unknown.dismiss'] })).toBeNull();
    expect(screen.getByText(strings['zero.unknown.body'])).toBeInTheDocument();
  });
});
