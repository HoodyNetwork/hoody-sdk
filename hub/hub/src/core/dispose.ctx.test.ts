// dispose.ts: work captured by a disposed session stays dead, even when the next mount boots the same session.
import { describe, expect, it } from 'vitest';
import { alive, capture, gen } from './ctx';
import { disposeCoreSession } from './dispose';
import { boot } from './test/env';

describe('a context from before a dispose', () => {
  it('is dead after the dispose and stays dead when the next mount boots the same session', async () => {
    boot();
    const a = capture();
    expect(alive(a)).toBe(true);
    await disposeCoreSession('term-abort');
    expect(alive(a)).toBe(false);
    boot(); // mount B: the same account, the same stored session
    const b = capture();
    expect(alive(b)).toBe(true);
    expect(alive(a)).toBe(false);
  });
  it('the generation only moves forward across a dispose', async () => {
    boot();
    const before = gen();
    await disposeCoreSession('term-quit');
    expect(gen()).toBeGreaterThan(before);
  });
});
