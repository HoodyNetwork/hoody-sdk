// Vitest: Copy for an agent copies the in-computer CLI command that reads the
// note as Markdown, only when every id is shell-safe (a hostile id gives no command, never one cut short).
import { describe, expect, it } from 'vitest';
import { agentCommand } from './logic';

const C = 'c0a7150000000000000000a1';
const NB = 'b2c3d4e5f6a7b8c9d0e1f2a3';
const N = '0a1b2c3d4e5f6a7b8c9d0e1f';

describe('agentCommand', () => {
  it('is the CLI read of the note as Markdown on its computer', () => {
    expect(agentCommand(C, NB, N)).toBe(`hoody --computer ${C} notes document get --notebook-id ${NB} --node-id ${N} --format md`);
  });

  const hostile = ["c0a7'x", 'c0a7"x', 'c0a7$(rm -rf ~)', 'c0a7`id`', 'c0a7 x', 'c0a7\nx', 'c0a7;x', 'c0a7|x', 'c0a7&x', '-c0a7', '', 'C0A7\u0000', 'c0a7\u2028x'];
  it.each(hostile)('gives no command for a hostile computer id %j', (bad) => {
    expect(agentCommand(bad, NB, N)).toBeNull();
  });
  it.each(hostile)('gives no command for a hostile notebook or note id %j', (bad) => {
    expect(agentCommand(C, bad, N)).toBeNull();
    expect(agentCommand(C, NB, bad)).toBeNull();
  });
});
