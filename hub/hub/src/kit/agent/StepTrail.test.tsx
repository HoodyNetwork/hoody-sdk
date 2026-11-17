// Vitest: the step trail of a turn (StepTrail.tsx), read through SessionView as the page draws it. The summary row names how
// many steps and how long, never the running command; a step's row opens only when it cannot show all of its text (cut by its
// two lines, more than one line, or shortened before it got here); a whole command can be copied, a shortened one is named
// as that and cannot; a failure shows in its own row; the agent's own words between steps are prose, not a step.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { can, type Action, type CapFacts } from './capability';
import { SessionView } from './SessionView';
import { stepText } from './StepTrail';
import type { ConvBlock, ConvSnapshot, ConversationSource } from './source';

const facts: CapFacts = {
  mode: 'read', backend: 'native', reach: 'ok', state: 'idle', daemonPaused: false, approval: 'default', firstTurnStarted: true,
  turn: false, gate: 'none', gateBlocked: false, decisionPending: false, queued: false, children: false, shells: false, unsettledSends: 0,
  prereq: { journal: true, recovery: true, attachment: true, approver: 'notNeeded' },
};
type Steps = Extract<ConvBlock, { k: 'steps' }>;
const LONG = '$ for C in 7af14982c9ebf7238ce22c4b 4101556f4d40d9b59e4b6ea2; do echo "== $C =="; hoody -c "$C" files get /home/user -o json 2>&1 | head -60; done';
const rows: Steps['rows'] = [
  { id: 'a', state: 'ok', verb: 'Read file', summary: '/a/one.ts', time: '1 s' },
  { id: 'b', state: 'failed', verb: 'Run', summary: '$ npm test', time: '12 s', note: 'Failed: exit status 1' },
  { id: 'c', state: 'ok', kind: 'note', verb: 'Note', summary: 'Three computers in your realm.' },
  { id: 'd', state: 'running', verb: 'Run', summary: LONG },
];
// The layout fact the row reads (is its text cut by the two lines?): here, any text longer than 60 characters is.
const clip = () => {
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(40);
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function (this: HTMLElement) { return (this.textContent ?? '').length > 60 ? 80 : 40; });
};
const view = (b: Steps) => {
  const s: ConvSnapshot = { facts, title: 'T', gates: [], blocks: [b] };
  const source: ConversationSource = { kind: 'session', ref: { computer: 'atlas.1234', realm: 'global', sid: 's' }, snapshot: () => s, subscribe: () => () => {}, watch: () => {}, can: (a: Action) => can(a, s.facts) };
  return render(<SessionView source={source} size="l" />);
};
const running: Steps = { k: 'steps', key: 't1', label: LONG, count: '4 steps', state: 'running', rows };
const open = () => fireEvent.click(screen.getByRole('button', { name: /^4 steps/ }));
const itemOf = (name: RegExp) => screen.getAllByRole('listitem').find((li) => name.test(li.textContent ?? ''))!;
const rowOf = (name: RegExp) => within(itemOf(name)).getByRole('button');

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('the summary row', () => {
  it('names the count, not the running command; the command is the preview beside it', () => {
    view(running);
    const btn = screen.getByRole('button', { name: '4 steps Running' });
    expect(btn.textContent).not.toContain('hoody');
    // The failed step is previewed before the newest (conversation.layout.test.tsx); its kind and input, outside the button.
    const peek = document.querySelector('[data-trail-peek]') as HTMLElement;
    expect(peek.textContent).toBe('Run$ npm test');
    expect(btn.contains(peek)).toBe(false);
  });
  it('a step still running is previewed by its kind alone: its command is the working bar\'s, not said twice', () => {
    view({ ...running, rows: rows.filter((r) => r.state !== 'failed') });
    expect((document.querySelector('[data-trail-peek]') as HTMLElement).textContent).toBe('Run');
  });
  it('a host that gives no count is read by its label, as before', () => {
    view({ k: 'steps', key: 't1', label: '4 steps · 13 s', state: 'failed', rows });
    expect(screen.getByRole('button', { name: '4 steps · 13 s Failed' })).toBeTruthy();
  });
});

