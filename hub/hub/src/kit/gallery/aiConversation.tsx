// The AI tab's conversation frame on fixtures (`/_kit?layout=ai-conversation`): the geometry spec (kit/agent/
// geometry.spec.ts) needs a real browser to prove that, at every width and with Details open on each tab, the decision
// buttons, Stop and Resume are on screen and the topmost element at their centre. Query: `details=0|1`, `tab=activity|edits|usage`,
// `gates=0..3` (waiting approvals), `paused=0|1`, `turns=n` (transcript length), `edits=n` (files under Edits), `usage=0|1`,
// `links=1` (a last reply with marked links, read against a fixed LinkHost: atlas running, gamma off, one computer not listed),
// `asked=1` (the chat opens with an Ask the Agent message: its one-line request, "Context sent" folded, and a Markdown answer),
// `steps=n` (every reply is a finished one with its time, the turns are recent, and the last turn has a step list of n rows before its reply).
// `pics=1` (the chat opens with a message that carries stored pictures and the step list ends with a step that made two, all read from a fixed
// StepPictureHost: one loads, the others cannot be read).
// The header status (running, needs, paused) follows `paused` and `gates`; it is not a parameter.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { buildPortUrl } from '@core';
import { PauseBand } from '../agent/Pause';
import { createPauseStore } from '../agent/pause';
import { Composer } from '../agent/Composer';
import { ConversationView } from '../agent/ConversationView';
import { ChatLinkHost, LinkHost, type LinkHostValue } from '../agent/linkHost';
import { StepPictureHost, type StepPictureReader } from '../agent/StepPictures';
import { can, type Action, type CapFacts } from '../agent/capability';
import type { ActiveSource, ConvBlock, ConvSnapshot, GateEntry, StepView } from '../agent/source';
import type { DetailsTab } from '../agent/DetailsPanel';
import { UsageTab, type UsageTurn } from '../agent/Usage';
import { createUsageStore } from '../agent/useUsage';
import { Button } from '../controls/Button';
import { agentStartText } from '../ask';
import { useSearchParam } from '../nav';
import { useStrings } from '../strings';
import strings from './aiConversation.strings.en.json';

