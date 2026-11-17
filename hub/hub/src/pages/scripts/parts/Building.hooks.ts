// The Building section's IO source hook (split out of Building.tsx so the terminal build shares it; Building.tsx
// re-exports it).
import { liveBuildIO, fixtureBuildIO } from './Building.pure';
import type { BuildIO, FxBuilds } from './Building.pure';
import { fixtureModeActive } from '@core';
import { useMemo } from 'react';
import { useBuildsFixture, useContainersRead } from '../data';

/** The page's IO and containers answer: fixture mode reads the fixture state; live mode this browser and the containers query. */
export function useBuildSource(enabled: boolean): { io: BuildIO; computers: unknown; refetch?: () => unknown } {
  // The mode is fixed at boot, so every render runs the same hooks.
  const use = fixtureModeActive() ? useFixtureSource : useLiveSource;
  return use(enabled);
}
function useLiveSource(enabled: boolean): { io: BuildIO; computers: unknown; refetch: () => unknown } {
  const c = useContainersRead(enabled);
  return { io: liveBuildIO, computers: c.data, refetch: c.refetch };
}
const EMPTY: FxBuilds = { drafts: [], asks: [], computers: undefined };
function useFixtureSource(): { io: BuildIO; computers: unknown } {
  const fx = useBuildsFixture<FxBuilds>() ?? EMPTY;
  const io = useMemo(() => fixtureBuildIO(fx), [fx]);
  return { io, computers: fx.computers };
}
