// SessionPanel: the kit's Session tab on this page's data. The tab itself is tested in kit/agent/SessionTab.test.tsx; this
// pins what the page gives it: the agents of the chat's own realm, a failed read as null, still reading as absent, the Claude Code
// flag and the way to set a provider up, and no ensemble flag.
import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Target } from '@core';
import type { ConversationSource } from '@kit';
import { links } from '../links';
import { SessionPanel } from './SessionPanel';

const seen = vi.hoisted(() => ({ went: [] as string[], props: null as Record<string, unknown> | null, asked: [] as Array<{ target: unknown; realm: string }>, names: undefined as string[] | null | undefined }));
vi.mock('@kit', async (orig) => ({ ...(await orig<Record<string, unknown>>()), useGo: () => (to: string) => { seen.went.push(to); }, SessionTab: (p: Record<string, unknown>) => { seen.props = p; return null; } }));
vi.mock('./sessionAgents', () => ({ useSessionAgents: (target: unknown, realm: string) => { seen.asked.push({ target, realm }); return { names: seen.names }; } }));

const TARGET = { project: { id: 'p1' }, container: { id: 'c1' } } as unknown as Target;
const panel = () => render(<SessionPanel target={TARGET} session="s1" computer="atlas" realm="Personal" realmId="r-own" />);

beforeEach(() => { seen.went = []; seen.props = null; seen.asked = []; seen.names = undefined; });

describe('SessionPanel', () => {
  it('gives the tab the chat, its computer and realm names, the realm\'s wire id (the key of an unproven change), the Claude Code flag and a way to set a provider up, and no ensemble flag', () => {
    seen.names = ['general'];
    panel();
    expect(seen.props).toMatchObject({ target: TARGET, session: 's1', computer: 'atlas', realm: 'Personal', realmId: 'r-own', claudeCode: true });
    expect(typeof seen.props!.onSetup).toBe('function');
    expect('fusion' in seen.props!).toBe(false);
  });
  it('a provider that needs setting up leads to Models & keys at its key step; Claude Code to its own section', () => {
    panel();
    const setUp = seen.props!.onSetup as (m: { providerId: string }) => void;
    setUp({ providerId: 'openai' });
    setUp({ providerId: 'claude-code' });
    expect(seen.went).toEqual([links.connect('openai'), links.section('claude')]);
  });
  it('reads the agents of the chat\'s own realm on its computer', () => {
    panel();
    expect(seen.asked).toEqual([{ target: TARGET, realm: 'r-own' }]);
  });
  it('offers the names read', () => {
    seen.names = ['general', 'reviewer'];
    panel();
    expect(seen.props!.agents).toEqual(['general', 'reviewer']);
  });
  it('a failed read is null (cannot be changed here, says why)', () => {
    seen.names = null;
    panel();
    expect(seen.props!.agents).toBeNull();
  });
  it('a first read still running offers nothing yet', () => {
    panel();
    expect('agents' in seen.props!).toBe(false);
  });
});

describe('SessionPanel and a chat asleep on the computer', () => {
  it('gives the tab the chat\'s capability table, and draws it again when the chat\'s facts move (asleep → awake)', () => {
    let asleep = true;
    const subs = new Set<() => void>();
    let snap = { n: 0 };
    const source = {
      subscribe: (fn: () => void) => { subs.add(fn); return () => subs.delete(fn); },
      snapshot: () => snap,
      can: (a: string) => (asleep && a === 'setModel' ? { ok: false, reason: 'asleep' } : { ok: true }),
    } as unknown as ConversationSource;
    render(<SessionPanel target={TARGET} session="s1" computer="atlas" realm="Personal" realmId="r-own" source={source} />);
    const chat = () => seen.props!.chat as { can(a: string): { ok: boolean; reason?: string } };
    expect(chat().can('setModel')).toEqual({ ok: false, reason: 'asleep' });
    const before = seen.props;
    asleep = false;
    act(() => { snap = { n: 1 }; subs.forEach((f) => f()); });
    expect(seen.props).not.toBe(before);
    expect(chat().can('setModel')).toEqual({ ok: true });
  });
  it('without a source the tab gets no table (it reads the chat itself, as before)', () => {
    panel();
    expect('chat' in seen.props!).toBe(false);
  });
});
