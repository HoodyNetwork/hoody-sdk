// The monorepo root finder: the environment variable wins, the walk stops at the first folder that holds both sibling
// repositories, from where the Hub lives today and from where it lives inside the SDK, and it is null anywhere else.
import { existsSync, mkdirSync, mkdtempSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, sep } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { findMonorepoRoot, monorepoPath, monorepoRoot } from './monorepo';

const abs = (...parts: string[]): string => sep + parts.join(sep);
const ROOT = abs('work', 'mono');
const holds = (...dirs: string[]) => (p: string): boolean => dirs.includes(p);
const BOTH = holds(join(ROOT, 'hoody-kit'), join(ROOT, 'hoody-sdk-generator'));

afterEach(() => vi.unstubAllEnvs());

describe('findMonorepoRoot', () => {
  it('the environment value wins and is returned as given', () => {
    expect(findMonorepoRoot(join(ROOT, 'x'), abs('elsewhere'), BOTH)).toBe(abs('elsewhere'));
  });
  it('finds the root from the Hub inside the API repository', () => {
    expect(findMonorepoRoot(join(ROOT, 'hoody-api', 'hub', 'src', 'core', 'test'), undefined, BOTH)).toBe(ROOT);
  });
  it('finds the same root from the Hub inside the SDK repository', () => {
    expect(findMonorepoRoot(join(ROOT, 'hoody-sdk-generator', 'hoody-sdk', 'hub', 'hub', 'src', 'core', 'test'), undefined, BOTH)).toBe(ROOT);
  });
  it('an empty environment value is no value', () => {
    expect(findMonorepoRoot(join(ROOT, 'a'), '', BOTH)).toBe(ROOT);
  });
  it('one sibling alone is not the root; with no such ancestor the answer is null', () => {
    expect(findMonorepoRoot(join(ROOT, 'a', 'b'), undefined, holds(join(ROOT, 'hoody-kit')))).toBeNull();
    expect(findMonorepoRoot(abs('published', 'node_modules', 'hub', 'src', 'core', 'test'), undefined, BOTH)).toBeNull();
  });
});

describe('findMonorepoRoot on real folders', () => {
  // A throwaway tree with both homes of the Hub under one root. Every folder made is noted, and each is removed
  // empty, deepest first.
  const made: string[] = [];
  const top = (): string => {
    const root = mkdtempSync(join(tmpdir(), 'hub-monorepo-'));
    made.push(root);
    return root;
  };
  const folder = (root: string, ...parts: string[]): string => {
    let dir = root;
    for (const part of parts) {
      dir = join(dir, part);
      if (!made.includes(dir)) { mkdirSync(dir); made.push(dir); }
    }
    return dir;
  };
  afterEach(() => { for (const dir of made.splice(0).sort((a, b) => b.length - a.length)) rmdirSync(dir); });

  it('finds the one root from the Hub inside the API repository and from the Hub inside the SDK repository', () => {
    const root = top();
    folder(root, 'hoody-kit');
    const inApi = folder(root, 'hoody-api', 'hub', 'src', 'core', 'test');
    const inSdk = folder(root, 'hoody-sdk-generator', 'hoody-sdk', 'hub', 'hub', 'src', 'core', 'test');
    expect(findMonorepoRoot(inApi, undefined)).toBe(root);
    expect(findMonorepoRoot(inSdk, undefined)).toBe(root);
  });
  it('a tree without hoody-kit is not the root: the walk goes on above it', () => {
    const root = top();
    const from = folder(root, 'hoody-sdk-generator', 'hoody-sdk', 'hub', 'hub', 'src', 'core', 'test');
    expect(findMonorepoRoot(from, undefined)).toBe(findMonorepoRoot(dirname(root), undefined));
  });
});

describe('monorepoRoot and monorepoPath', () => {
  it('HOODY_MONOREPO is the root', () => {
    vi.stubEnv('HOODY_MONOREPO', abs('given'));
    expect(monorepoRoot()).toBe(abs('given'));
    expect(monorepoPath(undefined, 'hoody-kit', 'x.json')).toBe(join(abs('given'), 'hoody-kit', 'x.json'));
  });
  it("a test's own override beats the root", () => {
    vi.stubEnv('HOODY_MONOREPO', abs('given'));
    expect(monorepoPath(abs('mine', 'x.json'), 'hoody-kit', 'x.json')).toBe(abs('mine', 'x.json'));
  });
  it('without the variable the answer is a folder holding both siblings, or null', () => {
    vi.stubEnv('HOODY_MONOREPO', '');
    const root = monorepoRoot();
    if (root === null) expect(monorepoPath(undefined, 'hoody-kit')).toBeNull();
    else expect(['hoody-kit', 'hoody-sdk-generator'].map((s) => existsSync(join(root, s)))).toEqual([true, true]);
  });
});
