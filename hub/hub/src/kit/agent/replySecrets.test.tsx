// Vitest: what a reply shows hidden stays hidden everywhere it goes. The reply's Copy writes the text with its keys hidden, as the Prose
// draws it (a percent-encoded key too); inline code holding an address with a user name or password shows it without them, as a bare
// link does, and so does one the reader refuses for a key in it; a step's summary (the dock's trail rows) hides a key before it is
// cleaned.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { stepModel } from './code';
import { parseMd, type Inline } from './md';
import { Prose, ReplyBox, ReplyFooter } from './Reply';

const KEY = 'sk-live0123456789abcdef';
// Built here, never written whole: the key above percent-encoded, which a scrub of the written text does not find.
const ENC = 'sk%2D' + 'live0123456789abcdef';
const read = (t: string): string => t.replace(/[\p{Default_Ignorable_Code_Point}\p{Cc}]/gu, '');

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('a reply holding a key', () => {
  for (const [why, sep] of [['written whole', ''], ['split by a zero-width space', '​']] as const) {
    it(`Copy writes it hidden, as the Prose shows it (a key ${why})`, async () => {
      const writeText = vi.fn(async () => undefined);
      vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
      const text = `Set it with \`export TOKEN=sk-${sep}live0123456789abcdef\` and run the tests.`;
      render(<ReplyBox><Prose text={text} /><ReplyFooter text={text} cost={null} at={null} /></ReplyBox>);
      expect(read(document.body.textContent ?? '')).not.toContain(KEY);
      fireEvent.click(screen.getByRole('button', { name: /copy/i }));
      await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
      const [copied] = (writeText.mock.calls as unknown as [string][])[0] as [string];
      expect(read(copied)).not.toContain(KEY);
      expect(copied).toContain('[hidden]');
      // The rest of the text is copied as written.
      expect(copied).toContain('and run the tests.');
    });
  }

  it('Copy writes a percent-encoded key hidden too, as the Prose shows it', async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    const text = `Your key ${ENC} did not work.`;
    render(<ReplyBox><Prose text={text} /><ReplyFooter text={text} cost={null} at={null} /></ReplyBox>);
    expect(document.body.textContent).toContain('did not work.');
    expect(document.body.textContent).not.toContain(ENC);
    fireEvent.click(screen.getByRole('button', { name: /copy/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const [copied] = (writeText.mock.calls as unknown as [string][])[0] as [string];
    expect(copied).not.toContain(ENC);
    expect(decodeURIComponent(copied)).not.toContain(KEY);
    expect(copied).toBe('Your key [hidden] did not work.');
  });
});

describe('inline code that is one address', () => {
  // The address is joined from parts so the source never holds a URL with a password in it.
  const login = ['alice', 'hunter2'].join(':');
  const codeOf = (md: string): Extract<Inline, { k: 'code' }> => {
    const b = parseMd(md)[0] as { k: 'p'; c: Inline[] };
    return b.c.find((x) => x.k === 'code') as Extract<Inline, { k: 'code' }>;
  };

  it('with a user name and password: shown without them, in the parsed node and on the page', () => {
    const md = `Open \`https://${login}@example.org/admin\` to sign in.`;
    const c = codeOf(md);
    expect(c.s).toBe('https://example.org/admin');
    expect(JSON.stringify(c)).not.toMatch(/hunter2|alice/);
    const { container } = render(<Prose text={md} />);
    expect(container.textContent).toContain('https://example.org/admin');
    expect(container.innerHTML).not.toMatch(/hunter2|alice/);
  });

  it('with a user name, a password and a key (the reader refuses it): shown with none of them', () => {
    const secret = 'sk-' + 'abcdefghijklmnop';
    const md = `Open \`https://${login}@example.org/?key=${secret}\` to sign in.`;
    const c = codeOf(md);
    expect(c.s).toBe('https://example.org/?key=[hidden]');
    expect(JSON.stringify(c)).not.toMatch(/hunter2|alice/);
    expect(JSON.stringify(c)).not.toContain(secret);
    const { container } = render(<Prose text={md} />);
    expect(container.textContent).toContain('https://example.org/?key=[hidden]');
    expect(container.innerHTML).not.toMatch(/hunter2|alice/);
    expect(container.innerHTML).not.toContain(secret);
  });

  it('with a user name only: shown without it', () => {
    expect(codeOf('Use `https://deploy@example.org/x`.').s).toBe('https://example.org/x');
  });

  it('without credentials: shown exactly as written', () => {
    expect(codeOf('See `https://example.org/Path?q=1`.').s).toBe('https://example.org/Path?q=1');
  });
});

describe('a step summary holding a key', () => {
  it('a shell step draws it hidden', () => {
    const m = stepModel('bash', `$ curl -H "x: ${KEY}" https://example.com`);
    expect(m && m.k).toBe('sh');
    const shown = m && m.k === 'sh' ? m.tokens.map((x) => x[1]).join('') : '';
    expect(read(shown)).not.toContain(KEY);
    expect(shown).toContain('[hidden]');
    expect(shown).toContain('curl');
  });

  it('a text step draws it hidden', () => {
    const m = stepModel('web_search', `look up ${KEY}`);
    expect(m && m.k === 'text' ? m.text : '').toBe('look up [hidden]');
  });
});
