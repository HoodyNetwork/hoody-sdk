// Vitest: the key form and the expiry the API accepts. The API takes expires_at as null or a UTC RFC 3339 time ending in Z (a
// fraction of up to three digits is fine), and refuses anything else with 400 BOT_FIELD_INVALID: an edit that sends '' for a key
// with no expiry could never save an added IP to such a key, so an edit sends the expiry only when the person changed it;
// null clears it. A failed edit says it wasn't saved (not "made").
import { CoreQueryProvider, bootFixtureCore } from '@core';
import { render, screen, userEvent, waitFor } from '@app/testing';
import { describe, expect, it, vi } from 'vitest';
import { editKeyBody, mintKeyBody, type LinkKey } from './data';
import { expiryFromDate } from './logic';
import { KeyDrawer } from './parts/LinkDrawers';
import { BOT_PROOFS } from './parts/proofs';
import strings from './strings.en.json';

/** The API's own check of an expiry, plus: in the future. */
const API_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const accepted = (v: unknown): boolean => v === null || (typeof v === 'string' && API_TIME.test(v) && Date.parse(v) > Date.now());

const base = { name: 'ci', allowlist: ['10.0.0.1'], notes: '' };

describe('what an edit sends as expires_at', () => {
  it('an untouched expiry is left out: the stored one stays, and an empty string is never sent', () => {
    const body = editKeyBody({ ...base });
    expect('expires_at' in body).toBe(false);
    expect(JSON.stringify(body)).not.toContain('"expires_at":""');
  });
  it('clearing the expiry sends null, setting one sends the end of that UTC day in the API\'s format', () => {
    expect(editKeyBody({ ...base, expiresAt: null })).toMatchObject({ expires_at: null });
    const end = expiryFromDate('2999-12-31');
    expect(editKeyBody({ ...base, expiresAt: end ?? null })).toMatchObject({ expires_at: '2999-12-31T23:59:59.999Z' });
    expect(accepted((editKeyBody({ ...base, expiresAt: end ?? null }) as Record<string, unknown>).expires_at)).toBe(true);
  });
  it('a new key sends the same format, or nothing', () => {
    expect('expires_at' in mintKeyBody({ ...base, expiresAt: null })).toBe(false);
    expect(accepted((mintKeyBody({ ...base, expiresAt: expiryFromDate('2999-01-02') ?? null }) as Record<string, unknown>).expires_at)).toBe(true);
  });
});

const key: LinkKey = { id: 'k1', name: 'ci', prefix: 'hk_k1', enabled: true, allowlist: [], expiresAt: null, notes: '', holderNote: '', createdAt: '2026-10-01T00:00:00Z', rotatedAt: null };
const change = (run: unknown, outcome = 'idle') =>
  ({ run, outcome, data: undefined, code: undefined, details: undefined, idem: undefined, running: false, readBack: async () => true, dismiss: () => undefined, reset: () => undefined }) as never;

function drawer(editing: LinkKey, outcome = 'idle') {
  const mint = vi.fn(async () => ({ outcome: 'done' as const }));
  const edit = vi.fn(async () => ({ outcome: 'done' as const }));
  bootFixtureCore({ rules: [] });
  render(<KeyDrawer open onClose={() => undefined} editing={editing} mint={change(mint)} edit={change(edit, outcome)} />, { wrapper: CoreQueryProvider });
  return { edit };
}
const sent = (edit: ReturnType<typeof vi.fn>): Record<string, unknown> => (edit.mock.calls[0] as unknown as [{ fields: Record<string, unknown> }])[0].fields;
const save = () => userEvent.click(screen.getByRole('button', { name: strings['ui.save'] }));
const expiry = () => screen.getByLabelText(strings['keyForm.expires']) as HTMLInputElement;

