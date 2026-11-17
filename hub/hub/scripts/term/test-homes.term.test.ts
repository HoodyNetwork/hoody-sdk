// test-homes.mjs: a new test home sweeps the stale homes of test processes that died.
import { expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { makeTestHome, ownerOf, STALE_MS, sweepStaleHomes } from './test-homes.mjs';

const root = path.join(import.meta.dir, '..', '..', '.term-cache', 'tmp', `test-homes-${process.pid}`);
const mk = (name: string, ageMs: number): string => {
  const p = path.join(root, name);
  fs.mkdirSync(p, { recursive: true });
  const t = (Date.now() - ageMs) / 1000;
  fs.utimesSync(p, t, t);
  return p;
};

test('stale = older than an hour AND the owner is gone; live owners, fresh homes and other names stay', () => {
  try {
    mk('home-AbC123', STALE_MS + 60_000); // old name, no pid: age alone
    mk('home-999001-xYz', STALE_MS + 60_000); // dead owner
    mk('home-999002-xYz', STALE_MS + 60_000); // live owner (per isAlive)
    mk('home-999003-xYz', 60_000); // fresh
    mk('keep-me', STALE_MS * 5);
    const gone = sweepStaleHomes(root, Date.now(), (pid: number) => pid === 999002).sort();
    expect(gone).toEqual(['home-999001-xYz', 'home-AbC123']);
    expect(fs.readdirSync(root).sort()).toEqual(['home-999002-xYz', 'home-999003-xYz', 'keep-me']);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('a new home carries its owner pid, is empty, and swept the stale ones first', () => {
  try {
    mk('home-999001-old', STALE_MS + 60_000);
    const home = makeTestHome(root, false);
    expect(ownerOf(path.basename(home))).toBe(process.pid);
    expect(fs.readdirSync(home)).toEqual([]);
    expect(fs.existsSync(path.join(root, 'home-999001-old'))).toBe(false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
