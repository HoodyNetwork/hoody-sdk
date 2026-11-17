// Vitest: the live source of Being built reads the computers list only while the
// section is shown. On New script (enabled false) the containers query is asked with enabled: false, so that view reads only
// its own computer's answers.
import { renderHook } from '@app/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const asked = vi.hoisted(() => [] as boolean[]);
vi.mock('@core', async (orig) => ({ ...(await orig<Record<string, unknown>>()), fixtureModeActive: () => false }));
vi.mock('./data', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useContainersRead: (enabled: boolean) => { asked.push(enabled); return { data: undefined, refetch: () => undefined }; },
}));

import { useBuildSource } from './parts/Building';

beforeEach(() => { asked.length = 0; });

describe('the live source of Being built', () => {
  it('asks for the computers with the section shown, and never while it is not', () => {
    const r = renderHook(({ on }: { on: boolean }) => useBuildSource(on), { initialProps: { on: false } });
    expect(asked.length).toBeGreaterThan(0);
    expect(asked.every((x) => x === false)).toBe(true);
    asked.length = 0;
    r.rerender({ on: true });
    expect(asked.length).toBeGreaterThan(0);
    expect(asked.every((x) => x === true)).toBe(true);
  });
});
