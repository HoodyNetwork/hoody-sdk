// Vitest: the example prompts under Describe it. Each one is sent as written, so each must read back from the prompt the
// page builds, carry nothing the secret check would hold, name no AI backend, and promise only what a script really has:
// every name in EXAMPLE_USES is checked against its source (the runtime's `ai` helper and magic comments in hoody-exec,
// the kit methods in the SDK's generated services, the secret values in hoody-exec's own docs), and the words say each
// thing the script uses. The sources are read from the monorepo this Hub sits in; outside it those checks are skipped.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { monorepoPath } from '@core/test/monorepo';
import { detectLiterals } from '../secrets';
import strings from '../strings.en.json';
import { EXAMPLES, EXAMPLE_USES, type ExampleUse } from './examples';
import { buildPrompt, parsePrompt } from './prompt';

const S = strings as Record<string, string>;
const fill = (id: string) => S[`new.ex.${id}.fill`] ?? '';
const label = (id: string) => S[`new.ex.${id}`] ?? '';
const ALL_USES = [...new Set(EXAMPLES.flatMap((id) => EXAMPLE_USES[id]))];

const EXEC = monorepoPath(process.env.HOODY_EXEC_ROOT, 'hoody-kit', 'hoody-exec');
const SDK_GEN = monorepoPath(process.env.HOODY_SDK_GENERATED, 'hoody-sdk-generator', 'hoody-sdk', 'generated');
const read = (...p: string[]) => readFileSync(join(...p), 'utf8');

/** The words an example must hold for each kind of thing it uses. */
function wordsFor(use: ExampleUse): RegExp {
  if (use.startsWith('ai.')) return /\bAI\b/;
  if (use === '@schedule') return /\bEvery (hour|day|morning|night|week|Monday)/;
  if (use === '@token') return /\bthe script's key\b/;
  if (use === 'env') return /\bsecret value\b/;
  if (use.startsWith('sdk:browser/')) return /\bthis computer's browser\b/;
  if (use.startsWith('sdk:notifications/')) return /\bnotification\b/;
  if (use.startsWith('sdk:sqlite/')) return /\bthis computer's database\b/;
  if (use.startsWith('sdk:files/')) return /\bfiles\b.*\bon this computer\b/;
  throw new Error(`no words known for ${use}`);
}

describe('New script examples', () => {
  it('5 to 7 examples, each with a label, its words and what it uses', () => {
    expect(EXAMPLES.length).toBeGreaterThanOrEqual(5);
    expect(EXAMPLES.length).toBeLessThanOrEqual(7);
    expect(Object.keys(EXAMPLE_USES).sort()).toEqual([...EXAMPLES].sort());
    for (const id of EXAMPLES) {
      expect(label(id).trim(), id).not.toBe('');
      expect(fill(id).trim(), id).not.toBe('');
      expect(EXAMPLE_USES[id].length, id).toBeGreaterThan(0);
    }
    expect(new Set(EXAMPLES.map(fill)).size).toBe(EXAMPLES.length);
  });

  it('show what a Hoody computer does: AI in most, and the browser, notifications, a database, files and a schedule each at least once', () => {
    expect(EXAMPLES.filter((id) => EXAMPLE_USES[id].some((u) => u.startsWith('ai.'))).length).toBeGreaterThanOrEqual(4);
    for (const kind of ['sdk:browser/', 'sdk:notifications/', 'sdk:sqlite/', 'sdk:files/', '@schedule', '@token']) {
      expect(ALL_USES.some((u) => u.startsWith(kind)), kind).toBe(true);
    }
  });

  it('each one reads back exactly from the prompt the page sends, and holds nothing the secret check would mask', () => {
    for (const id of EXAMPLES) {
      const built = buildPrompt(fill(id), { address: '/example', schedule: null, exec: 1 });
      expect(built.ok, id).toBe(true);
      const back = parsePrompt(built.ok ? built.text : '');
      expect(back.ok && back.description, id).toBe(fill(id));
      expect(detectLiterals(fill(id)), id).toEqual([]);
    }
  });

  it('names no AI backend and no model, in the label or the words', () => {
    for (const id of EXAMPLES) {
      for (const text of [label(id), fill(id)]) expect(text, id).not.toMatch(/openrouter|openai|anthropic|claude|gpt|gemini|llama|mistral|hoody-ai/i);
    }
  });

  it('the words say each thing the script uses', () => {
    for (const id of EXAMPLES) for (const use of EXAMPLE_USES[id]) expect(fill(id), `${id} uses ${use}`).toMatch(wordsFor(use));
  });

  it('every magic comment used is in the computer\'s settings list the page reads (fixture)', () => {
    const src = read(__dirname, '..', 'fixtures.ts');
    for (const use of ALL_USES.filter((u) => u.startsWith('@'))) expect(src, use).toContain(`fld('${use.slice(1)}', `);
  });

  describe.skipIf(EXEC === null)('against hoody-exec', () => {
    it('every ai helper used is one the runtime gives each script', () => {
      const src = read(EXEC!, 'src', 'index.ts');
      const at = src.indexOf('var ai = {');
      expect(at).toBeGreaterThan(0);
      const block = src.slice(at, src.indexOf('\n        };', at));
      for (const use of ALL_USES.filter((u) => u.startsWith('ai.'))) expect(block, use).toMatch(new RegExp(String.raw`\n\s+${use.slice(3)}: async function\(`));
    });

    it('every magic comment used is one the runtime knows', () => {
      const src = read(EXEC!, 'src', 'magic-comment-editor.ts');
      const order = src.slice(src.indexOf('const MAGIC_COMMENT_FIELD_ORDER'), src.indexOf('];', src.indexOf('const MAGIC_COMMENT_FIELD_ORDER')));
      for (const use of ALL_USES.filter((u) => u.startsWith('@'))) expect(order, use).toContain(`'${use.slice(1)}'`);
    });

    it('secret values are something a script has', () => {
      if (!ALL_USES.includes('env')) return;
      expect(read(EXEC!, 'README.md')).toContain('Secrets (`.env` companions)');
    });
  });

  describe.skipIf(SDK_GEN === null)('against the SDK the `hoody` client is built from', () => {
    it('every kit method used is in its generated service', () => {
      for (const use of ALL_USES.filter((u) => u.startsWith('sdk:'))) {
        const m = /^sdk:([a-z]+)\/([a-zA-Z]+)\.([a-zA-Z]+)$/.exec(use);
        expect(m, use).not.toBeNull();
        const [, kit, service, method] = m!;
        expect(read(SDK_GEN!, kit!, `${service}.service.generated.ts`), use).toMatch(new RegExp(String.raw`\n  async ${method}\(`));
      }
    });
  });
});
