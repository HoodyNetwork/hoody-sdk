// net-exec.mjs: the fence resolves a child's program as the OS would and trusts only the real runtime and tool files.
import { afterAll, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { exeContext, resolveExecutable, trustedExecutables } from './net-exec.mjs';

const TMP = path.join(import.meta.dir, '..', '..', '.term-cache', 'tmp', `net-exec-${process.pid}`);
afterAll(() => fs.rmSync(TMP, { recursive: true, force: true }));

test('resolution: a path against cwd, a bare name on the given PATH, symlinks followed, non-executables skipped', () => {
  const bin = path.join(TMP, 'bin');
  fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(path.join(bin, 'node'), '#!/bin/sh\n', { mode: 0o755 });
  fs.writeFileSync(path.join(bin, 'plain'), 'x', { mode: 0o644 });
  fs.symlinkSync(path.join(bin, 'node'), path.join(bin, 'alias'));
  expect(resolveExecutable('node', '/', bin)).toBe(fs.realpathSync(path.join(bin, 'node')));
  expect(resolveExecutable('./bin/node', TMP, '')).toBe(fs.realpathSync(path.join(bin, 'node')));
  expect(resolveExecutable('alias', '/', bin)).toBe(fs.realpathSync(path.join(bin, 'node')));
  expect(resolveExecutable('plain', '/', bin)).toBeNull();
  expect(resolveExecutable('missing', '/', bin)).toBeNull();
});

test('trusted: this runtime and the PATH\'s bun/node; a fake `node` first on the CHILD\'s PATH is not trusted', () => {
  const t = trustedExecutables();
  expect(t.runtimes.has(fs.realpathSync(process.execPath))).toBe(true);
  expect(t.tools.size).toBeGreaterThan(0);
  const fake = exeContext(t, { env: { PATH: path.join(TMP, 'bin') } });
  const r = fake.resolve('node');
  expect(r).toBe(fs.realpathSync(path.join(TMP, 'bin', 'node')));
  expect(t.runtimes.has(r!)).toBe(false);
});