describe('the key drawer, editing', () => {
  it('adding an IP to a key with no expiry saves without an expiry field (the 400 case)', async () => {
    const { edit } = drawer(key);
    await userEvent.type(screen.getByLabelText(strings['ip.label']), '10.0.0.9');
    await save();
    await waitFor(() => expect(edit).toHaveBeenCalledTimes(1));
    expect('expiresAt' in sent(edit) && sent(edit).expiresAt !== undefined).toBe(false);
  });
  it('a key with an expiry the person did not touch keeps its exact stored time', async () => {
    const { edit } = drawer({ ...key, expiresAt: '2999-06-01T12:34:56.000Z' });
    expect(expiry().value).toBe('2999-06-01');
    await userEvent.clear(screen.getByLabelText(strings['keyForm.name']));
    await userEvent.type(screen.getByLabelText(strings['keyForm.name']), 'ci2');
    await save();
    await waitFor(() => expect(edit).toHaveBeenCalledTimes(1));
    expect(sent(edit).expiresAt).toBeUndefined();
  });
  it('clearing the date sends null; picking another sends the end of that day', async () => {
    const a = drawer({ ...key, expiresAt: '2999-06-01T12:34:56.000Z' });
    await userEvent.clear(expiry());
    await save();
    await waitFor(() => expect(a.edit).toHaveBeenCalledTimes(1));
    expect(sent(a.edit).expiresAt).toBeNull();
  });
  it('a date that has already passed is refused before anything is sent', async () => {
    const { edit } = drawer(key);
    await userEvent.type(expiry(), '2020-01-01');
    expect(await screen.findByText(strings['keyForm.expiresPast'])).toBeInTheDocument();
    expect(screen.getByRole('button', { name: strings['ui.save'] })).toBeDisabled();
    expect(edit).not.toHaveBeenCalled();
  });
  it('an edit that may have gone through says so, without the new-key advice to rotate', () => {
    drawer(key, 'pending');
    expect(screen.getByText(strings['keyForm.editMaybe'])).toBeInTheDocument();
    expect(screen.queryByText(strings['keyForm.maybe'])).toBeNull();
    expect(screen.queryByText(/rotate/i)).toBeNull();
  });
  it('a failed edit says the key wasn\'t saved, never "made"; a failed new key still says made', () => {
    drawer(key, 'failed');
    expect(screen.getByText(strings['keyForm.editFailed'])).toBeInTheDocument();
    expect(screen.queryByText(strings['keyForm.failed'])).toBeNull();
    expect(strings['keyForm.editFailed']).toBe("The key wasn't saved");
  });
});

describe('what proves an edit', () => {
  const link = (k: Record<string, unknown>) => ({ id: 'bu_1', botKey: 'c1~global~chief', botUid: 'u1', label: 'chief', ownerEnabled: true, cors: false, limits: {}, keysKnown: true, keys: [k] });
  const stored = (expiresAt: string | null) => ({ id: 'k1', name: 'ci', enabled: true, allowlist: ['10.0.0.1', '10.0.0.9'], expiresAt, notes: '', rotatedAt: null });
  const judge = (fields: Record<string, unknown>, expiresAt: string | null) => {
    const p = BOT_PROOFS.keyChange;
    return p.proves(p.identity({ linkId: 'bu_1', keyId: 'k1', action: 'edit', fields }), [[{ complete: true, links: [link(stored(expiresAt))] }]]);
  };
  const fields = { name: 'ci', allowlist: ['10.0.0.1', '10.0.0.9'], notes: '' };
  it('an edit that left the expiry alone is proved whatever expiry the key has', () => {
    expect(judge(fields, '2999-06-01T12:34:56.000Z')).toBe('applied');
    expect(judge(fields, null)).toBe('applied');
  });
  it('an edit that cleared it needs no expiry on the key; one that set it needs that time', () => {
    expect(judge({ ...fields, expiresAt: null }, null)).toBe('applied');
    expect(judge({ ...fields, expiresAt: null }, '2999-06-01T12:34:56.000Z')).toBeUndefined();
    expect(judge({ ...fields, expiresAt: '2999-06-01T23:59:59.999Z' }, '2999-06-01T23:59:59.999Z')).toBe('applied');
    expect(judge({ ...fields, expiresAt: '2999-06-01T23:59:59.999Z' }, null)).toBeUndefined();
  });
});
