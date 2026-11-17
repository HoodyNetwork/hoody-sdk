// appStart.ts: the standalone Hub opened from a saved session (boot.ts 'app'). The Hoody's `hub_file_min`
// (GET /api/v1/hub/config, one read without credentials, bounded by readHubConfig's timeout) is read first; only then
// does the Hub load.
//
// Contract:
//   - One read of the chosen Hoody only, before any of the Hub loads: the Hub's boot uses the stored session (refresh,
//     signed-in reads, the passcode gate, shortcuts), so a file the Hoody refuses must not start it at all.
//   - Below the floor: `showOld` (OldFile.tsx) shows the out-of-date card; the Hub is never loaded, the session is
//     kept, nothing is purged and nothing else is sent.
//   - No floor (an older Hoody), a floor at or below this build, no answer, a timeout or a failed read: the Hub loads
//     as before. A Hoody that cannot be reached cannot keep a working file shut.
import { type HubConfigRead, type StandaloneApi } from '@core/origin';
import { fileTooOld } from './build';

export interface AppStartDeps {
  read: (origin: string) => Promise<HubConfigRead>;
  loadHub: () => Promise<unknown>;
  showOld: (floor: number) => void;
}

/** Reads the floor, then loads the Hub ('hub') or shows the old-file screen ('old'). */
export async function startApp(api: StandaloneApi, deps: AppStartDeps): Promise<'hub' | 'old'> {
  const floor = await deps.read(api.origin).then(
    (r) => (r.ok && r.fileMin !== null && fileTooOld(r.fileMin) ? r.fileMin : null),
    () => null,
  );
  if (floor !== null) {
    deps.showOld(floor);
    return 'old';
  }
  await deps.loadHub();
  return 'hub';
}
