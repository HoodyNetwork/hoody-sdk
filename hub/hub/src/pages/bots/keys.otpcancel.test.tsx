// The person's own Cancel of the 2FA code prompt on a key mint is not a failure. Core answers
// { outcome: 'not_sent', cancelled: true } (core/locked.test.tsx); the page's change puts its state back as it was and
// says nothing: the key drawer shows no "wasn't made" banner, stays open and keeps what was typed.
import { CoreQueryProvider, bootFixtureCore } from '@core';
import { render, screen, userEvent, waitFor } from '@app/testing';
import { describe, expect, it, vi } from 'vitest';
import { afterCancel, type Change } from './data';
import { KeyDrawer } from './parts/LinkDrawers';
import strings from './strings.en.json';

describe('a cancelled 2FA prompt', () => {
  it('puts the change back as it was and answers not_sent + cancelled', () => {
    const before = { outcome: 'idle' as const };
    const c = afterCancel(before);
    expect(c.state).toBe(before);
    expect(c.answer).toEqual({ outcome: 'not_sent', cancelled: true });
    const shown = { outcome: 'done' as const, data: { secret: 'x' } };
    expect(afterCancel(shown).state).toBe(shown);
  });

  it('leaves the key drawer open, with no failure said and the typed name kept', async () => {
    const before = { outcome: 'idle' as const };
    const run = vi.fn(async () => afterCancel(before).answer);
    const mint = { run, outcome: afterCancel(before).state.outcome, data: undefined, code: undefined, details: undefined, idem: undefined, running: false, readBack: async () => true, dismiss: () => undefined, reset: () => undefined } as unknown as Change<never, never>;
    const onClose = vi.fn();
    bootFixtureCore({ rules: [] });
    render(<KeyDrawer open onClose={onClose} editing={null} mint={mint as never} edit={mint as never} />, { wrapper: CoreQueryProvider });
    const name = screen.getByLabelText(strings['keyForm.name']) as HTMLInputElement;
    await userEvent.clear(name);
    await userEvent.type(name, 'ci');
    await userEvent.click(screen.getByRole('button', { name: strings['keyForm.create'] }));
    await waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(strings['keyForm.failed'])).toBeNull();
    expect(screen.queryByText(strings['keyForm.maybe'])).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(name.value).toBe('ci');
  });
});
