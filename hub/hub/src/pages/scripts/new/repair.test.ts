// Vitest: a fix attempt's code goes to the AI masked with the AiDrawer masking (secrets.ts), its map
// held for that attempt only. The answer is applied only with that map; a lost map or a placeholder the map does not know
// applies nothing, so an unresolved placeholder never reaches Check or Make it live.
import { describe, expect, it } from 'vitest';
import { answerCode, repairOf } from './prompt';

const KEY = 'sk-abcdefghijklmnopqrstuvwx1234';
const CODE = `const token = "${KEY}";\nexport default token.length;\n`;
const reply = (code: string) => `Summary: fixed\n\`\`\`ts\n${code}\`\`\``;

describe('repairOf (mask before send)', () => {
  it('the literal secret never leaves: the block holds a placeholder, the map puts it back', () => {
    const r = repairOf(CODE, ['bad']);
    if ('error' in r) throw new Error('masked');
    expect(r.fix.code).not.toContain(KEY);
    expect(r.fix.code).toContain('__HOODY_SECRET_0__');
    expect(r.fix.problems).toEqual(['bad']);
    expect(r.map).toEqual([{ ph: '__HOODY_SECRET_0__', value: KEY }]);
  });

  it('code that already holds a placeholder-like text cannot be masked: refused', () => {
    expect(repairOf('const a = "__HOODY_SECRET_0__";\n', [])).toEqual({ error: 'placeholder' });
  });
});

describe('repairOf: the problems are masked with the code', () => {
  it('a diagnostic quoting a literal of the code carries the same placeholder, never the value', () => {
    const r = repairOf(CODE, [`line 1: "${KEY}" is not used`, 'plain problem']);
    if ('error' in r) throw new Error('masked');
    expect(r.fix.problems).toEqual(['line 1: "__HOODY_SECRET_0__" is not used', 'plain problem']);
    expect(JSON.stringify(r.fix)).not.toContain(KEY);
    expect(r.map).toEqual([{ ph: '__HOODY_SECRET_0__', value: KEY }]);
  });
  it('a secret only a diagnostic quotes is masked too', () => {
    const r = repairOf('export default 1;\n', [`token = "${KEY}"`]);
    if ('error' in r) throw new Error('masked');
    expect(r.fix.problems[0]).not.toContain(KEY);
  });
  it('a problem holding a placeholder-like text is refused', () => {
    expect(repairOf(CODE, ['see __HOODY_SECRET_3__'])).toEqual({ error: 'placeholder' });
  });
});

describe('answerCode (apply only with the attempt\'s map)', () => {
  const masked = () => { const r = repairOf(CODE, []); if ('error' in r) throw new Error('masked'); return r; };

  it('with the map: the placeholder is restored byte-exactly', () => {
    const r = masked();
    const a = answerCode(reply(r.fix.code), { fix: true, map: r.map });
    expect(a).toMatchObject({ ok: true, warn: null });
    expect(a.ok && a.code).toContain(KEY);
  });

  it('a fix answer without its map (another tab, a reload) is never applied', () => {
    const r = masked();
    expect(answerCode(reply(r.fix.code), { fix: true, map: null })).toEqual({ ok: false, why: 'map_lost' });
    expect(answerCode(reply(r.fix.code), { fix: true, map: undefined })).toEqual({ ok: false, why: 'map_lost' });
  });

  it('a placeholder the map does not know: nothing applied', () => {
    const r = masked();
    expect(answerCode(reply('export default "__HOODY_SECRET_7__";\n'), { fix: true, map: r.map })).toEqual({ ok: false, why: 'unknown_placeholder' });
  });

  it('a plain build (no map) that holds a placeholder: nothing applied either', () => {
    expect(answerCode(reply('export default "__HOODY_SECRET_0__";\n'), { fix: false, map: null })).toEqual({ ok: false, why: 'unknown_placeholder' });
  });

  it('a placeholder the answer dropped or repeated is applied with a warning to confirm', () => {
    const r = masked();
    expect(answerCode(reply('export default 1;\n'), { fix: true, map: r.map })).toMatchObject({ ok: true, warn: 'vanished' });
    expect(answerCode(reply('const a = "__HOODY_SECRET_0__";\nconst b = "__HOODY_SECRET_0__";\nexport default a + b;\n'), { fix: true, map: r.map })).toMatchObject({ ok: true, warn: 'duplicated' });
  });

  it('a plain build with a script: applied as is', () => {
    expect(answerCode(reply('export default 1;\n'), { fix: false, map: null })).toMatchObject({ ok: true, code: 'export default 1;\n', warn: null });
  });

  it('an answer without a script: the extract refusal, nothing applied', () => {
    const a = answerCode('I cannot do that.', { fix: false, map: null });
    expect(a.ok).toBe(false);
  });
});
