// The terminal Hub's demo entry: the sample account of `hoody hub --demo` (app/boot.demo.ts). The live entry never
// reaches this file; a client without the demo mark is refused here, so a real account can never get the demo boot.
import { demoBoot, isDemoClient } from './app/boot.demo';
import { mountWith, type MountExtras } from './entry.live';
import type { HubTermOptions, Receipt } from './host-types';

export { DEMO_CLIENT, DEMO_PROXY_DOMAIN } from './app/boot.demo';

export function mountDemoHub(o: HubTermOptions & MountExtras): Promise<Receipt> {
  if (!isDemoClient(o.client)) return Promise.reject(new Error('TERM_DEMO_CLIENT_REQUIRED'));
  // The sample account lives in memory only: its realm selection and marks are written to the mount's store
  // (boot.demo.ts), so a demo mount handed a store directory would write sample choices into a real account's files.
  if ((o as { store?: unknown }).store !== undefined) return Promise.reject(new Error('TERM_DEMO_NO_STORE: the demo keeps nothing on disk'));
  if (o.diagnosticDetail) return Promise.reject(new Error('TERM_DETAIL_DEV_ONLY: diagnosticDetail is for development mounts (the fixture entry), never a host mount'));
  return mountWith({ ...o, strictGlobals: o.strictGlobals !== false }, (route) => demoBoot(o.client, o.context, () => route.path));
}
