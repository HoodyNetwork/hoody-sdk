// Vitest on core's real read source: the reason the Ask drawer gives for a disabled Try
// again never says the script has no code when the last read of the file failed. The editor (useEditor, real) reads an empty
// file; a later refetch fails, which keeps the empty text (a failed refetch does not clear it). Only the read state can tell
// "no code" from "not known": the reason must be the loading one. Replaced: the sign-in box only records the reason it is given.
// The drawer is wired the way Detail.tsx wires it: current = the editor text, readFailed = the file read's isError.
import { CoreQueryProvider, queryClient } from '@core';
import { act, render, screen, userEvent } from '@app/testing';
import { describe, expect, it, vi } from 'vitest';
import { boot, onFetch, R1, settle } from '@core/test/env';
import type * as AgentSignInModule from './parts/AgentSignIn';
import strings from './strings.en.json';
import type { CompScripts, ScriptItem } from './types';

const blockedSeen = vi.hoisted(() => [] as Array<string | undefined>);
vi.mock('./parts/AgentSignIn', async (orig) => {
  const real = await orig<typeof AgentSignInModule>();
  return { ...real, AgentSignIn: (p: Parameters<typeof real.AgentSignIn>[0]) => { blockedSeen.push(p.blocked); return real.AgentSignIn(p); } };
});

import { AiDrawer } from './parts/AiDrawer';
import { useEditor, type EditorState } from './parts/useEditor';

const item = { id: 'atlas.1111~a.ts', compId: 'c1', compName: 'atlas', compHandle: 'atlas.1111', path: 'default/1/a.ts', name: 'a', route: '/a', description: '', status: 'working', schedule: null, keyed: false, calls: 0, failed: 0, managed: null, ownershipUnknown: false, group: 'ok' } as unknown as ScriptItem;
const comp = { id: 'c1', name: 'atlas', handle: 'atlas.1111', state: 'on', serverName: 'sv1', realmIds: [R1], origin: 'https://x', err: null, caps: { revisions: true, history: true }, agent: { templates: true, writer: true, writerOwner: 'fp1', guardedDelete: true }, agentRealm: 'global', rows: [], summary: {}, instances: {}, aliases: [], deleted: [] } as unknown as CompScripts;
const flush = async () => { for (let i = 0; i < 20; i++) await settle(); };

describe('the Ask drawer after a failed read of the file', () => {
  it('an empty file read, then a failed refetch: the text stays empty and Try again gives the loading reason, never the no-code one', async () => {
    boot({ realm: R1 });
    queryClient.clear();
    blockedSeen.length = 0;
    let readFails = false;
    onFetch((c) => (c.url.includes('/api/v1/exec/scripts/read') && !c.url.includes('/history/')
      ? (readFails ? { status: 500, body: { error: { code: 'INTERNAL', message: 'read failed' } } } : { status: 200, body: { data: { revision: 'r1', content: '' } } })
      : { status: 200, body: { data: {} } }));
    const ed: { now: EditorState | null } = { now: null };
    function Harness() {
      const e = useEditor(item, comp, () => undefined, ((k: string) => k) as never);
      ed.now = e;
      return <AiDrawer isOpen onClose={() => undefined} item={item} comp={comp} current={e.text} readFailed={e.file.isError} failure={undefined} onUse={() => undefined} />;
    }
    await act(async () => { render(<Harness />, { wrapper: CoreQueryProvider }); await flush(); });
    await vi.waitFor(() => expect(ed.now?.text).toBe(''));
    await userEvent.type(await screen.findByRole('textbox', { name: strings['ai.ask'] }), 'make it say b');
    await vi.waitFor(() => expect(blockedSeen.at(-1)).toBe(strings['retryWhy.code']));

    readFails = true;
    await act(async () => { await ed.now!.file.refetch(); await flush(); });
    await vi.waitFor(() => expect(ed.now!.file.isError).toBe(true));
    expect(ed.now!.text).toBe('');
    await vi.waitFor(() => expect(blockedSeen.at(-1)).toBe(strings['retryWhy.loading']));
  });
});
