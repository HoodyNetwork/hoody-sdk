// Vitest: show_on_marked_row_uses_program_board. Show and Put on Board of a marked launch
// (Open with, Run, Terminal here, Launch an app here) build the program board's keyed link (for + label), never the
// active board's; an unmarked launch keeps today's link. An ended Files launch shows its terminal; a leftover never.
import { describe, expect, it } from 'vitest';
import { boardLabel, boardOffer, programBoard } from './parts/board';
import { parseBoardAdd } from '../board/links';
import type { StoredRow } from './parts/recent';

const CID = 'b'.repeat(24);
const target = { project: { id: 'a'.repeat(24) }, container: { id: CID, server_name: 'n1' } };
const SUB = 'c'.repeat(32);
const run = (o: Partial<StoredRow> = {}): StoredRow => ({
  computer: { project: 'a'.repeat(24), computer_id: CID }, terminal_id: 8003, incarnation: 'i', command_id: 1, launch_tag: 't', display: 8003, name: 'x', opens_in: 'terminal', started_at: 1, ...o,
});
const q = (to: string) => Object.fromEntries(new URL(to, 'https://h').searchParams);

describe('programBoard', () => {
  it('keys a template, a command, Run and Terminal here by their program word, named by the program', () => {
    expect(programBoard({ name: 'Nano · a b.txt', p: 'tpl', candidate: `other:ow-nano-${SUB}` })).toEqual({ k: 'ow:nano', label: 'Nano' });
    expect(programBoard({ name: 'Command · a b.txt', p: 'cmd', candidate: `other:ow-cmd-${SUB}` })).toEqual({ k: 'ow:cmd', label: 'Command' });
    expect(programBoard({ name: 'Run · run.sh', p: 'run', candidate: `other:ow-run-${SUB}` })).toEqual({ k: 'ow:run', label: 'Run' });
    expect(programBoard({ name: 'Terminal · src', p: 'here', candidate: `other:ow-here-${SUB}` })).toEqual({ k: 'ow:here', label: 'Terminal' });
  });
  it('keys Launch an app here by the app name its row stores', () => {
    expect(programBoard({ name: 'Htop', p: 'apphere', app: 'htop' })).toEqual({ k: 'app:htop', label: 'Htop' });
    expect(programBoard({ name: 'Long', p: 'apphere', app: 'é'.repeat(100) })?.k).toHaveLength(64);
  });
  it('app_board_key_and_label_fit_the_board: two long names sharing a start get two keys; every key and name is one the Board accepts', () => {
    const a = programBoard({ name: 'A', p: 'apphere', app: 'x'.repeat(70) + 'one' })!;
    const b = programBoard({ name: 'B', p: 'apphere', app: 'x'.repeat(70) + 'two' })!;
    expect(a.k).not.toBe(b.k);
    // Astral characters count two units each; a control character never reaches a key.
    const astral = programBoard({ name: '😀'.repeat(40), p: 'apphere', app: '😀'.repeat(40) })!;
    const ctl = programBoard({ name: 'tab\there', p: 'apphere', app: 'tab\there' })!;
    const long = programBoard({ name: 'My very long notebook server name for the team', p: 'apphere', app: 'jupyterlab' })!;
    for (const k of [a, b, astral, ctl, long]) {
      // The Board takes the key and the name as they are (a key it refuses, or a name it would clean, reads as null).
      expect(parseBoardAdd({ add: 'terminal-1', cid: CID, for: k.k, label: k.label }), k.k).toEqual({ cid: CID, program: 'terminal', session: 1, board: { k: k.k, label: k.label } });
      expect(k.k.length).toBeLessThanOrEqual(64);
      expect(k.label.length).toBeLessThanOrEqual(32);
    }
    expect(ctl.k).not.toBe('app:tab\there');
    expect(long.label).toBe('My very long notebook server na…');
    expect(astral.label.endsWith('…')).toBe(true);
  });
  it('boardLabel: spaces and controls made one space, 32 units at most, null when nothing is left', () => {
    expect(boardLabel('  Nano  ')).toBe('Nano');
    expect(boardLabel('a\u2028b')).toBe('a b');
    expect(boardLabel('\u0000 ')).toBeNull();
    expect(boardLabel('x'.repeat(40))).toBe('x'.repeat(31) + '…');
  });
  it('undefined for an unmarked row; null for a marked row whose program cannot be told', () => {
    expect(programBoard({ name: 'Htop' })).toBeUndefined();
    expect(programBoard({ name: 'Nano · a', p: 'tpl', candidate: 'other:htop' })).toBeNull();
    expect(programBoard({ name: 'Nano · a', p: 'tpl' })).toBeNull();
  });
});