describe('a step row', () => {
  it('whose text fits and is all there is not a button: no chevron, nothing to open', () => {
    clip();
    view(running);
    open();
    const li = itemOf(/one\.ts/);
    expect(within(li).queryByRole('button')).toBeNull();
    expect(li.textContent).toBe('DoneRead file/a/one.ts1 s');
    expect(li.querySelector('svg[class*="stepChevron"]')).toBeNull();
    // A short failed step too: its reason is already whole in the row.
    const failed = itemOf(/npm test/);
    expect(within(failed).queryByRole('button')).toBeNull();
    expect(failed.textContent).toContain('Failed: exit status 1');
    expect(failed.getAttribute('data-step')).toBe('failed');
  });
  it('whose text the two lines cut is one button; a press opens the whole command with Copy, and nothing the row already says', () => {
    clip();
    view(running);
    open();
    const row = rowOf(/for C in/);
    expect(row.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(row);
    expect(row.getAttribute('aria-expanded')).toBe('true');
    const li = row.closest('li')!;
    const detail = li.querySelector('[data-step-detail]') as HTMLElement;
    expect(row.getAttribute('aria-controls')).toBe(detail.id);
    // The command is drawn after the block's own prompt, so the text (what Copy gives) has no "$ ".
    expect(within(detail).getByRole('figure', { name: 'Run: the command' }).querySelector('pre')!.textContent).toBe(LONG.slice(2));
    expect(within(detail).getByRole('button', { name: 'Copy code' })).toBeTruthy();
    // Only the command: no "took", no "still running", no second copy of the row.
    expect(detail.textContent).not.toMatch(/Took|Still running/);
    expect(document.querySelectorAll('[data-step-detail]')).toHaveLength(1);
    fireEvent.click(row);
    expect(row.getAttribute('aria-expanded')).toBe('false');
    expect(li.querySelector('[data-step-detail]')).toBeNull();
  });
  it('a text of several lines opens to them as written; the row shows them on one line', () => {
    view({ k: 'steps', key: 't1', label: '1 step', state: 'ok', rows: [{ id: 'a', state: 'ok', verb: 'Run', summary: '$ cd /srv && make', text: '$ cd /srv &&\nmake' }] });
    fireEvent.click(screen.getByRole('button', { name: /^1 step/ }));
    const row = rowOf(/make/);
    expect(row.textContent).toContain('$ cd /srv && make');
    fireEvent.click(row);
    expect((document.querySelector('[data-step-detail] pre') as HTMLElement).textContent).toBe('cd /srv &&\nmake');
  });
  it('a step that made pictures opens to them; its text, whole in the row, is not drawn a second time', () => {
    clip();
    view({ k: 'steps', key: 't1', label: '1 step', state: 'ok', rows: [{ id: 'a', state: 'ok', verb: 'Make image', summary: 'A blue and white checkout banner', pictures: [{ path: '/tmp/x/banner.png', name: 'banner.png' }] }] });
    fireEvent.click(screen.getByRole('button', { name: /^1 step/ }));
    fireEvent.click(rowOf(/checkout banner/));
    const detail = document.querySelector('[data-step-detail]') as HTMLElement;
    expect(within(detail).getByText('banner.png')).toBeTruthy();
    expect(within(detail).queryByRole('figure')).toBeNull();
    expect(detail.textContent).not.toContain('checkout banner');
  });
  it('a step that made pictures and whose text the row cuts opens to both', () => {
    clip();
    const long = 'A blue and white checkout banner with the shop name, a cart icon and a wide empty band for a sale line';
    view({ k: 'steps', key: 't1', label: '1 step', state: 'ok', rows: [{ id: 'a', state: 'ok', verb: 'Make image', summary: long, pictures: [{ path: '/tmp/x/banner.png', name: 'banner.png' }] }] });
    fireEvent.click(screen.getByRole('button', { name: /^1 step/ }));
    fireEvent.click(rowOf(/checkout banner/));
    const detail = document.querySelector('[data-step-detail]') as HTMLElement;
    expect(within(detail).getByRole('figure').querySelector('pre')!.textContent).toBe(long);
    expect(within(detail).getByText('banner.png')).toBeTruthy();
  });
  it('a shortened command is named as its start and is never offered to copy', () => {
    const cutCmd = '$ ' + 'x'.repeat(500) + '...';
    view({ k: 'steps', key: 't1', label: '1 step', state: 'ok', rows: [{ id: 'a', state: 'ok', verb: 'Run', summary: cutCmd, cut: true }] });
    fireEvent.click(screen.getByRole('button', { name: /^1 step/ }));
    fireEvent.click(rowOf(/xxx/));
    const detail = document.querySelector('[data-step-detail]') as HTMLElement;
    expect(within(detail).getByRole('figure', { name: 'Run: the start of the command' })).toBeTruthy();
    expect(within(detail).queryByRole('button')).toBeNull();
    expect(within(detail).getByText("Only the start of this command was recorded, so it can't be copied from here.")).toBeTruthy();
  });
  it('what a write or a search worked on is never called its input or a command', () => {
    clip();
    const sum = '/home/ada/projects/shop/src/components/checkout/CartTotalSummary.tsx (2048 chars)';
    view({ k: 'steps', key: 't1', label: '1 step', state: 'ok', rows: [{ id: 'a', state: 'ok', verb: 'Write file', summary: sum }] });
    fireEvent.click(screen.getByRole('button', { name: /^1 step/ }));
    fireEvent.click(rowOf(/CartTotal/));
    const fig = within(document.querySelector('[data-step-detail]') as HTMLElement).getByRole('figure');
    expect(fig.getAttribute('aria-label') ?? fig.textContent).toMatch(/what it worked on/);
    expect(fig.querySelector('pre')!.textContent).toBe(sum);
  });
  it('a background command reads as a command, with "In the background" said beside it, not "[bg]"', () => {
    view({ k: 'steps', key: 't1', label: '1 step', state: 'ok', rows: [{ id: 'a', state: 'ok', verb: 'Run', summary: '[bg] $ npm run dev' }] });
    expect((document.querySelector('[data-trail-peek]') as HTMLElement).textContent).toBe('Run$ npm run dev');
    fireEvent.click(screen.getByRole('button', { name: /^1 step/ }));
    const li = screen.getByRole('listitem');
    expect(li.textContent).toBe('DoneRun$ npm run devIn the background');
    expect(stepText('[bg] $ npm run dev')).toEqual({ text: 'npm run dev', command: true, background: true });
    expect(stepText('/a/b.ts')).toEqual({ text: '/a/b.ts', command: false, background: false });
  });
  it('a step with no text is a plain row', () => {
    view({ k: 'steps', key: 't1', label: '1 step', state: 'ok', rows: [{ id: 'a', state: 'ok', verb: 'Think' }] });
    fireEvent.click(screen.getByRole('button', { name: /^1 step/ }));
    expect(within(screen.getByRole('listitem')).queryByRole('button')).toBeNull();
    expect(screen.getByRole('listitem').textContent).toBe('DoneThink');
  });
});

describe('the agent\'s own words between steps', () => {
  it('are a line of prose: no outcome mark, no kind, not a button, and never the closed trail\'s preview', () => {
    view({ ...running, state: 'ok', rows: [rows[0]!, rows[2]!] });
    expect((document.querySelector('[data-trail-peek]') as HTMLElement).textContent).toBe('Read file/a/one.ts');
    open();
    const note = itemOf(/Three computers/);
    expect(note.getAttribute('data-step')).toBe('note');
    expect(note.textContent).toBe('Three computers in your realm.');
    expect(within(note).queryByRole('button')).toBeNull();
  });
});

describe('the rows share one grid', () => {
  const sheet = readFileSync(join(__dirname, 'StepTrail.module.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const body = (sel: string) => [...sheet.matchAll(/([^{}]*)\{([^{}]*)\}/g)].find((m) => (m[1] ?? '').trim() === sel)?.[2] ?? '';
  it('five columns set once on the list (mark, kind, input, time, chevron); a row and its button take them as a subgrid', () => {
    expect(body('.steps')).toMatch(/grid-template-columns:\s*var\(--sp-4\) fit-content\([^;]+\) minmax\(0, 1fr\) max-content var\(--sp-4\)/);
    expect(body('.step')).toMatch(/grid-template-columns:\s*subgrid/);
    expect(body('.stepRow')).toMatch(/grid-template-columns:\s*subgrid/);
  });
  it('a note is in the text face (the sheet sets no mono face on it), under the input column', () => {
    expect(body('.note')).toMatch(/grid-column:\s*2 \/ -1/);
    expect(body('.note')).not.toMatch(/font-family/);
    expect(body('.note')).toMatch(/font:\s*var\(--t-small\)/);
  });
  it('a long input is cut to two lines in the row; times end on one edge in tabular figures', () => {
    expect(body('.stepSum')).toMatch(/line-clamp:\s*2/);
    expect(body('.stepTime')).toMatch(/text-align:\s*end/);
    expect(body('.stepTime')).toMatch(/tabular-nums/);
  });
  it('the closed summary row has no start rule; the open list has it', () => {
    expect(body('.trail')).not.toMatch(/border/);
    expect(body('.trailHead')).not.toMatch(/border/);
    expect(body('.steps')).toMatch(/border-inline-start:\s*var\(--bw\) solid var\(--hx-line-strong\)/);
  });
  it('the row is at least the list row height, and the touch height on a coarse pointer', () => {
    expect(body('.stepRow')).toMatch(/min-height:\s*var\(--option-row-h\)/);
    expect(sheet).toMatch(/@media \(pointer: coarse\)\s*\{\s*\.stepRow\s*\{\s*min-height:\s*var\(--touch-min\)/);
  });
});
