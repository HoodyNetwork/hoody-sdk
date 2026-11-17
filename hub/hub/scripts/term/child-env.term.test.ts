// Gate children get a minimal env (child-env.ts): the run basics and the gates' own knobs, never anything else.
import { describe, expect, test } from 'bun:test';
import { childEnv } from './child-env';

describe('child env', () => {
  test('keeps the run basics and the gate knobs, drops everything else, forces NODE_ENV=test', () => {
    const from = { PATH: '/bin', HOME: '/h', NODE_ENV: 'development', HOODY_TOKEN: 'hdy_x', DB_STORAGE: '/real.sqlite', AWS_SECRET_ACCESS_KEY: 's', TERM_SETTLE_STILL: '3', HUB_CACHE_DIR: '/c', UPDATE_GOLDEN: '1' };
    const { BUN_OPTIONS, NODE_OPTIONS, HUB_NET_FENCE, ...rest } = childEnv({ FORCE_COLOR: '0' }, { ...from, BUN_OPTIONS: '--smol', NODE_OPTIONS: '--inspect', HUB_NET_FENCE: 'test' });
    expect(rest).toEqual({ PATH: '/bin', HOME: '/h', TERM_SETTLE_STILL: '3', HUB_CACHE_DIR: '/c', UPDATE_GOLDEN: '1', NODE_ENV: 'test', FORCE_COLOR: '0' });
    // The network fence follows every Bun and Node child (net-policy guardEnv); the caller's options are not passed on.
    expect(BUN_OPTIONS).toMatch(/^--preload=\/\S+\/scripts\/term\/net-guard-runner\.ts$/);
    expect(NODE_OPTIONS).toMatch(/^--import \/\S+\/scripts\/term\/net-guard-node\.mjs$/);
    expect(HUB_NET_FENCE).toBe('runner');
  });

  test('named keys only: prefix survivors, startup hooks and credential-looking values dropped', () => {
    const env = childEnv({}, { PATH: '/bin', HOME: '/h', HUB_TOKEN: 'SENTINEL-env', BUN_CONFIG_TOKEN: 'SENTINEL-env', TERM_SECRET: 'SENTINEL-env',
      BASH_ENV: '/x/rc', 'BASH_FUNC_ls%%': '() { :; }', LD_PRELOAD: '/x.so', HUB_PAGE: 'hdy_abcdefghijklmnopq', TERMSHOT: 'a.png', HUB_GATE_SLOT_HELD: '1' });
    expect(JSON.stringify(env)).not.toContain('SENTINEL');
    for (const k of ['BASH_ENV', 'BASH_FUNC_ls%%', 'LD_PRELOAD', 'HUB_PAGE']) expect(env[k], k).toBeUndefined();
    expect(env).toMatchObject({ PATH: '/bin', HOME: '/h', TERMSHOT: 'a.png', HUB_GATE_SLOT_HELD: '1' });
  });
});
