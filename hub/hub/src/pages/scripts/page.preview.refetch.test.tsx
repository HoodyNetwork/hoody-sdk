// Vitest on core's real read source: a version preview that was read, then refetched into an error, keeps its
// earlier answer beside the error (the query keeps data on a failed refetch). Restore must not stay live on it.
import { CoreQueryProvider, queryClient } from '@core';
import { formatDateTime } from '@kit';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { boot, onFetch, R1, settle } from '@core/test/env';
import { CodeTab } from './parts/CodeTab';
import type { EditorState } from './parts/useEditor';
import strings from './strings.en.json';
import type { CompScripts, ScriptItem } from './types';

const ID = 'atlas.1111~webhooks/stripe.ts';
const item = { id: ID, compId: 'c1', compName: 'atlas', compHandle: 'atlas.1111', path: 'default/1/webhooks/stripe.ts', name: 'stripe.ts', route: '/webhooks/stripe', description: '', status: null, schedule: null, keyed: false, calls: null, failed: null, managed: null, ownershipUnknown: false, group: 'ok' } as ScriptItem;
const comp = { id: 'c1', name: 'atlas', handle: 'atlas.1111', state: 'on', serverName: 'sv1', realmIds: [R1], origin: 'https://x', err: null, caps: { history: true }, agent: {}, rows: [], summary: {}, instances: {}, aliases: [], deleted: [] } as unknown as CompScripts;
const restoreVersion = vi.fn();
const ed = {
  file: { isPending: false, isError: false, data: { revision: 'r3', content: 'export default 3;\n' }, refetch: () => undefined },
  text: 'export default 3;\n', setText: () => undefined, save: async () => undefined, canWrite: true, locked: false, dirty: false, changes: [],
  verdict: null, conflict: false, note: null, setNote: () => undefined, out: null, dismiss: () => undefined, keepMine: async () => undefined, loadTheirs: async () => undefined,
  versions: { isPending: false, data: [{ version: 3, revision: 'r3', savedAt: '2026-10-20T10:00:00Z' }, { version: 2, savedAt: '2026-10-19T10:00:00Z' }] },
  restoreVersion,
} as unknown as EditorState;
const flush = async () => { for (let i = 0; i < 20; i++) await settle(); };

describe('a version preview whose refetch failed', () => {
  it('keeps showing what was read but does not offer Restore until a read settles again', async () => {
    boot({ realm: R1 });
    queryClient.clear();
    restoreVersion.mockClear();
    let status = 200;
    onFetch((c) => (c.url.includes('/history/read') ? (status === 200 ? { status: 200, body: { data: { revision: 'r2', content: 'export default 2;\n' } } } : { status: status, body: { error: { code: 'UNAVAILABLE' } } }) : { status: 200, body: { data: {} } }));
    await act(async () => { render(<CodeTab item={item} comp={comp} ed={ed} />, { wrapper: CoreQueryProvider }); await flush(); });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^Preview the version from / })); await flush(); });
    const dialog = await screen.findByRole('dialog', { name: strings['versions.previewTitle'].replace('{{at}}', formatDateTime('2026-10-19T10:00:00Z')) });
    expect(await within(dialog).findByLabelText(strings['versions.diff'])).toBeTruthy();
    const restore = () => within(dialog).getByRole('button', { name: strings['versions.restoreThis'] }) as HTMLButtonElement;
    expect(restore().disabled).toBe(false);

    status = 503;
    await act(async () => { void queryClient.refetchQueries({ type: 'active' }); await flush(); });
    await vi.waitFor(() => expect(restore().disabled).toBe(true), { timeout: 8000 });
    // The earlier answer is still on screen: the data was kept beside the error.
    expect(within(dialog).queryByLabelText(strings['versions.diff'])).toBeTruthy();
    await act(async () => { fireEvent.click(restore()); await flush(); });
    expect(restoreVersion).not.toHaveBeenCalled();
  }, 20000);
});