const FACTS: CapFacts = {
  mode: 'active', backend: 'native', reach: 'ok', state: 'running', daemonPaused: false, approval: 'default', firstTurnStarted: true,
  turn: true, gate: 'confirm', gateBlocked: false, decisionPending: false, queued: false, children: false, shells: false, unsettledSends: 0,
  prereq: { journal: true, recovery: true, attachment: true, approver: 'notNeeded' },
};
const gateAt = (n: number): GateEntry => ({
  key: `g${n}`, ref: { id: `g${n}`, generation: 1 },
  gate: { kind: 'confirm', risk: 'exec', tool: 'bash', params: { command: `git push origin feature/cart-${n}` }, offerSession: true },
  helper: false, addressing: false, held: null, decision: null,
});
const blocksOf = (n: number, done = false, t0 = 1000): ConvBlock[] => Array.from({ length: n }, (_, i): ConvBlock => (
  i % 2 === 0 ? { k: 'user', key: `u${i}`, text: `Please keep going with step ${i + 1} of the checkout fix.`, at: t0 + i }
    : { k: 'reply', key: `r${i}`, text: `Step ${i} done: the cart total now rounds half up and the tests for it pass.`, at: t0 + i, ...(done ? { streaming: false, final: true, cost: null } : {}) } as ConvBlock
));
/** The `steps=n` list: commands, a note, a file read and one failed row, as a long turn shows them. Sample commands: not translated. */
const stepRowsOf = (n: number): StepView[] => Array.from({ length: n }, (_, i) => (
    i % 7 === 3 ? { id: `s${i}`, state: 'ok' as const, kind: 'note' as const, verb: 'Note', summary: `part-${i}.ts rounds the cart total twice; the second time it truncates.` }
      : i % 7 === 5 ? { id: `s${i}`, state: 'ok' as const, verb: 'Read file', summary: `/home/ada/projects/shop/src/checkout/cart/part-${i}.ts`, time: '1 s' }
        : i % 11 === 9 ? { id: `s${i}`, state: 'failed' as const, verb: 'Run', summary: `$ npm test -- --run src/checkout/cart/part-${i}.test.ts`, time: '8 s', note: 'This step failed: 2 tests failed' }
          : { id: `s${i}`, state: 'ok' as const, verb: 'Run', summary: `$ rg -n roundHalfUp src/checkout/cart/part-${i}.ts && npm run lint -- --max-warnings 0 src/checkout`, time: '2 s' }
));
/** The label counts steps only: the agent's own words between them (kind `note`) are not steps. */
const stepsOf = (n: number): ConvBlock => {
  const rows = stepRowsOf(n);
  return { k: 'steps', key: 'steps', label: `${rows.filter((r) => r.kind !== 'note').length} steps`, state: 'ok', rows };
};
/** A small picture (PNG, 96 x 64) for the `pics=1` step: what the host's reader answers for the first path; the second cannot be read. */
const PIC_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAGAAAABACAIAAABqVuVZAAAAhklEQVR42u3asQ0AIAwDsH7EabzLCUysrDzRAUWWckDqMWqNuVqyz23Jb30KECBAgAABAgQIECBAgAABAgQoDCj1sK4+gAABAgQIECBAgAABAgQIECBAaUAGM4siIECAAAECBAgQIECAAAECBMh/kMHMoggIECBAgAABAgQIECBAgAABigV6begm/styGvQAAAAASUVORK5CYII=';
const PIC_DIR = '/home/ada/.hoody/generated-images';
const PIC_ID = '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08';
/** The `pics=1` message: a reopened chat's message with three pictures: one the agent still has, one it no longer has, one it cannot serve. */
const picsUser = (text: string): ConvBlock => ({ k: 'user', key: 'upics', text, at: 999, files: [
  { id: 'upics:pic0', kind: 'image', name: 'banner-draft.png', stored: PIC_ID },
  { id: 'upics:pic1', kind: 'image', name: 'old-banner.png', stored: 'a'.repeat(64) },
  { id: 'upics:pic2', kind: 'image', name: 'logo.png', gone: true },
] });
const PIC_READER: StepPictureReader = {
  read: async (path) => (path.endsWith('-01.png') ? Uint8Array.from(atob(PIC_PNG), (c) => c.charCodeAt(0)) : null),
  stored: async (id) => { if (id !== PIC_ID) throw new Error('gone'); return Uint8Array.from(atob(PIC_PNG), (c) => c.charCodeAt(0)); },
};
/** The `pics=1` row: a step that made two pictures. */
const picsStep = (summary: string) => ({ id: 'spics', state: 'ok' as const, verb: 'Make image', summary, time: '9 s', pictures: [
  { path: `${PIC_DIR}/img-20261116-banner-01.png`, name: 'img-20261116-banner-01.png', size: 191 },
  { path: `${PIC_DIR}/img-20261116-banner-02.png`, name: 'img-20261116-banner-02.png' },
] });
/** The transcript with the step list before the last reply. */
const withSteps = (blocks: ConvBlock[], n: number, pics: string | null = null): ConvBlock[] => {
  const last = blocks.map((b) => b.k).lastIndexOf('reply');
  if (n === 0 || last < 0) return blocks;
  const list = stepsOf(n);
  return [...blocks.slice(0, last), pics !== null && list.k === 'steps' ? { ...list, rows: [...list.rows, picsStep(pics)] } : list, ...blocks.slice(last)];
};
/** The `asked=1` turn: what an Ask the Agent action sends (kit/ask agentStartText: title, instructions, labelled context) and
 *  the short Markdown list its instructions ask for. Sample text for the Agent, as a page writes it: not translated. */
const askedTurn = (title: string, reply: string): ConvBlock[] => [
  {
    k: 'user', key: 'ask-u', at: 900,
    text: agentStartText(
      'Answer as a short Markdown list: one bullet per computer, its name in bold, then who can open its programs. Then one line "**Risks**" and at most three bullets.\nAnswer only from the snapshot in the Context below.',
      'Access rules of the computers in this realm (who can open their programs through their web addresses).\nComputer "atlas": Anyone with the address; project rules: no\n  groups: none\nComputer "borealis": Only my IP; project rules: yes\n  groups: none',
      { title, contextLabel: 'access rules of 2 computers' },
    ) ?? '',
  },
  { k: 'reply', key: 'ask-r', at: 950, streaming: false, final: true, cost: null, text: reply },
];
const LP = '0a0a0a0a0a0a0a0a0a0a0a0a';
const ATLAS = '0b0b0b0b0b0b0b0b0b0b0b0b';
const GAMMA = '0c0c0c0c0c0c0c0c0c0c0c0c';
const at = (c: string, protocol: string, n: number | string): string => buildPortUrl({ id: LP }, { id: c, server_name: 'sg1' }, protocol, n);
/** The `links=1` reply: a bare program and port, a labelled link, inline code, a script, a stopped computer, one not listed, a
 *  local address (read on atlas, the computer the chat runs on), and two Linux paths, one in prose and one as inline code
 *  with its :line:col. */
