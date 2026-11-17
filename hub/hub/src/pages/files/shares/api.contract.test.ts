// @vitest-environment node
// The share rules the Hub mirrors, against the Hoody API's own code: the status sentences
// (the API's own table), the path check (the API's own
// function) and the mount path check (the API's own function). Each API file is
// compiled with TypeScript and run with its imports stubbed (none of them is reached by the parts compared), then:
//   - the API's status table equals the Hub table, key for key, in order, byte for byte;
//   - the API's path check accepts exactly the paths sharePathProblem passes, over the API's own test vectors and
//     generated ones (the Hub may refuse more only as 'connected': another disk, which the API cannot see);
//   - the API's mount path check and mountPathOk answer the same over the API's vectors and generated ones;
//   - the mirrored constants (length, refused roots and prefixes, the character and mount expressions) are the API's.
// Where: the API's src in the monorepo this Hub sits in, or HUB_SHARE_API_SRC (a src directory) for another checkout. An
// explicit HUB_SHARE_API_SRC must hold all three files (a wrong checkout fails). Two default cases skip, each by name: a
// Hub-only copy (no monorepo around this Hub, as in the published package), and an older API (before mount_path,
// container wording), recognised by content: a src without the mount path file whose other two files are byte for
// byte the pinned ones below. Any other default source (partial, edited, refreshed) must hold all three files, or the
// test fails. Drop the old-API skip and the pins once the API source holds the mount path file
// in its own src.
// A refusal is only the API's own validation error (the stubbed createValidationError); any other exception fails.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { monorepoPath } from '@core/test/monorepo';
import { SHARE_PATH_RULES, sharePathProblem } from './pathProblem';
import { SHARE_SENTENCES } from './state';
import { MOUNT_PATH_RE, mountPathOk } from './wire';

const EXPLICIT = process.env.HUB_SHARE_API_SRC;
const SRC_AT = monorepoPath(EXPLICIT, 'hoody-api', 'src');
const SRC = SRC_AT ?? '';
const FILES = ['share-status-messages.ts', 'storage-validation.ts', 'share-mount-path.ts'] as const;
const pathOf = (f: string) => join(SRC, 'utils', f);
/** sha256 of the API's two files from before mount_path was stored. */
const OLD_STAGE_SHA256: Readonly<Record<string, string>> = {
  'share-status-messages.ts': '6187d7b287e26166edf8578e76d8c809a98578dc518d1d897355f71831243273',
  'storage-validation.ts': '1cbb2ce668fa547f75c092c083ce1f21210a640d381e5abf5566a3a50bf02630',
};
const sha256Of = (f: string): string | null =>
  (existsSync(pathOf(f)) ? createHash('sha256').update(readFileSync(pathOf(f))).digest('hex') : null);
const OLD_STAGE_API = EXPLICIT === undefined && !existsSync(pathOf('share-mount-path.ts'))
  && Object.entries(OLD_STAGE_SHA256).every(([f, h]) => sha256Of(f) === h);
/** A Hub-only copy: no monorepo around this Hub, so no API source to read (inside the monorepo a missing or incomplete src fails). */
const HUB_ONLY_COPY = SRC_AT === null;
const SKIP = OLD_STAGE_API || HUB_ONLY_COPY;

/** The API's validation error, as the stubbed createValidationError makes it: the only exception that is a refusal. */
class ApiRefusal extends Error {}

/** The API module, compiled to CommonJS and run with every import stubbed. */
function load(f: (typeof FILES)[number]): Record<string, unknown> {
  const { outputText } = ts.transpileModule(readFileSync(pathOf(f), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  });
  const mod = { exports: {} as Record<string, unknown> };
  const stub = (name: string) => (name === './error-handler'
    ? { createValidationError: (m: string) => new ApiRefusal(m), ApiError: Error, ErrorType: {} }
    : { default: {}, toUserFacingPaymentStatus: (s: string) => s, createHash: () => { throw new Error('not used'); } });
  new Function('module', 'exports', 'require', outputText)(mod, mod.exports, stub);
  return mod.exports;
}

/** The initializer of a top-level `const name = ...` in an API file (for the values the module does not export). */
function initOf(f: string, name: string): { node: ts.Expression; sf: ts.SourceFile } {
  const sf = ts.createSourceFile(f, readFileSync(pathOf(f), 'utf8'), ts.ScriptTarget.Latest, true);
  let out: ts.Expression | undefined;
  const visit = (n: ts.Node): void => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === name && n.initializer) out = n.initializer;
    if (out === undefined) ts.forEachChild(n, visit);
  };
  visit(sf);
  if (out === undefined) throw new Error(`${name} not found in ${f}`);
  return { node: out, sf };
}
const literalOf = (f: string, name: string): string => { const { node, sf } = initOf(f, name); return node.getText(sf); };
/** An array of string literals, sorted (comments between the elements are not elements). */
function stringsOf(f: string, name: string): string[] {
  const { node } = initOf(f, name);
  if (!ts.isArrayLiteralExpression(node)) throw new Error(`${name} is not an array literal`);
  return node.elements.map((e) => { if (!ts.isStringLiteralLike(e)) throw new Error(`${name}: not a string`); return e.text; }).sort();
}

