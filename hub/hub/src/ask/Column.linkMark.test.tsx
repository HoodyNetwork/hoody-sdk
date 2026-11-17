// Vitest: the dock's reply gets link marks only once it has stopped streaming. The column's caret also
// needs the snapshot to be working, so a reply still flagged streaming in a snapshot that is not working must not take marks
// (and must not ask its host for the realm's list).
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setProxyDomain } from '../core/hosts';
import { LinkHost, type HostComputer, type LinkHostValue } from '../kit/agent/linkHost';
import { Column } from './Column';
import * as C from './conv';
import type { AskEngine, Snapshot } from './engine';

const stamp = vi.hoisted(() => ({ streaming: false }));
vi.mock('./conv', async (orig) => {
  const real = await orig<typeof C>();
  return { ...real, blocks: (c: C.Conv, now: number) => real.blocks(c, now).map((b) => (b.k === 'reply' && stamp.streaming ? { ...b, streaming: true, final: false } : b)) };
});

const PROXY = 'computers.hoody.test';
const P = 'a'.repeat(24);
const ID = 'b'.repeat(24);
const atlas: HostComputer = { id: ID, project: P, name: 'atlas' };
const body = { messages: [
  { role: 'user', blocks: [{ kind: 'text', text: 'Open a terminal' }] },
  { role: 'assistant', blocks: [{ kind: 'text', text: `Terminal: https://${P}-${ID}-terminal-3.sg1.${PROXY}` }] },
] };
function snap(): Snapshot {
  const h = C.historyFrom(body, { liveTail: false, idOf: (i) => 'h' + i, at: 1 });
  const conv = { ...C.emptyConv('s1'), users: Object.fromEntries(h.users.map((u) => [u.id, u])), turns: h.turns };
  return { phase: 'ready', conv, status: null, dormant: false, gates: [] } as unknown as Snapshot;
}
const eng = {} as unknown as AskEngine;
const show = (want = vi.fn()) => {
  const host: LinkHostValue = { realm: 'global', lives: atlas, runs: atlas, computers: { rows: [{ id: ID, project_id: P, name: 'atlas', status: 'running' }], complete: true, failed: false }, want, openHub: () => undefined };
  render(<LinkHost value={host}><Column eng={eng} snap={snap()} agentUrl="" typing empty={null} /></LinkHost>);
  return want;
};

beforeEach(() => { stamp.streaming = false; setProxyDomain(PROXY); });
afterEach(() => { cleanup(); setProxyDomain(null); });

describe('dock reply marks', () => {
  it('a finished reply marks a link on your computer', () => {
    show();
    expect(screen.getByRole('button', { name: 'Open atlas · Terminal 3' })).toBeTruthy();
  });
  it('a reply still streaming gets no mark and asks for no list, even when the snapshot is not working', () => {
    stamp.streaming = true;
    const want = show();
    expect(screen.queryByRole('button', { name: 'Open atlas · Terminal 3' })).toBeNull();
    expect(want).not.toHaveBeenCalled();
  });
});