const linksReply = (): ConvBlock => ({
  k: 'reply', key: 'links', at: 9000,
  text: [
    `The shop runs at ${at(ATLAS, 'http', 3000)}/orders and its logs are in ${at(ATLAS, 'terminal', 3)}.`,
    '',
    `I left [the checkout notes](${at(ATLAS, 'notes', 1)}) and the build script \`${at(ATLAS, 'exec', 1)}/build/run\`.`,
    '',
    `The old copy on ${at(GAMMA, 'terminal', 1)} is off; the review box is ${at('0d0d0d0d0d0d0d0d0d0d0d0d', 'http', 8080)}.`,
    '',
    'The dev server prints http://localhost:5173/admin when it starts.',
    '',
    'Its config is /etc/nginx/sites-enabled/shop.conf and the failing line is `/srv/shop/src/checkout/payment.ts:42:7`.',
  ].join('\n'),
} as ConvBlock);
const LINK_HOST: LinkHostValue = {
  realm: 'global',
  lives: { id: ATLAS, project: LP, name: 'atlas' },
  runs: { id: ATLAS, project: LP, name: 'atlas' },
  computers: { rows: [{ id: ATLAS, project_id: LP, name: 'atlas', status: 'running', server_name: 'sg1' }, { id: GAMMA, project_id: LP, name: 'gamma', status: 'stopped', server_name: 'sg1' }], complete: true, failed: false },
  openHub: () => undefined,
  ask: () => undefined,
};
const noHub = (): void => undefined;
function Host({ links, children }: { links: boolean; children: ReactNode }) {
  return links ? <LinkHost value={LINK_HOST}>{children}</LinkHost> : <ChatLinkHost value={{ chat: null, realm: 'global', openHub: noHub }}>{children}</ChatLinkHost>;
}
const num = (v: string | undefined, d: number, max: number): number => { const n = Number(v); return Number.isInteger(n) && n >= 0 ? Math.min(n, max) : d; };

const row = (id: number, turn: string, input: number, output: number, cacheRead: number, cost: number) => ({
  id, ts: 1_700_000_000 + id, turn_id: turn, attempt: -1, model: 'hoody-free', provider: 'hoody-ai', input_tokens: input, output_tokens: output,
  cache_read_tokens: cacheRead, cache_write_tokens: 0, cost_usd: cost, latency_ms: 900, success: true,
});
const USAGE_BODY = {
  items: [row(1, 'req-1', 1200, 340, 800, 0.0042), row(2, 'req-2', 2400, 610, 2000, 0.0081)],
  totals: { calls: 2, input_tokens: 3600, output_tokens: 950, cache_read_tokens: 2800, cache_write_tokens: 0, cost_usd: 0.0123, cache_read_pct: 77.8 },
  next_after_id: 2, has_more: false,
};

