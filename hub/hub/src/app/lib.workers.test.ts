// @vitest-environment node
// hub/scripts/lib.ts runPlaywright: '--workers 2' goes right after the subcommand and before the caller's args, which pass on
// untouched. Playwright keeps the last value of a non-variadic option, so a caller's worker
// option in any form overrides the default; real Playwright runs are the proof of that, these tests pin the argv shape.
import type * as ChildProcess from 'node:child_process';
import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';

const spawned: string[][] = [];
vi.mock('node:child_process', async (orig) => {
  const real = await orig<typeof ChildProcess>();
  return {
    ...real,
    spawn: (_cmd: string, argv: string[]) => {
      spawned.push(argv);
      const child = new EventEmitter();
      queueMicrotask(() => child.emit('exit', 0, null));
      return child;
    },
  };
});

const { playwrightArgv, runPlaywright } = await import('../../scripts/lib');

afterEach(() => {
  spawned.length = 0;
});

/** what runPlaywright hands playwright's cli.js: the spawn argv after `sh -c <script> <lock> <cli.js>` */
const passed = (argv: readonly string[]): string[] => argv.slice(argv.findIndex((a) => a.endsWith('cli.js')) + 1);

describe('runPlaywright worker default', () => {
  it("a caller's --workers 1 comes after the default, so it is the value playwright keeps", async () => {
    await runPlaywright(['test', '--config', 'x.config.ts', '--workers', '1']);
    expect(spawned).toHaveLength(1);
    expect(passed(spawned[0] ?? [])).toEqual(['test', '--workers', '2', '--config', 'x.config.ts', '--workers', '1']);
  });
  it('with no worker option of the caller the default, 2, is the only one', async () => {
    await runPlaywright(['test', 'a.spec.ts']);
    expect(passed(spawned[0] ?? [])).toEqual(['test', '--workers', '2', 'a.spec.ts']);
  });
});

describe('playwrightArgv: the default sits right after the subcommand, the caller args follow byte for byte', () => {
  const shapes: string[][] = [
    ['test'],
    ['test', '-j1'],
    ['test', '-j', '1'],
    ['test', '--workers=1'],
    ['test', '--workers', '01'],
    ['test', '--grep', '--workers'],
    ['test', 'a.spec.ts', '--', '--workers', 'x'],
    ['test', '--workers'],
    ['test', '--list', '--workers', '4'],
  ];
  for (const args of shapes) {
    it(JSON.stringify(args), () => {
      const out = playwrightArgv(args);
      expect(out.slice(0, 3)).toEqual([args[0], '--workers', '2']);
      expect(out.slice(3)).toEqual(args.slice(1));
    });
  }
  it('the caller array is not changed', () => {
    const args = Object.freeze(['test', '-j1']);
    expect(playwrightArgv(args)).toEqual(['test', '--workers', '2', '-j1']);
    expect(args).toEqual(['test', '-j1']);
  });
});
