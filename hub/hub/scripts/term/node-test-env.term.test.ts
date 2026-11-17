// node-test-env.mjs: the Node/vitest test process keeps only the test keep-list and gets a fresh
// empty HOME. The live proof (vitest-narrow.sh with sentinels, child included) is net-guard-proof.ts.
import { expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { isolateNodeTestEnv, NODE_TEST_KEEP, nodeTestKept, TEST_HOME_ROOT } from './node-test-env.mjs';
import { ENV_KEEP, HOME_KEYS } from './net-policy.mjs';

const SENT = 'SENTINEL-not-a-credential';
const root = path.join(import.meta.dir, '..', '..', '.term-cache', 'tmp', `node-test-env-${process.pid}`);

test('credential sentinels are dropped; kept knobs stay; HOME_KEYS point at a fresh empty directory under the root', () => {
  const G = path.join(import.meta.dir, 'net-guard-node.mjs');
  const env: Record<string, string | undefined> = { PATH: '/bin', TZ: 'UTC', HUB_CACHE_DIR: '/c', VITEST_POOL_ID: '1', NODE_OPTIONS: `--import ${G}`, APPROVER_SEED: '3',
    HOME: '/home/someone', HOODY_TOKEN: `hdy_${SENT}`, AWS_SECRET_ACCESS_KEY: SENT, GITHUB_TOKEN: SENT, OPENROUTER_API_KEY: SENT, XDG_CONFIG_HOME: '/home/someone/.config', npm_config_user_agent: SENT,
    // Survivors of the old prefix rule, a foreign NODE_OPTIONS, a VITEST-named sentinel.
    HUB_TOKEN: SENT, BUN_CONFIG_TOKEN: SENT, VITEST_SECRET: SENT, VITEST_POOL_ID_X: SENT };
  try {
    const home = isolateNodeTestEnv(env, { root, own: false });
    expect(JSON.stringify(env)).not.toContain(SENT);
    expect(env).toMatchObject({ PATH: '/bin', TZ: 'UTC', HUB_CACHE_DIR: '/c', VITEST_POOL_ID: '1', NODE_OPTIONS: `--import ${G}`, APPROVER_SEED: '3', NODE_ENV: 'test' });
    for (const k of ['HUB_TOKEN', 'BUN_CONFIG_TOKEN', 'VITEST_SECRET', 'VITEST_POOL_ID_X']) expect(env[k], k).toBeUndefined();
    const foreign: Record<string, string | undefined> = { NODE_OPTIONS: '--import /g.mjs', BUN_OPTIONS: '--preload=/x.ts' };
    isolateNodeTestEnv(foreign, { root, own: false });
    expect(foreign.NODE_OPTIONS).toBeUndefined();
    expect(foreign.BUN_OPTIONS).toBeUndefined();
    expect(path.dirname(home)).toBe(root);
    expect(fs.readdirSync(home)).toEqual([]);
    for (const k of HOME_KEYS) expect(env[k], k).toBe(home);
    // A child of an isolated process (HOME inside the root, existing) reuses it.
    const child: Record<string, string | undefined> = { ...env, GITHUB_TOKEN: SENT };
    expect(isolateNodeTestEnv(child, { root, own: false })).toBe(home);
    expect(child.GITHUB_TOKEN).toBeUndefined();
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('one keep-list: the Node list is the shared one plus named web-test knobs; no credential-looking name', () => {
  for (const k of ENV_KEEP) expect(NODE_TEST_KEEP.includes(k), k).toBe(false);
  for (const k of ['HOODY_TOKEN', 'HOODY_API_KEY', 'AWS_SECRET_ACCESS_KEY', 'GITHUB_TOKEN', 'OPENROUTER_API_KEY', 'ANTHROPIC_API_KEY', 'HOME', 'USER', 'SSH_AUTH_SOCK', 'HUB_TOKEN', 'BUN_CONFIG_TOKEN']) expect(nodeTestKept(k, '1'), k).toBe(false);
  // A credential-looking value is dropped even under a kept name.
  expect(nodeTestKept('HOODY_PROVIDERS_JSON', '{"key":"hdy_abcdefghijklmnop"}')).toBe(false);
  expect(nodeTestKept('HUB_PAGE', 'keys')).toBe(true);
  expect(TEST_HOME_ROOT.endsWith('/.term-cache/test-homes')).toBe(true);
});

test('an inherited HOME is reused only when it is a real test home of this run', () => {
  fs.mkdirSync(root, { recursive: true });
  const other = path.join(root, 'home-1-abcdef');
  const elsewhere = path.join(root, '..', `elsewhere-${process.pid}`);
  try {
    // Another run's home (owner pid 1 is not our ancestor... it is init: use a pid that is surely not ours).
    const foreign = path.join(root, 'home-999999999-abcdef');
    fs.mkdirSync(foreign, { mode: 0o700 });
    expect(isolateNodeTestEnv({ HOME: foreign }, { root, own: false })).not.toBe(foreign);
    // A symlink named like a home, pointing elsewhere (the caller's real home, say).
    fs.mkdirSync(elsewhere, { recursive: true });
    const link = path.join(root, `home-${process.pid}-link`);
    fs.symlinkSync(elsewhere, link);
    expect(isolateNodeTestEnv({ HOME: link }, { root, own: false })).not.toBe(link);
    // Group/other-writable: not reused.
    const loose = path.join(root, `home-${process.pid}-loose`);
    fs.mkdirSync(loose); fs.chmodSync(loose, 0o777);
    expect(isolateNodeTestEnv({ HOME: loose }, { root, own: false })).not.toBe(loose);
    // A home of this process: reused.
    const mine = path.join(root, `home-${process.pid}-mine`);
    fs.mkdirSync(mine, { mode: 0o700 });
    expect(isolateNodeTestEnv({ HOME: mine }, { root, own: false })).toBe(mine);
    void other;
  } finally { fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(elsewhere, { recursive: true, force: true }); }
});
