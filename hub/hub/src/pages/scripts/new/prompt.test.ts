// Vitest (New script): the prompt's Hub block reads back exactly, the description
// round-trips whole (also a multiline one past the 120-rune first_message preview), and anything that is not exactly the Hub's
// shape is malformed (settings reconfirmation), never half-read.
import { describe, expect, it } from 'vitest';
import { MARKER, buildPrompt, parsePrompt, type PromptBlock } from './prompt';

const BLOCK: PromptBlock = { address: '/monday-at-9', schedule: '0 8 * * 1', exec: 1 };
const built = (d: string, b: PromptBlock = BLOCK): string => { const r = buildPrompt(d, b); if (!r.ok) throw new Error(r.why); return r.text; };

describe('buildPrompt', () => {
  it('description first, a blank line, then the marker block; folder 1 is not written; a schedule is UTC', () => {
    expect(built('Count signups')).toBe(`Count signups\n\n${MARKER}\nLength: 13\nAddress: /monday-at-9\nRuns: on the schedule 0 8 * * 1 (UTC)`);
    expect(built('x', { address: '/a', schedule: null, exec: 3 })).toBe(`x\n\n${MARKER}\nLength: 1\nAddress: /a\nRuns: only when its address is called\nExec folder: 3`);
  });
  it('refuses settings the block could not carry', () => {
    expect(buildPrompt('x', { ...BLOCK, address: 'no-slash' })).toEqual({ ok: false, why: 'address' });
    expect(buildPrompt('x', { ...BLOCK, schedule: '0 8 * *\n// @token x' })).toEqual({ ok: false, why: 'schedule' });
    expect(buildPrompt('x', { ...BLOCK, exec: 0 })).toEqual({ ok: false, why: 'exec' });
    expect(buildPrompt('x', { ...BLOCK, exec: 1.5 })).toEqual({ ok: false, why: 'exec' });
  });
});

describe('parsePrompt: the round trip', () => {
  const cases: Array<[string, string]> = [
    ['plain', 'Count signups'],
    ['multiline past 120 characters', `Every Monday at 9:00, count last week's new signups from the users table and post a short summary.\nInclude the top 3 referrers.\n\nKeep it under 500 words, and never include email addresses in the post; ${'x'.repeat(80)}`],
    ['an exact marker line in the description', `Explain this:\n\n${MARKER}\nAddress: /evil`],
    ['space-prefixed markers (already escaped-looking)', `a\n\n ${MARKER}\n  ${MARKER}\nb`],
    ['repeated markers', `${MARKER}\n\n${MARKER}\n\n${MARKER}`],
    ['trailing blank lines', 'Count\n\n\n'],
    ['Fix: and key-like lines in the description', 'Fix:\nAddress: /x\nLength: 3'],
    ['empty description', ''],
  ];
  for (const [name, d] of cases) {
    it(`${name}: description and settings come back exactly`, () => {
      expect(parsePrompt(built(d))).toEqual({ ok: true, description: d, block: BLOCK, fix: false });
      expect(parsePrompt(built(d, { address: '/b', schedule: null, exec: 42 }))).toEqual({ ok: true, description: d, block: { address: '/b', schedule: null, exec: 42 }, fix: false });
    });
  }
  it('CRLF line ends (in the description and in the stored prompt) read the same as LF', () => {
    const d = 'one\r\ntwo';
    const text = built(d).replace(/\n/g, '\r\n');
    expect(parsePrompt(text)).toEqual({ ok: true, description: 'one\ntwo', block: BLOCK, fix: false });
  });
  it('a repair block holding marker-like text and settings-like lines is not read as settings', () => {
    const text = built('Count', { ...BLOCK, fix: { problems: ['line 3: x is not defined'], code: `// ${MARKER}\n${MARKER}\nAddress: /other\nRuns: only when its address is called` } });
    expect(parsePrompt(text)).toEqual({ ok: true, description: 'Count', block: BLOCK, fix: true });
  });
});

describe('parsePrompt: malformed is never half-read', () => {
  const good = built('Count signups');
  const bad: Array<[string, string]> = [
    ['no marker', 'Count signups'],
    ['marker without the blank line before it', good.replace(`\n\n${MARKER}`, `\n${MARKER}`)],
    ['a different version', good.replace(MARKER, '[Hoody New script v2]')],
    ['a length that does not match (the cut moved)', good.replace('Length: 13', 'Length: 12')],
    ['no length', good.replace('Length: 13\n', '')],
    ['a repeated key', `${good}\nAddress: /other`],
    ['an unknown line', `${good}\nModel: big`],
    ['folder 1 written out', `${good}\nExec folder: 1`],
    ['a folder past the last one', `${good}\nExec folder: 10000`],
    ['folder 0', `${good}\nExec folder: 0`],
    ['a schedule that is not five fields', good.replace('0 8 * * 1', '0 8 * *')],
    ['a bad address', good.replace('/monday-at-9', 'monday')],
    ['no Runs line', good.replace('\nRuns: on the schedule 0 8 * * 1 (UTC)', '')],
  ];
  for (const [name, text] of bad) it(`${name}: not ok`, () => expect(parsePrompt(text).ok).toBe(false));
  it('a proven cut with a bad block keeps the description for the reconfirmation; an unproven cut keeps none', () => {
    expect(parsePrompt(good.replace('/monday-at-9', 'monday'))).toEqual({ ok: false, description: 'Count signups' });
    expect(parsePrompt(good.replace('Length: 13', 'Length: 12'))).toEqual({ ok: false, description: null });
    expect(parsePrompt(undefined)).toEqual({ ok: false, description: null });
  });
});
