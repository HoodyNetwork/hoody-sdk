// Vitest: the Board's Add link carries a program board's key and the program's name,
// `/board?add=terminal-8003&cid=<id>&for=ow:nano&label=Nano`. Both or neither; a key over 64 characters or with a
// control character, a label that is not a clean name, or a key on a port, a new terminal or an opened file refuses
// the whole link (nothing is added). Unmarked links stay as they are.
import { describe, expect, it } from 'vitest';
import { boardAddPath, parseBoardAdd } from './links';

const C = '0123456789abcdef01234567';
const at = { project: { id: 'fedcba9876543210fedcba98' }, container: { id: C, server_name: 'sg-sin-1' } };
const q = (href: string) => Object.fromEntries(new URL(href, 'https://hub.test').searchParams);

describe('a keyed Add link (program board)', () => {
  it('is built with for and label, and read back with them', () => {
    const href = boardAddPath(at, { kind: 'terminal', session: 8003, board: { k: 'ow:nano', label: 'Nano' } });
    expect(href).toBe(`/board?add=terminal-8003&cid=${C}&for=ow%3Anano&label=Nano`);
    expect(parseBoardAdd(q(href))).toEqual({ cid: C, program: 'terminal', session: 8003, board: { k: 'ow:nano', label: 'Nano' } });
    const disp = boardAddPath(at, { kind: 'display', session: 8003, board: { k: 'app:Firefox Web', label: 'Firefox' } });
    expect(parseBoardAdd(q(disp))).toEqual({ cid: C, program: 'display', session: 8003, board: { k: 'app:Firefox Web', label: 'Firefox' } });
  });
  it('an unmarked link keeps today\'s shape', () => {
    expect(boardAddPath(at, { kind: 'terminal', session: 8003 })).toBe(`/board?add=terminal-8003&cid=${C}`);
    expect(parseBoardAdd({ add: 'terminal-8003', cid: C })).toEqual({ cid: C, program: 'terminal', session: 8003 });
  });
  it('link_with_for_without_label_refused: for alone, label alone, a control character, too long, a bad label', () => {
    const base = { add: 'terminal-8003', cid: C };
    expect(parseBoardAdd({ ...base, for: 'ow:nano' })).toBeNull();
    expect(parseBoardAdd({ ...base, label: 'Nano' })).toBeNull();
    expect(parseBoardAdd({ ...base, for: 'ow:\u0007nano', label: 'Nano' })).toBeNull();
    expect(parseBoardAdd({ ...base, for: 'k'.repeat(65), label: 'Nano' })).toBeNull();
    expect(parseBoardAdd({ ...base, for: '', label: 'Nano' })).toBeNull();
    expect(parseBoardAdd({ ...base, for: 'ow:nano', label: '' })).toBeNull();
    expect(parseBoardAdd({ ...base, for: 'ow:nano', label: 'N'.repeat(33) })).toBeNull();
    expect(parseBoardAdd({ ...base, for: 'ow:nano', label: 'Na\nno' })).toBeNull();
    expect(parseBoardAdd({ ...base, for: ['ow:nano'], label: 'Nano' })).toBeNull();
    expect(parseBoardAdd({ ...base, for: 'k'.repeat(64), label: 'Nano' })).not.toBeNull();
  });
  it('never on a port, a new terminal or a link that opens a file', () => {
    expect(parseBoardAdd({ add: 'port-8080', cid: C, for: 'ow:nano', label: 'Nano' })).toBeNull();
    expect(parseBoardAdd({ add: 'terminal-new', cid: C, for: 'ow:nano', label: 'Nano' })).toBeNull();
    expect(parseBoardAdd({ add: 'files-1', cid: C, open: 'folder', at: '/home', for: 'ow:nano', label: 'Nano' })).toBeNull();
    expect(boardAddPath(at, { kind: 'terminal', session: 8003, board: { k: 'ow:\nnano', label: 'Nano' } })).toBe('');
    expect(boardAddPath(at, { kind: 'terminal', session: 8003, board: { k: 'ow:nano', label: '' } })).toBe('');
  });
});
