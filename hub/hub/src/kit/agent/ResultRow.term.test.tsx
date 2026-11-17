// ResultRow in the terminal, by the web's rules (ResultRow.tsx, ResultRow.test.tsx): under a finished reply, what the turn
// made. A site only from the reply's own link to a running web port of yours: "Site atlas · port 3000", Open (handed outside
// the Hub: the host's browser) and ⋯ with Copy address and Put on Board; "N files changed" with Review only where the chat has
// Details. Nothing is guessed. The address holds the computer's ids: it is never drawn. Before, the terminal conversation
// drew only "✎ N files changed" (a wrong plural for one) and never the site.
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import type { ReactNode } from 'react';
import { drawTest, type TestTerm } from '../../term/prim/testing';
import { Box, FocusRoot } from '../../term/prim';
import { OverlayHost } from '../../term/prim/Overlay';
import { act, getByRole, queryAllByRole, semanticsOf, type SemRoot } from '../../term/prim/semantics';
import { beginTermSession, type TermSession } from '../../term/env/session';
import { setProxyDomain } from '../../core/hosts';
import { closeToast, toastQueue } from '../states/Toast.store';
import { can, type CapFacts } from './capability';
import { LinkHost, type HostComputer, type HostComputers, type LinkHostValue } from './linkHost';
import { ResultRow } from './ResultRow';
import { SessionView } from './SessionView';
import type { ConvBlock, ConversationSource, ConvSnapshot } from './source';

const PROXY = 'computers.hoody.test';
const P = 'a'.repeat(24);
const C = 'b'.repeat(24);
const atlas: HostComputer = { id: C, project: P, name: 'atlas' };
const list = (status: string): HostComputers => ({ rows: [{ id: C, project_id: P, name: 'atlas', status, server_name: 'sg1' }], complete: true, failed: false });
const hostOf = (status = 'running', more: Partial<LinkHostValue> = {}): LinkHostValue => ({ realm: 'global', lives: atlas, runs: atlas, computers: list(status), openHub: () => undefined, ...more });
const port = (n: number) => `https://${P}-${C}-http-${n}.sg1.${PROXY}`;
const SITE = 'Site atlas · port 3000';

let t: TestTerm | null = null;
let s: TermSession | null = null;
const clearToasts = () => { for (const x of [...toastQueue().visibleToasts]) closeToast(x.key); };
beforeEach(() => { setProxyDomain(PROXY); clearToasts(); });
afterEach(() => { t?.renderer.destroy(); t = null; s?.end(); s = null; setProxyDomain(null); clearToasts(); });

const draw = async (node: ReactNode, width = 80, height = 12): Promise<string> => {
  t = await drawTest(<FocusRoot><OverlayHost><Box dir="column" width={width}>{node}</Box></OverlayHost></FocusRoot>, { width, height });
  return t.settle();
};
const sem = () => semanticsOf(t!.renderer as unknown as SemRoot);
const press = async (role: 'button' | 'menuitem', name: string): Promise<string> => {
  act(getByRole(sem(), role, { name }), 'press');
  return t!.settle();
};

