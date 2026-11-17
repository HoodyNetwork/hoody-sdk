// The skills requests of AI → Knowledge → Skills, declared once with core's defineRoute. Both go to
// the computer's agent in the realm named by the call (the top bar's; never All realms: core refuses that unsent). Knowledge
// has no folder, so no X-Hoody-Cwd is sent: the agent lists its own project root, your skills and the settings root.
// The Skill Hub and import. Searching, previewing and scanning read no realm (the hub cache and the other tools'
// skill folders have none: the agent refuses a realm on them); installing and importing write into the realm's skills.
import { defineRoute } from '@core';

export const skillRoutes = {
  /** Every SKILL.md across the roots (shadowed and broken ones included), with its on/off and trust state. limit 0 = all. */
  list: defineRoute({ method: 'GET', path: '/skills', scope: 'agent', realm: 'realm', query: ['page', 'limit'] }),
  /** The same list as a chat's folder sees it (X-Hoody-Cwd: that folder's project skills too): the composer's "/" menu. */
  listIn: defineRoute({ method: 'GET', path: '/skills', scope: 'agent', realm: 'realm', cwd: true, query: ['page', 'limit'] }),
  /** On/off by the effective skill NAME (a shadowed copy has no switch of its own). Sets the value, so it never flips blindly;
   *  it never changes trust (enable differs from trust). Refused before any write: not_found (disabling a name no
   *  root holds, or a realm this login does not serve) and service_unavailable (the agent too busy to take it). A 500
   *  store_failed stays unknown: a settings write that failed late may still have landed. */
  /** One skill's SKILL.md as installed (its own bytes, header included), by the folder's root and name under it. */
  source: defineRoute({ method: 'GET', path: '/skills/source', scope: 'agent', realm: 'realm', query: ['root_dir', 'rel_dir'] }),
  toggle: defineRoute<unknown, { name: string; disabled: boolean }>({ method: 'POST', path: '/skills/toggle', scope: 'agent', realm: 'realm', body: ['name', 'disabled'], refuses: ['not_found', 'service_unavailable'] }),
  /** Search the remote skill hub (a fresh cached answer is served first; `degraded` when the live search failed and an
   *  older cached one is shown). */
  hubSearch: defineRoute({ method: 'GET', path: '/skills/hub/search', scope: 'agent', realm: 'none', query: ['query'] }),
  /** One hub skill before install: its SKILL.md body, frontmatter, commands and files, and the digest that installs exactly
   *  this package. A first preview fetches it from its source (the agent waits up to 30 s, then caches it). */
  hubPreview: defineRoute({ method: 'GET', path: '/skills/hub/preview', scope: 'agent', realm: 'none', query: ['provider', 'source', 'skill_id'], timeoutMs: 125000 }),
  /** Install the previewed package (by its digest; never fetched again). It lands off and not trusted. Every refusal the
   *  agent answers (400: preview again, already installed, no skills folder, an unsafe file) comes before the publish or
   *  after its rollback: definite. A 500 stays unknown. */
  hubInstall: defineRoute<unknown, { package_digest: string; overwrite: boolean }>({
    method: 'POST', path: '/skills/hub/install', scope: 'agent', realm: 'realm', body: ['package_digest', 'overwrite'], refuses: ['bad_request'],
  }),
  /** The skills in another tool's folder on the computer (claude: ~/.claude/skills; codex: ~/.codex/skills and its built-ins). */
  importScan: defineRoute({ method: 'GET', path: '/skills/import/scan', scope: 'agent', realm: 'none', query: ['source'] }),
  /** Copy scanned skills in (the agent finds each folder again from source + rel_dir; no path is sent). Each lands off and not
   *  trusted. The page sends one skill per request. A 400 refuses the whole request before any copy; each item's own
   *  failure comes back in a 200. */
  importApply: defineRoute<unknown, { source: string; items: readonly { source: string; rel_dir: string }[]; overwrite: boolean }>({
    method: 'POST', path: '/skills/import/apply', scope: 'agent', realm: 'realm', body: ['source', 'items', 'overwrite'], refuses: ['bad_request'],
  }),
} as const;
