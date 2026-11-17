// Vitest on core's real read source (the Code tab's Preview button): the Code tab mounts with no version picked, so its version read is
// built disabled with no parameters; core builds a read's input before it applies `enabled`, and that must not throw. Then a
// preview opens (one history/read of that version, sent through core's real transport to the kit) and is cancelled (nothing
// else sent). The fixture transport ignores read inputs, so only this path catches a read whose input cannot take none.
import { CoreQueryProvider, queryClient } from '@core';
import { formatDateTime } from '@kit';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { boot, calls, onFetch, R1, settle } from '@core/test/env';
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
const historyReads = () => calls.filter((c) => c.url.includes('/api/v1/exec/scripts/history/read'));

describe('the Code tab on core\'s real read source', () => {
  it('mounts with no preview, opens a preview of one version and cancels it, sending nothing else', async () => {
    boot({ realm: R1 });
    queryClient.clear();
    onFetch((c) => (c.url.includes('/history/read') ? { status: 200, body: { data: { revision: 'r2', content: 'export default 2;\n' } } } : { status: 200, body: { data: {} } }));
    await act(async () => { render(<CodeTab item={item} comp={comp} ed={ed} />, { wrapper: CoreQueryProvider }); await flush(); });
    expect(screen.getByRole('complementary', { name: strings['versions.title'] })).toBeTruthy();
    expect(historyReads()).toHaveLength(0);

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^Preview the version from / })); await flush(); });
    const dialog = await screen.findByRole('dialog', { name: strings['versions.previewTitle'].replace('{{at}}', formatDateTime('2026-10-19T10:00:00Z')) });
    expect(await within(dialog).findByLabelText(strings['versions.diff'])).toBeTruthy();
    expect(historyReads()).toHaveLength(1);
    expect(historyReads()[0]!.url).toMatch(/[?&]version=2(&|$)/);
    expect(historyReads()[0]!.url).toContain('path=');

    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: (n, el) => n === strings['versions.close'] && !el.hasAttribute('data-dialog-close') })); await flush(); });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(restoreVersion).not.toHaveBeenCalled();
    expect(historyReads()).toHaveLength(1);
    expect(calls.filter((c) => c.method !== 'GET')).toHaveLength(0);
  });
});