describe('ResultRow', () => {
  test('a reply linking a running web port of yours: Site, Open hands the whole address outside, ⋯ Copy and Put on Board', async () => {
    const opened: string[] = [];
    s = beginTermSession({ openExternal: (u) => { opened.push(u); } });
    const boardAdds: string[] = [];
    const hubOpened: string[] = [];
    const host = hostOf('running', { boardAdd: (x) => { boardAdds.push(x.label); return '/board?add=x'; }, openHub: (p) => { hubOpened.push(p); } });
    const f = await draw(<LinkHost value={host}><ResultRow text={`Running at ${port(3000)}/app now.`} /></LinkHost>);
    expect(f).toContain(SITE);
    // The address holds the computer's ids: never drawn.
    expect(f).not.toContain(C);
    await press('button', 'Open atlas · port 3000');
    expect(opened).toEqual([`${port(3000)}/app`]);
    await press('button', 'More for atlas · port 3000');
    expect(queryAllByRole(sem(), 'menuitem', { name: 'Copy address' })).toHaveLength(1);
    const after = await press('menuitem', 'Put on Board');
    expect(hubOpened, after).toEqual(['/board?add=x']);
    expect(boardAdds).toEqual(['atlas · port 3000']);
  }, 60_000);

  test('no site is guessed: no link, a stopped computer, another site, or no host', async () => {
    for (const [text, host] of [
      ['All done, nothing to open.', hostOf()],
      [`It ran at ${port(3000)}.`, hostOf('stopped')],
      ['See https://example.com/docs.', hostOf()],
      [`It ran at ${port(3000)}.`, null],
    ] as const) {
      const f = await draw(<LinkHost value={host}><ResultRow text={text} /></LinkHost>);
      expect(f).not.toContain('Site ');
      expect(queryAllByRole(sem(), 'button', { name: /^Open / })).toHaveLength(0);
      t!.renderer.destroy();
      t = null;
    }
  }, 60_000);

  test('the files count, and Review only where the chat has Details', async () => {
    let reviews = 0;
    const three = await draw(<ResultRow text="Done." files={3} onReview={() => { reviews++; }} />);
    expect(three).toContain('3 files changed');
    await press('button', 'Review the 3 changed files in Details');
    expect(reviews).toBe(1);
    t!.renderer.destroy();
    const one = await draw(<ResultRow text="Done." files={1} />);
    expect(one).toContain('1 file changed');
    expect(queryAllByRole(sem(), 'button', { name: /Review/ })).toHaveLength(0);
  }, 60_000);
});

const FACTS: CapFacts = {
  mode: 'read', backend: 'native', reach: 'ok', state: 'idle', daemonPaused: false, approval: 'default', firstTurnStarted: true,
  turn: false, gate: 'none', gateBlocked: false, decisionPending: false, queued: false, children: false, shells: false, unsettledSends: 0,
  prereq: { journal: true, recovery: true, attachment: true, approver: 'notNeeded' },
};
const reply = (o: Partial<Extract<ConvBlock, { k: 'reply' }>> = {}): ConvBlock => ({ k: 'reply', key: 'r1', text: `Running at ${port(3000)}/app now.`, streaming: false, final: true, cost: null, at: null, files: 2, ...o } as ConvBlock);
const sourceOf = (blocks: ConvBlock[]): ConversationSource => {
  const snap = { facts: FACTS, title: 't', blocks, gates: [] } as unknown as ConvSnapshot;
  return { kind: 'session', ref: { computer: 'atlas.1234', realm: 'global', sid: 's1' }, snapshot: () => snap, subscribe: () => () => undefined, watch: () => undefined, can: (a: Parameters<ConversationSource['can']>[0]) => can(a, FACTS) } as unknown as ConversationSource;
};

describe('in the conversation', () => {
  test('under a finished reply: the site and the files, as on the web', async () => {
    const f = await draw(<LinkHost value={hostOf()}><Box dir="column" height={20}><SessionView source={sourceOf([reply()])} size="l" onReview={() => undefined} /></Box></LinkHost>, 80, 20);
    expect(f).toContain(SITE);
    expect(f).toContain('2 files changed');
    expect(queryAllByRole(sem(), 'button', { name: 'Open atlas · port 3000' })).toHaveLength(1);
  }, 60_000);

  test('never while the reply streams', async () => {
    const f = await draw(<LinkHost value={hostOf()}><Box dir="column" height={20}><SessionView source={sourceOf([reply({ streaming: true, final: false })])} size="l" onReview={() => undefined} /></Box></LinkHost>, 80, 20);
    expect(f).not.toContain(SITE);
    expect(f).not.toContain('files changed');
  }, 60_000);
});