export function GalleryAiConversation() {
  const t = useStrings(strings);
  const [details0] = useSearchParam('details');
  const [tab0] = useSearchParam('tab');
  const [gates0] = useSearchParam('gates');
  const [paused0] = useSearchParam('paused');
  const [turns0] = useSearchParam('turns');
  const [edits0] = useSearchParam('edits');
  const [usage0] = useSearchParam('usage');
  const [links0] = useSearchParam('links');
  const [asked0] = useSearchParam('asked');
  const [steps0] = useSearchParam('steps');
  const [pics0] = useSearchParam('pics');
  // shot=1: the composer offers "Screenshot of a display" for atlas; shot=full: the message has its images; shot=none: the
  // chat's computer is not known here.
  const [shot0] = useSearchParam('shot');
  const [open, setOpen] = useState(details0 === '1');
  const [tab, setTab] = useState<DetailsTab>(tab0 === 'edits' || tab0 === 'usage' ? tab0 : 'activity');
  const [gates, setGates] = useState(num(gates0, 1, 3));
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const paused = paused0 === '1';
  const links = links0 === '1';
  const asked = asked0 === '1';
  const pics = pics0 === '1';
  const turns = num(turns0, 14, 60);
  const edits = num(edits0, 2, 200);
  const steps = steps0 ? num(steps0, 0, 80) : null;
  // With `steps`, the turns are recent (the running one began 95 s before the page opened), so the working bar counts its time.
  const [started] = useState(() => Date.now() - 95_000);
  // Usage, mounted the way the host does it: one store per chat (the agent's rows, here canned), the turns from the stream.
  const usage = usage0 === '1';
  const usageStore = useMemo(() => createUsageStore({ api: { session: async () => ({ ok: true, body: USAGE_BODY }) as never }, id: 's1' }), []);
  useEffect(() => { if (usage) void usageStore.load(); return () => usageStore.reset(); }, [usage, usageStore]);
  const usageTurns = useMemo<UsageTurn[]>(() => [
    { key: 'u0', label: t('turn1'), responses: [{ input: 1200, output: 340, cacheRead: 800, cacheWrite: 0 }] },
    { key: 'u2', label: t('turn2'), responses: [{ input: 2400, output: 610, cacheRead: 2000, cacheWrite: 0 }] },
  ], [t]);
  const store = useMemo(() => createPauseStore({
    pollMs: 3600000,
    api: {
      get: async () => ({ ok: true, body: { paused, since_ms: 1000, gen: 1 } }) as never,
      set: async (p: boolean) => ({ ok: true, body: { paused: p, since_ms: 2000, gen: 2 } }) as never,
    },
  }), [paused]);
  const snap = useMemo<ConvSnapshot>(() => ({
    facts: FACTS,
    title: t('title'),
    blocks: [...(asked ? askedTurn(t('askTitle'), t('askReply')) : []), ...(pics ? [picsUser(t('picsMessage'))] : []), ...(steps === null ? blocksOf(turns) : withSteps(blocksOf(turns, true, started), steps, pics ? t('picsSummary') : null)), ...(links ? [linksReply()] : [])],
    gates: Array.from({ length: gates }, (_, i) => gateAt(i + 1)),
    meta: { computer: 'atlas', realm: 'Work', folder: '~/projects/shop', agent: 'General', model: 'Hoody Free', status: paused ? 'paused' : gates > 0 ? 'needs' : 'running' },
    edits: Array.from({ length: edits }, (_, i) => ({ id: `e${i}`, path: `src/checkout/cart/part-${i}.ts`, verb: i % 3 === 0 ? 'created' as const : 'edited' as const, meta: '+12 -3' })),
  }), [gates, paused, turns, edits, links, asked, steps, started, pics, t]);
  const source = useMemo<ActiveSource>(() => {
    return {
      kind: 'session', ref: { computer: 'atlas.1234', realm: 'global', sid: 's1' },
      snapshot: () => snap, subscribe: () => () => {}, watch: () => {}, can: (a: Action) => can(a, FACTS),
      send: async () => ({ k: 'done' }), stop: async () => ({ k: 'done' }), decide: async () => ({ k: 'done' }), answer: async () => ({ k: 'done' }),
      check: async () => ({ k: 'done' }), dismissDecision: () => {}, canDismiss: () => false,
    };
  }, [snap]);
  return (
    <div>
      <div style={{ marginBottom: 8 }}><Button variant="secondary" size="sm" onPress={() => setGates((n) => Math.min(n + 1, 3))}>{t('addGate')}</Button></div>
      <div style={{ height: 'calc(100dvh - 220px)', minHeight: 480 }}>
      {/* links=1: a fixed host (the list as a fixture); otherwise the hosts' own ChatLinkHost, which reads nothing while no reply shows a link on a computer. */}
      <Host links={links}>
      <StepPictureHost value={pics ? PIC_READER : null}>
      <ConversationView
        source={source}
        pane={<nav aria-label={t('pane')}><p>{t('paneItem')}</p></nav>}
        detailsOpen={open}
        onDetails={setOpen}
        onBack={() => {}}
        usage={usage ? <UsageTab store={usageStore} turns={usageTurns} /> : undefined}
        tab={tab}
        onTab={setTab}
        top={<PauseBand store={store} computer="atlas" />}
        composer={(
          <Composer
            draft={draft} setDraft={setDraft} inputRef={inputRef} placeholder={t('placeholder')} max={20000} canSend={draft.trim().length > 0} onSend={() => setDraft('')}
            notes={[]} attachments={[]} onAddFiles={() => {}} onRemoveAttachment={() => {}} stop={{ busy: false, onPress: () => {} }} flash={false} onTyping={() => {}}
            screenshot={shot0 ? { chat: 's1', target: shot0 === 'none' ? null : { project: { id: LP }, container: { id: ATLAS, server_name: 'sg1' } }, computer: 'atlas', room: shot0 === 'full' ? 0 : 4, max: 4 } : null}
          />
        )}
      />
      </StepPictureHost>
      </Host>
      </div>
    </div>
  );
}