describe('boardOffer', () => {
  it('a marked running launch: the keyed link of its program board at its place', () => {
    const o = boardOffer({ state: 'running', opensIn: 'terminal', name: 'Nano · a b.txt', p: 'tpl', candidate: `other:ow-nano-${SUB}` }, run(), target, false);
    expect(o && 'to' in o ? q(o.to) : o).toEqual({ add: 'terminal-8003', cid: CID, for: 'ow:nano', label: 'Nano' });
    const s = boardOffer({ state: 'ready', opensIn: 'screen', name: 'Mousepad · a.txt', p: 'tpl', candidate: `other:ow-mousepad-${SUB}` }, run({ display: 8004 }), target, false);
    expect(s && 'to' in s ? q(s.to) : s).toEqual({ add: 'display-8004', cid: CID, for: 'ow:mousepad', label: 'Mousepad' });
  });
  it('an unmarked launch keeps today\'s link (the active board)', () => {
    const o = boardOffer({ state: 'running', opensIn: 'terminal', name: 'Htop' }, run(), target, false);
    expect(o && 'to' in o ? q(o.to) : o).toEqual({ add: 'terminal-8003', cid: CID });
  });
  it('a marked launch whose program cannot be told offers nothing, never the active board', () => {
    expect(boardOffer({ state: 'running', opensIn: 'terminal', name: 'Nano · a', p: 'tpl', candidate: 'nope' }, run(), target, false)).toBeNull();
  });
  it('an ended Files launch shows its terminal; an ended plain one, a leftover or a stop offer nothing', () => {
    const ended = boardOffer({ state: 'exited', opensIn: 'terminal', name: 'Nano · a', p: 'tpl', candidate: `other:ow-nano-${SUB}` }, run(), target, false);
    expect(ended && 'to' in ended ? q(ended.to) : ended).toEqual({ add: 'terminal-8003', cid: CID, for: 'ow:nano', label: 'Nano' });
    const screenEnded = boardOffer({ state: 'exited', opensIn: 'screen', name: 'Firefox · a', p: 'tpl', candidate: `other:ow-firefox-${SUB}` }, run(), target, false);
    expect(screenEnded && 'to' in screenEnded ? q(screenEnded.to).add : screenEnded).toBe('terminal-8003');
    expect(boardOffer({ state: 'exited', opensIn: 'terminal', name: 'Htop' }, run(), target, false)).toBeNull();
    expect(boardOffer({ state: 'exited', opensIn: 'terminal', name: 'Nano · a', p: 'tpl', candidate: `other:ow-nano-${SUB}` }, run({ left: true }), target, false)).toBeNull();
    expect(boardOffer({ state: 'not_started', code: 'terminal_left', opensIn: 'terminal', name: 'Nano · a', p: 'tpl', candidate: `other:ow-nano-${SUB}` }, run(), target, false)).toBeNull();
    expect(boardOffer({ state: 'stopped', opensIn: 'terminal', name: 'Nano · a', p: 'tpl', candidate: `other:ow-nano-${SUB}` }, run(), target, false)).toBeNull();
  });
  it('Launch an app here: its app board', () => {
    const o = boardOffer({ state: 'running', opensIn: 'terminal', name: 'Htop', app: 'htop', p: 'apphere' }, run(), target, false);
    expect(o && 'to' in o ? q(o.to) : o).toEqual({ add: 'terminal-8003', cid: CID, for: 'app:htop', label: 'Htop' });
  });
});
