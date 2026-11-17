// Vitest (New script): the page's mirror of exec's print edit list, and its reading of parse.
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { parseSchema } from '../magic';
import { applyEdits, commentsOf, printReplyOf, putInCode, settingsFields, verifiedText } from './StepSettings';

const sha = (t: string) => createHash('sha256').update(t, 'utf8').digest('hex');

describe('applyEdits (exec magic-comments/print, mirrored)', () => {
  it('inserts after a posted line (0 = the top), replaces from a column, deletes', () => {
    const text = '// @timeout 30s\n/* x */ // @label Old\n// @mode worker\ncode();';
    expect(applyEdits(text, [
      { op: 'insert', line: 0, text: '// @enabled true' },
      { op: 'delete', line: 1 },
      { op: 'replace', line: 2, column: 8, text: '// @label New' },
      { op: 'insert', line: 3, text: '// @debug true' },
    ])).toBe('// @enabled true\n/* x */ // @label New\n// @mode worker\n// @debug true\ncode();');
  });

  it('keeps a line\'s CR, and an inserted line takes the CR of the line before it', () => {
    expect(applyEdits('// @a 1\r\ncode();', [{ op: 'replace', line: 1, column: 0, text: '// @a 2' }, { op: 'insert', line: 1, text: '// @b 1' }])).toBe('// @a 2\r\n// @b 1\r\ncode();');
  });

  it('refuses an edit outside the text, or two edits of one line', () => {
    expect(applyEdits('a\nb', [{ op: 'delete', line: 3 }])).toBeNull();
    expect(applyEdits('a\nb', [{ op: 'delete', line: 0 }])).toBeNull();
    expect(applyEdits('a\nb', [{ op: 'delete', line: 1 }, { op: 'replace', line: 1, column: 0, text: 'x' }])).toBeNull();
  });
});

describe('printReplyOf and verifiedText', () => {
  it('reads only a well-formed answer', () => {
    expect(printReplyOf({ edits: [], verify: { lines: 1 } })).toEqual({ edits: [], verify: { lines: 1 } });
    expect(printReplyOf({ edits: [{ op: 'replace', line: 1, text: 'x' }], verify: { lines: 1 } })).toBeNull();
    expect(printReplyOf({ edits: [{ op: 'move', line: 1 }], verify: { lines: 1 } })).toBeNull();
    expect(printReplyOf({ edits: [] })).toBeNull();
    expect(printReplyOf(null)).toBeNull();
  });

  it('applies only a result whose line count and digest are exec\'s', async () => {
    const out = '// @label N\ncode();';
    const edits = [{ op: 'insert' as const, line: 0, text: '// @label N' }];
    expect(await verifiedText('code();', { edits, verify: { lines: 2, sha256: sha(out) } })).toBe(out);
    expect(await verifiedText('code();', { edits, verify: { lines: 3, sha256: sha(out) } })).toBeNull();
    expect(await verifiedText('code();', { edits, verify: { lines: 2, sha256: sha('other') } })).toBeNull();
    // No digest is sent for a text with a secret line: the line count still has to match.
    expect(await verifiedText('code();', { edits, verify: { lines: 2 } })).toBe(out);
  });
});

describe('commentsOf (exec magic-comments/parse)', () => {
  it('keeps the lines exec applies, nothing from a secret or redacted line', () => {
    expect(commentsOf({ directives: [
      { key: 'timeout', value: 1000, in_force: true },
      { key: 'debug', value: true, in_force: false },
      { key: 'label', value: 'x', in_force: true, redacted: true },
      { key: 'token', in_force: true, secret: true },
      { key: 'mode', in_force: true },
    ] })).toEqual({ timeout: 1000 });
    expect(commentsOf({})).toBeNull();
  });
});

describe('settingsFields and putInCode', () => {
  const schema = parseSchema({ fields: [
    { key: 'token', type: 'string|string[]', category: 'auth' },
    { key: 'schedule', type: 'string' },
    { key: 'timeout', type: 'integer', range: { min: 0, max: 100 } },
    { key: 'weird', type: 'object[]' },
  ] });

  it('leaves out secrets, the schedule and what cannot be edited', () => {
    expect(settingsFields(schema!).map((f) => f.key)).toEqual(['timeout']);
  });

  it('a problem stops it before print; a failed answer is refused, any other is unknown', async () => {
    let sent = 0;
    const print = async () => { sent++; return { outcome: 'failed' as const }; };
    expect(await putInCode('c', schema!, { timeout: '500' }, print)).toEqual({ problems: { timeout: 'range' } });
    expect(sent).toBe(0);
    expect(await putInCode('c', schema!, { timeout: '5' }, print)).toEqual({ note: 'refused', key: null });
    expect(await putInCode('c', schema!, { timeout: '5' }, async () => ({ outcome: 'pending' as const }))).toEqual({ note: 'unknown', key: null });
    expect(await putInCode('c', schema!, { timeout: '5' }, async () => { throw new Error('x'); })).toEqual({ note: 'unknown', key: null });
    expect(await putInCode('c', schema!, { timeout: '5' }, async () => ({ outcome: 'not_sent' as const }))).toEqual({ note: 'unknown', key: null });
  });
});
