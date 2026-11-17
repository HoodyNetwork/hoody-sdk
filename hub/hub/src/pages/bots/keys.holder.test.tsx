// Vitest: the note for whoever holds a key. The drawer shows the stored note, trims it before it is sent, refuses more
// than 1000 characters and sends the note only when the person changed it (an empty one then clears the stored note);
// a new key carries one only when typed.
import { CoreQueryProvider, bootFixtureCore } from '@core';
import { render, screen, userEvent, waitFor } from '@app/testing';
import { describe, expect, it, vi } from 'vitest';
import { HOLDER_NOTE_MAX, editKeyBody, holderNoteTooLong, keyOf, mintKeyBody, type Change, type LinkKey } from './data';
import { KeyDrawer } from './parts/LinkDrawers';
import strings from './strings.en.json';

const fields = { name: 'ci', allowlist: ['10.0.0.1'], expiresAt: null, notes: 'owner only', holderNote: 'Rotate monthly' };

describe('the stored note is read', () => {
  it('holder_note of the agent\'s key is the key\'s holder note; none is empty', () => {
    expect(keyOf({ id: 'k1', name: 'ci', holder_note: 'Ask Dana' }).holderNote).toBe('Ask Dana');
    expect(keyOf({ id: 'k1', name: 'ci', holder_note: null }).holderNote).toBe('');
    expect(keyOf({ id: 'k1', name: 'ci' }).holderNote).toBe('');
  });
});

describe('the bound counts characters', () => {
  it('600 emoji are 1200 UTF-16 units but 600 characters: allowed; 1001 are not', () => {
    expect(holderNoteTooLong('\u{1F600}'.repeat(600))).toBe(false);
    expect(holderNoteTooLong('\u{1F600}'.repeat(1000))).toBe(false);
    expect(holderNoteTooLong('\u{1F600}'.repeat(1001))).toBe(true);
  });
});

describe('what is sent', () => {
  it('a new key carries a holder note only when there is one', () => {
    expect(mintKeyBody(fields)).toMatchObject({ name: 'ci', ipv4_allow: ['10.0.0.1'], notes: 'owner only', holder_note: 'Rotate monthly' });
    expect('holder_note' in mintKeyBody({ ...fields, holderNote: '' })).toBe(false);
  });
  it('an edit sends a changed note (an empty one clears the stored note) and leaves an untouched one out', () => {
    expect(editKeyBody(fields)).toMatchObject({ holder_note: 'Rotate monthly', notes: 'owner only', expires_at: null });
    expect(editKeyBody({ ...fields, holderNote: '' })).toMatchObject({ holder_note: '' });
    const { holderNote: _untouched, ...untouched } = fields;
    expect('holder_note' in editKeyBody(untouched)).toBe(false);
    expect('holder_note' in mintKeyBody(untouched)).toBe(false);
  });
  it('the bound is the API\'s: 1000 characters', () => {
    expect(HOLDER_NOTE_MAX).toBe(1000);
  });
});

const key: LinkKey = { id: 'k1', name: 'ci', prefix: 'hk_k1', enabled: true, allowlist: [], expiresAt: null, notes: '', holderNote: 'Rotate monthly', createdAt: '2026-10-01T00:00:00Z', rotatedAt: null };
const change = (run: Change<unknown, never>['run']) =>
  ({ run, outcome: 'idle', data: undefined, code: undefined, details: undefined, idem: undefined, running: false, readBack: async () => true, dismiss: () => undefined, reset: () => undefined }) as never;

function drawer(editing: LinkKey | null) {
  const mint = vi.fn(async () => ({ outcome: 'done' as const }));
  const edit = vi.fn(async () => ({ outcome: 'done' as const }));
  const onClose = vi.fn();
  bootFixtureCore({ rules: [] });
  render(<KeyDrawer open onClose={onClose} editing={editing} mint={change(mint as never)} edit={change(edit as never)} />, { wrapper: CoreQueryProvider });
  return { mint, edit, onClose };
}
const notesField = () => screen.getByLabelText(strings['keyForm.notes']) as HTMLTextAreaElement;
const field = () => screen.getByLabelText(strings['keyForm.holderNote']) as HTMLTextAreaElement;

