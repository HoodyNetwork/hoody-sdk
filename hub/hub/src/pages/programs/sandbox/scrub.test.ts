// The program read goes through the secret route's scrub, which reduces it to facts and empties the raw answer in
// place: whatever core hands back (and anything that kept a reference to it) holds no environment value.
import { describe, expect, it, vi } from 'vitest';
import type * as core from '@core';
import { bootFixtureCore, queryClient } from '@core';
import { readFacts } from './data';
import { sandboxRulesFor } from './fixtures';
import { programSamples } from './samples';

const seen = vi.hoisted(() => ({ answers: [] as unknown[] }));
vi.mock('@core', async (orig) => {
  const real = await orig<typeof core>();
  return {
    ...real,
    api: async (...a: Parameters<typeof real.api>) => {
      const res = await real.api(...a);
      seen.answers.push(res);
      return res;
    },
  };
});

describe('readFacts', () => {
  it('keeps names and reasons only, and leaves the raw answer empty', async () => {
    bootFixtureCore({ rules: sandboxRulesFor({ program: { '7': programSamples.badEnv } }) });
    queryClient.clear();
    // No target: the call goes to the computer core shows.
    const facts = await readFacts('7', null);
    expect(facts?.env.map((e) => e.name).sort()).toEqual(['API_TOKEN', 'HOODY_SANDBOX_TEST', 'LD_PRELOAD', 'bad-name']);
    expect(seen.answers).toHaveLength(1);
    const raw = seen.answers[0] as { program?: Record<string, unknown> };
    expect(raw.program && Object.keys(raw.program)).toEqual([]);
    expect(JSON.stringify(seen.answers)).not.toContain('FAKE');
  });
});