// An escaped slash inside a character class is the same character: compare expressions without that spelling.
const canon = (re: string) => re.replace(/\\\//g, '/');

// The API's own test vectors and Hub-generated ones around every rule's edge.
const PATHS = [
  '/data/projects/my-app', '//data//projects/my-app', '//data//projects/./my-app', 'data/projects', '/data; rm -rf /',
  '/data && evil', '/data | tee', '/data$VAR', '/data/safe\0/etc/passwd', '/data/../etc', '/data/../proc/self', '/proc',
  '/proc/self/mem', '/sys/class', '/dev/sda', '/boot/grub', '/run/secrets', '/var/run/docker.sock', '/proc/../proc/self',
  '//proc/self', '', 'relative', '/', '//', '/hoody', '/hoody/', '/hoody/shares', '/hoody/shares/x-0123abcd/sub',
  '/hoody/containers/x', '/hoody/mine', '/hoody/sharesx', '/procedures', '/var/running', '/data/a..b', '/data/.hidden',
  '/home/ada/My Photos', '/home/ada/café', '/home/ada/report(1)', '/a/', '/a//b/', '/./a', '/a/.', '/a/..', '..', '.',
  '/' + 'a'.repeat(999), '/' + 'a'.repeat(1000), '/' + 'a/'.repeat(499) + 'b', '/a\tb', '/a\nb', '/a\\b', "/a'b", '/a"b',
  '/A-Z_0.9', '/srv/data', '/var', '/var/lib/app', '/runner', '/devices', '/bootstrap', '/system',
];
const MOUNTS = [
  '/hoody/shares/data-0123abcd', '/hoody/shares/data-0123456789abcdef', '/hoody/shares/data-0123abc',
  '/hoody/shares/data-0123456789abcdef0', '/hoody/shares/a/b-0123abcd', '/hoody/shares/..-0123abcd',
  '/hoody/shares/.x-0123abcd', '/hoody/containers/x-0123abcd', '/data', 'hoody/shares/data-0123abcd',
  '/hoody/shares/a..b-0123abcd', '/hoody/shares/a.b-0123abcd', '/hoody/shares/x.-0123abcd', '/hoody/shares/-0123abcd',
  `/hoody/shares/${'a'.repeat(40)}-0123abcd`, `/hoody/shares/${'a'.repeat(41)}-0123abcd`, '/hoody/shares/data-0123ABCD',
  '/hoody/shares/data-0123abcde', '/hoody/shares/a-b-0123abcd', '/hoody/shares/data-0123abcd/', '/hoody/shares/da ta-0123abcd',
];

describe('the API source to check against', () => {
  it.runIf(!SKIP)('the source holds every file (a partial, edited or wrong checkout fails, never skips)', () => {
    for (const f of FILES) expect(existsSync(pathOf(f)), pathOf(f)).toBe(true);
  });
});

describe.skipIf(SKIP)('share rules match the API code (skipped only in a Hub-only copy or on an API from before mount_path)', () => {
  it('the status sentences: the same keys, in order, each sentence byte for byte', () => {
    const api = load('share-status-messages.ts').SHARE_STATUS as Record<string, string>;
    expect(Object.keys(api).length).toBeGreaterThan(0);
    expect(Object.keys(SHARE_SENTENCES)).toEqual(Object.keys(api));
    for (const [k, v] of Object.entries(api)) expect(SHARE_SENTENCES[k as keyof typeof SHARE_SENTENCES], k).toBe(v);
  });
  it('the path check: the API accepts exactly the paths the Hub passes', () => {
    const validate = load('storage-validation.ts').validateStoragePath as (p: string) => string;
    for (const p of PATHS) {
      let apiOk = true;
      try { validate(p); } catch (e) { if (!(e instanceof ApiRefusal)) throw e; apiOk = false; }
      const hub = sharePathProblem(p);
      expect(hub === null, `${JSON.stringify(p)}: API ${apiOk ? 'accepts' : 'refuses'}, Hub ${hub ?? 'passes'}`).toBe(apiOk);
    }
  });
  it('the Hub refuses more than the API only as connected storage', () => {
    const validate = load('storage-validation.ts').validateStoragePath as (p: string) => string;
    expect(() => validate('/hoody/mounts/permanent/drive/docs')).not.toThrow();
    expect(() => validate('/proc')).toThrow(ApiRefusal);
    expect(sharePathProblem('/hoody/mounts/permanent/drive/docs')).toBe('connected');
  });
  it('the path constants: length, refused roots and prefixes, the character expression', () => {
    expect(load('storage-validation.ts').MAX_PATH_LENGTH).toBe(SHARE_PATH_RULES.maxLength);
    expect(stringsOf('storage-validation.ts', 'BLOCKED_EXACT_PATHS')).toEqual([...SHARE_PATH_RULES.roots].sort());
    expect(stringsOf('storage-validation.ts', 'BLOCKED_PATH_PREFIXES')).toEqual([...SHARE_PATH_RULES.received, ...SHARE_PATH_RULES.system].sort());
    expect(canon(literalOf('storage-validation.ts', 'VALID_PATH_CHARS_REGEX'))).toBe(canon(String(SHARE_PATH_RULES.validChars)));
  });
  it('the mount path check: isShareMountPath and mountPathOk answer the same, and the expression is the API\'s', () => {
    const api = load('share-mount-path.ts').isShareMountPath as (p: string) => boolean;
    for (const p of MOUNTS) expect(mountPathOk(p), p).toBe(api(p));
    expect(literalOf('share-mount-path.ts', 'SHARE_MOUNT_PATH_RE')).toBe(String(MOUNT_PATH_RE));
  });
});