describe('the key drawer', () => {
  it('shows the stored note of the key being edited', () => {
    drawer(key);
    expect(field().value).toBe('Rotate monthly');
  });

  it('saves an edited note trimmed', async () => {
    const { edit } = drawer(key);
    await userEvent.clear(field());
    await userEvent.type(field(), '  Ask Dana first  ');
    await userEvent.click(screen.getByRole('button', { name: strings['ui.save'] }));
    await waitFor(() => expect(edit).toHaveBeenCalledTimes(1));
    expect(edit).toHaveBeenCalledWith(expect.objectContaining({ action: 'edit', fields: expect.objectContaining({ holderNote: 'Ask Dana first' }) }));
  });

  it('clearing the field saves an empty note', async () => {
    const { edit } = drawer(key);
    await userEvent.clear(field());
    await userEvent.click(screen.getByRole('button', { name: strings['ui.save'] }));
    await waitFor(() => expect(edit).toHaveBeenCalledTimes(1));
    expect(edit).toHaveBeenCalledWith(expect.objectContaining({ fields: expect.objectContaining({ holderNote: '' }) }));
  });

  it('an edit that leaves the note alone does not send it, so a note written elsewhere is never overwritten or cleared', async () => {
    const { edit } = drawer(key);
    await userEvent.clear(screen.getByLabelText(strings['keyForm.name']));
    await userEvent.type(screen.getByLabelText(strings['keyForm.name']), 'ci2');
    await userEvent.click(screen.getByRole('button', { name: strings['ui.save'] }));
    await waitFor(() => expect(edit).toHaveBeenCalledTimes(1));
    const sent = (edit.mock.calls[0] as unknown as [{ fields: Record<string, unknown> }])[0].fields;
    expect(sent.name).toBe('ci2');
    expect('holderNote' in sent).toBe(false);
  });

  it('a note typed back to what was loaded is untouched too', async () => {
    const { edit } = drawer(key);
    await userEvent.type(field(), 'x');
    await userEvent.type(field(), '{Backspace}');
    await userEvent.click(screen.getByRole('button', { name: strings['ui.save'] }));
    await waitFor(() => expect(edit).toHaveBeenCalledTimes(1));
    expect('holderNote' in (edit.mock.calls[0] as unknown as [{ fields: Record<string, unknown> }])[0].fields).toBe(false);
  });

  it('a new key starts empty and carries what is typed', async () => {
    const { mint } = drawer(null);
    expect(field().value).toBe('');
    await userEvent.type(field(), 'Call me');
    await userEvent.click(screen.getByRole('button', { name: strings['keyForm.create'] }));
    await waitFor(() => expect(mint).toHaveBeenCalledTimes(1));
    expect(mint).toHaveBeenCalledWith(expect.objectContaining({ holderNote: 'Call me' }));
  });

  it('more than 1000 characters is refused before anything is sent, counted in characters not bytes', async () => {
    const { edit } = drawer(key);
    await userEvent.clear(field());
    await userEvent.click(field());
    await userEvent.paste('é'.repeat(1001));
    expect(await screen.findByText(strings['keyForm.holderBad'])).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings['ui.save'] })).toBeDisabled();
    await userEvent.clear(field());
    await userEvent.click(field());
    await userEvent.paste('é'.repeat(1000));
    expect(screen.queryByText(strings['keyForm.holderBad'])).toBeNull();
    expect(screen.getByRole('button', { name: strings['ui.save'] })).toBeEnabled();
    expect(edit).not.toHaveBeenCalled();
  });

  it('closing an untouched drawer does not ask; a typed holder note does', async () => {
    const first = drawer(key);
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(first.onClose).toHaveBeenCalled());
    expect(screen.queryByText('Discard changes?')).toBeNull();
  });

  it('a changed holder note alone makes the drawer ask before it closes', async () => {
    const d = drawer(key);
    await userEvent.type(field(), ' more');
    await userEvent.keyboard('{Escape}');
    expect(await screen.findByText('Discard changes?')).toBeInTheDocument();
    expect(d.onClose).not.toHaveBeenCalled();
  });

  it('owner notes: more than 500 characters is refused before anything is sent, counted in characters; 500 is allowed', async () => {
    const { mint } = drawer(null);
    await userEvent.click(notesField());
    await userEvent.paste('\u{1F600}'.repeat(501));
    expect(await screen.findByText(strings['keyForm.notesBad'])).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings['keyForm.create'] })).toBeDisabled();
    await userEvent.clear(notesField());
    await userEvent.click(notesField());
    await userEvent.paste('\u{1F600}'.repeat(500));
    expect(screen.queryByText(strings['keyForm.notesBad'])).toBeNull();
    expect(screen.getByRole('button', { name: strings['keyForm.create'] })).toBeEnabled();
    expect(mint).not.toHaveBeenCalled();
  });
});
