// Vitest: on a wide screen the composer is as wide as the thread, centred under it, not the whole main area. The composer
// sits in a lane capped like the thread's column (--conv-col plus the side inset --conv-inset on each side); the lane's side
// padding and the composer's own add up to that inset, so the box lines up with the transcript's text at every size;
// --conv-col and --conv-inset take the same values per size as SessionView's column.
import { cleanup, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { can, type Action, type CapFacts } from './capability';
import { ConversationView } from './ConversationView';
import type { ActiveSource, ConvSnapshot } from './source';

const facts: CapFacts = {
  mode: 'active', backend: 'native', reach: 'ok', state: 'running', daemonPaused: false, approval: 'default', firstTurnStarted: true,
  turn: true, gate: 'confirm', gateBlocked: false, decisionPending: false, queued: false, children: false, shells: false, unsettledSends: 0,
  prereq: { journal: true, recovery: true, attachment: true, approver: 'notNeeded' },
};
const snap: ConvSnapshot = { facts, title: 'Fix it', blocks: [], gates: [], meta: { computer: 'atlas', realm: 'Work', status: 'running' } };
const src: ActiveSource = {
  kind: 'session', ref: { computer: 'atlas.1234', realm: 'global', sid: 's' }, snapshot: () => snap, subscribe: () => () => {}, watch: () => {}, can: (a: Action) => can(a, facts),
  send: async () => ({ k: 'done' }), stop: async () => ({ k: 'done' }), decide: async () => ({ k: 'done' }), answer: async () => ({ k: 'done' }), check: async () => ({ k: 'done' }), dismissDecision: () => {}, canDismiss: () => false,
};

beforeEach(() => { vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} }); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const read = (f: string) => readFileSync(join(__dirname, f), 'utf8');
const rule = (css: string, sel: string) => {
  const at = css.indexOf(`${sel} {`);
  return at < 0 ? '' : css.slice(at, css.indexOf('}', at));
};
// SessionView quotes the attribute value; ConversationView (a pure kit module, kitpure C0) does not. Every size is read, so a
// width or an inset set for one size in one file and not the other fails.
const SIZES = ['xs', 's', 'm', 'l', 'xl', 'xxl'] as const;
const colSizes = (css: string) => Object.fromEntries([
  ['base', /\.root\s*\{[^}]*--conv-col:\s*([^;]+);/.exec(css)?.[1]],
  ['baseInset', /\.root\s*\{[^}]*--conv-inset:\s*([^;]+);/.exec(css)?.[1]],
  ...SIZES.flatMap((z) => [
    [z, new RegExp(`\\.root\\[data-size='?${z}'?\\]\\s*\\{[^}]*--conv-col:\\s*([^;]+);`).exec(css)?.[1]],
    [`${z}Inset`, new RegExp(`\\.root\\[data-size='?${z}'?\\]\\s*\\{[^}]*--conv-inset:\\s*([^;]+);`).exec(css)?.[1]],
  ]),
]);

describe('ConversationView: the composer lane', () => {
  it('draws the composer inside the lane', () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1600);
    render(<ConversationView source={src} pane={null} detailsOpen={false} onDetails={() => {}} composer={<p>the composer</p>} />);
    expect(screen.getByText('the composer').closest('[data-composer-lane]')).not.toBeNull();
  });

  it('the lane is capped as the thread column and centred; its padding and the composer\'s add up to the column inset', () => {
    const lane = rule(read('ConversationView.module.css'), '.composerLane');
    expect(lane).toMatch(/max-width:\s*calc\(var\(--conv-col\) \+ 2 \* var\(--conv-inset\)\)/);
    expect(lane).toMatch(/margin-inline:\s*auto/);
    expect(lane).toMatch(/width:\s*100%/);
    expect(lane).toMatch(/padding-inline:\s*calc\(var\(--conv-inset\) - var\(--sp-3\)\)/);
    // The composer's side padding is the one the lane takes off.
    expect(rule(read('Conversation.module.css'), '.composerWrap')).toMatch(/padding:\s*0 var\(--sp-3\)/);
    // SessionView's thread: the same cap, centred in a log whose side padding is the same inset.
    const sv = read('SessionView.module.css');
    expect(rule(sv, '.thread')).toMatch(/max-width:\s*var\(--conv-col\)/);
    expect(rule(sv, '.thread')).toMatch(/margin-inline:\s*max\(\s*calc\(\(100% - min\(var\(--conv-col\), 100cqi - 2 \* var\(--conv-inset\)\)\) \/ 2\)/);
    expect(rule(sv, '.column')).toMatch(/padding:\s*var\(--sp-6\) var\(--conv-inset\)/);
  });

  it('the column width and inset per size are the same as SessionView\'s', () => {
    const mine = colSizes(read('ConversationView.module.css'));
    expect(mine.base).toBeTruthy();
    expect(mine.baseInset).toBeTruthy();
    expect(mine).toEqual(colSizes(read('SessionView.module.css')));
  });
});
