// The agent's settings routes of Rules & safety, declared once with core's defineRoute.
//   - Agent features are process-wide: the agent refuses any realm or folder (400 realm_scope_unsupported), so the
//     routes send none (realm 'none'). The PATCH sends only the names it changes; a name the agent may not change is
//     403 settings_key_protected and its own admin check is 403 admin_unauthorized, both before anything is written.
//     No compare-and-swap: it sets a value, it does not flip one.
//   - Where agents may work is read only, per realm and folder (X-Hoody-Cwd). Without a folder the agent reads the
//     folder it was started in, so the page never sends it without one (data.ts).
import { defineRoute } from '@core';

export const featureRoutes = {
  /** {features: [{name, value, default, set, writable}]} in display order. 500 store_failed: the values are unknown. */
  features: defineRoute({ method: 'GET', path: '/settings/features', scope: 'agent', realm: 'none' }),
  setFeatures: defineRoute<unknown, { features: Record<string, boolean> }>({
    method: 'PATCH', path: '/settings/features', scope: 'agent', realm: 'none', body: ['features'],
    refuses: ['settings_key_protected', 'admin_unauthorized'],
  }),
  /** {allowed_directories, deny_paths, deny_paths_hidden}. 500 store_failed / 503 restriction_unknown: the lists are unknown. */
  where: defineRoute({ method: 'GET', path: '/settings/where-agents-work', scope: 'agent', realm: 'realm', cwd: true }),
} as const;
