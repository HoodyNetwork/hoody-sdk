// Vitest: Put on Board for a chat's marked link (the kit's LinkHost.boardAdd) is the Board's own Add link,
// for the chat's own computer only: a program session, or a web port at `/` (the link's path is not carried). Another
// computer or project, a session number that is not one, and a program the Board does not keep give '' (no item).
import { describe, expect, it } from 'vitest';
import { linkBoardAddPath } from './links';

const C = '0123456789abcdef01234567';
const P = 'fedcba9876543210fedcba98';
const chat = { id: C, project: P, server: 'sg-sin-1' };
const at = (family: 'program' | 'port', name: string, n: string, computer = C, project = P) => ({ computer, project, family, name, n });

describe('linkBoardAddPath', () => {
  it('a program session and a web port of the chat computer are its Add links', () => {
    expect(linkBoardAddPath(chat, at('program', 'terminal', '3'))).toBe(`/board?add=terminal-3&cid=${C}`);
    expect(linkBoardAddPath(chat, at('port', 'http', '3000'))).toBe(`/board?add=port-3000&cid=${C}`);
  });
  it('another computer, another project, a bad number or a program the Board does not keep give none', () => {
    expect(linkBoardAddPath(chat, at('program', 'terminal', '3', 'b'.repeat(24)))).toBe('');
    expect(linkBoardAddPath(chat, at('program', 'terminal', '3', C, 'c'.repeat(24)))).toBe('');
    expect(linkBoardAddPath(chat, at('program', 'terminal', 'x'))).toBe('');
    expect(linkBoardAddPath(chat, at('program', 'nothing', '1'))).toBe('');
  });
});
