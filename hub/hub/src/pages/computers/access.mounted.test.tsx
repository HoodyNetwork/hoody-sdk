// The people panel's "still open" mark (parts/AccessPeople.tsx useMounted): StrictMode mounts, unmounts and mounts
// again in development; the mark must read open after that, or a run would stop before its first step (found by the
// shots: the browser build runs under StrictMode, the page tests don't).
import { render } from '@testing-library/react';
import { StrictMode, useEffect } from 'react';
import { describe, expect, it } from 'vitest';
import { useMounted } from './parts/AccessPeople';

describe('computers: access, the people panel knows it is still open', () => {
  it('open after StrictMode remounts it, closed once really unmounted', () => {
    const seen: { current: boolean }[] = [];
    function Probe() {
      const alive = useMounted();
      useEffect(() => { seen.push(alive); }, [alive]);
      return null;
    }
    const r = render(<StrictMode><Probe /></StrictMode>);
    expect(seen.at(-1)?.current).toBe(true);
    r.unmount();
    expect(seen.at(-1)?.current).toBe(false);
  });
});
