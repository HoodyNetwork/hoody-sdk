// The shortcut list matches the handler (keys.ts).
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ASK_ENABLED, setAskForFixtures } from '@kit/ask';
import { JUMPS } from './keys';
import { TABLE, useShortcuts } from './shortcuts';

describe('shortcuts', () => {
  it('the Go to rows are exactly the g-jumps keys.ts handles', () => {
    const go = TABLE.find((g) => g.id === 'go')?.rows ?? [];
    expect(go.map((r) => r.keys.join(' ')).sort()).toEqual(Object.keys(JUMPS).map((k) => `g ${k}`).sort());
    for (const r of go) expect(r.msg.toLowerCase()).toBe(`keys.go${JUMPS[r.keys[1] ?? '']}`.toLowerCase());
  });
  it('is translated, with Mod resolved', () => {
    const { result } = renderHook(() => useShortcuts());
    const all = result.current.flatMap((g) => g.rows);
    expect(result.current.map((g) => g.title)).toEqual(['Everywhere', 'Go to', 'Lists and tables']);
    // The ⌘J row follows the Ask switch, on by default.
    expect(ASK_ENABLED).toBe(true);
    expect(all.some((r) => r.label === 'Open or close Agent')).toBe(true);
    expect(all.some((r) => r.keys.some((k) => k.includes('Mod')))).toBe(false);
  });
  it('lists ⌘J when Ask is on', () => {
    setAskForFixtures(true);
    const { result } = renderHook(() => useShortcuts());
    setAskForFixtures(false);
    expect(result.current.flatMap((g) => g.rows).find((r) => r.label === 'Open or close Agent')?.keys[0]).toMatch(/^(⌘|Ctrl) J$/);
  });
});
