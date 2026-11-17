// Every request the computers page may make, declared once. Nothing leaves the page except through a
// route declared here (core refuses anything else unsent).
import { REALM_LIMIT_CODE, accountContainersRoute, aliasRoutes, computerLifecycleRoute, computerRuntimeRoute, containersRoute, defineRoute, freeTierRoute, myIpRoute, probeRoute, programRoutes, redeemRoute, retrySetupRoute, serversRoute, subsListRoute } from '@core';

const CREATE_BODY = [
  'name', 'server_id', 'computer_image', 'ssh_public_key', 'comment', 'color', 'realm_ids', 'hoody_kit',
  'dev_kit', 'ai', 'ramdisk', 'autostart', 'kvm', 'environment_vars',
] as const;

/** Codes a create refusal may keep: environment values are secrets, so every other text is rebuilt. */
export const CREATE_CODES = ['COMPUTER_NAME_IN_USE', 'SSH_PUBLIC_KEY_IN_USE', 'SERVER_COMPUTER_LIMIT', 'PROJECT_COMPUTER_LIMIT', 'ENV_BLOCK_TOO_LARGE', 'ENV_UNREPRESENTABLE', REALM_LIMIT_CODE] as const;

export const routes = {
  // reads
  list: containersRoute,
  // The account's computers in every realm (base host): an empty realm's "add one from another realm" picker.
  accountList: accountContainersRoute,
  projects: probeRoute,
  read: defineRoute({ method: 'GET', path: '/computers/:id', scope: 'base' }),
  // A chat's local address reads the same route through core's computerRuntime (core/computerRuntime.ts).
  runtime: computerRuntimeRoute,
  stats: defineRoute({ method: 'GET', path: '/computers/:id/stats', scope: 'realm' }),
  projectStats: defineRoute({ method: 'GET', path: '/projects/:pid/stats', scope: 'realm' }),
  servers: serversRoute,
  // The account's servers' AI use (the Servers cards' footer; Billing reads the same answer).
  aiUsage: defineRoute({ method: 'GET', path: '/users/me/free-ai-usage', scope: 'base' }),
  subscriptions: subsListRoute,
  freeTier: freeTierRoute,
  // The computer's own access rules (who can open its programs). The answer holds the groups' credentials in
  // clear: secret, and the page keeps only parts/access.logic.ts's projection of it.
  accessRules: defineRoute({ method: 'GET', path: '/computers/:id/proxy/permissions', scope: 'realm', secret: true }),
  // The address this page's Hoody API sees (the access drawer's "Only my IP").
  myIp: myIpRoute,
  // changes (never retried, never resent: a lost answer is read back)
  lifecycle: computerLifecycleRoute,
  rename: defineRoute({ method: 'PUT', path: '/computers/:id', scope: 'realm', body: ['name'] }),
  setColour: defineRoute({ method: 'PUT', path: '/computers/:id', scope: 'realm', body: ['color'] }),
  // A set that adds a realm the account does not use yet may be refused by the account's Realm limit (a refusal: nothing changed).
  setRealms: defineRoute({ method: 'PUT', path: '/computers/:id', scope: 'base', body: ['realm_ids'], codes: [REALM_LIMIT_CODE] }),
  setSshKey: defineRoute({ method: 'PUT', path: '/computers/:id', scope: 'realm', body: ['ssh_public_key'] }),
  copy: defineRoute({ method: 'POST', path: '/computers/:id/copy', scope: 'realm', body: ['name', 'target_project_id', 'target_server_id'] }),
  remove: defineRoute({ method: 'DELETE', path: '/computers/:id', scope: 'realm' }),
  // The same delete on the base host (every realm), for an expired computer in a project's Computers tab: that tab reads
  // the base host, and an expired computer may be in no realm the top bar shows.
  removeBase: defineRoute({ method: 'DELETE', path: '/computers/:id', scope: 'base' }),
  create: defineRoute({
    method: 'POST', path: '/projects/:pid/computers', scope: 'realm', body: CREATE_BODY,
    secret: true, codes: CREATE_CODES,
  }),
  redeem: redeemRoute,
  retrySetup: retrySetupRoute,
  // the computer's own terminal program: one raw command, once, on pipes, in the folder `cwd` (always sent: without it
  // the program starts from its own default folder, not /). Its refusals of that folder come before anything runs.
  execute: defineRoute({
    method: 'POST', path: '/api/v1/terminal/execute', scope: 'kit', kit: 'terminal', index: 0, query: ['ephemeral'],
    body: ['command', 'mode', 'wait', 'timeout', 'cwd'], maxBytes: 1 << 20, timeoutMs: 75000,
  }),
  // the computer's own terminal program: its session list, read for the Desktop tab's desktops (desktop.ts desktopsOf)
  desktopSessions: defineRoute({ method: 'GET', path: '/api/v1/terminal/sessions', scope: 'kit', kit: 'terminal', index: 0, maxBytes: 4 << 20, timeoutMs: 15000 }),
  // The environments the terminal program offers for a desktop (a program without the route answers 404
  // and the Desktop tab offers desktop.ts DESKTOP_ENVS_FALLBACK).
  desktopEnvs: defineRoute({ method: 'GET', path: '/api/v1/system/desktop-envs', scope: 'kit', kit: 'terminal', index: 0, maxBytes: 64 << 10, timeoutMs: 15000 }),
  // Stop desktop, step 1: stop display 1600 + N and everything on it (the program answers once it is gone: up to 25 s
  // waiting for a screenshot, then 10 s before SIGKILL). Never retried, never resent by itself.
  displayStop: defineRoute({ method: 'POST', path: '/api/v1/system/displays/:display/stop', scope: 'kit', kit: 'terminal', index: 0, timeoutMs: 45000 }),
  // Stop desktop, step 2: end desktop N's session (terminal 1600 + N, on its own terminal-N host), only the shell the
  // session list showed (?incarnation=). Without it the desktop's address would find the session still there and wait
  // for a display nobody starts (hoody-terminal's display redirect starts a desktop only with its session).
  desktopEnd: defineRoute({ method: 'DELETE', path: '/api/v1/terminal/:n', scope: 'kit', kit: 'terminal', index: (n: number) => n >= 1601 && n <= 9999, query: ['incarnation'], timeoutMs: 15000 }),
  // the computer's daemon: programs (the Programs tab)
  programsOverview: programRoutes.overview,
  programStart: programRoutes.start,
  programStop: programRoutes.stop,
  programRestart: programRoutes.restart,
  // A restart's receipt by its idempotency key (reads only): the one proof that a held restart applied.
  programRestartReceipt: programRoutes.restartReceipt,
  aliases: aliasRoutes.list,
  aliasCreate: aliasRoutes.create,
  aliasRemove: aliasRoutes.remove,
  // Edit an alias: its name, or the port an http/https alias goes to (core's alias edit; PATCH only, the API serves no
  // PUT here). Only the changed keys are sent; a port sent alone keeps the alias's stored program (http stays http, https
  // stays https).
  aliasEdit: aliasRoutes.edit,
  programBoot: programRoutes.boot,
  // projects (the Projects view): name and colour only. Never realm_ids here: a realm change is a credential
  // question the API guards separately. The API refuses to delete a project that still holds computers (422
  // PROJECT_HAS_COMPUTERS); the Hub never sends its opt-in to delete them too. The page counts first, account-wide
  // (base: a project is the same in every realm view), so the dialog can say why before anything is sent. A lost
  // delete answer is checked by reading the project itself on the base host: only its 404 proves the delete.
  // A project made in a realm the account does not use yet may be refused by the account's Realm limit.
  projectCreate: defineRoute({ method: 'POST', path: '/projects', scope: 'realm', body: ['alias', 'color'], codes: [REALM_LIMIT_CODE] }),
  projectUpdate: defineRoute({ method: 'PUT', path: '/projects/:pid', scope: 'realm', body: ['alias', 'color'] }),
  projectRemove: defineRoute({ method: 'DELETE', path: '/projects/:pid', scope: 'realm' }),
  projectComputers: defineRoute({ method: 'GET', path: '/projects/:pid/computers', scope: 'base', query: ['page', 'limit', 'include_expired', 'include_deleting'] }),
  // Also names a listed computer's project that the realm's own list lacks: that list holds only projects tagged with
  // the realm, while a computer's realms are its own (read only for such a project).
  project: defineRoute({ method: 'GET', path: '/projects/:pid', scope: 'base' }),
  // A project's people: every membership row with its account's username and alias. Base host, like the project
  // read above (a project is the same in every realm view); never sent on a shared-key session (projectPerms.logic.ts).
  members: defineRoute({ method: 'GET', path: '/projects/:pid/permissions', scope: 'base', query: ['page', 'limit'] }),
  // Its people changed: add one account (exactly one of user_id or username), change a member's level, remove
  // them. Base host only, like the read: the server refuses them on a realm-scoped URL or a realm-limited key.
  memberAdd: defineRoute({ method: 'POST', path: '/projects/:pid/permissions', scope: 'base', body: ['user_id', 'username', 'permission_level'] }),
  memberSet: defineRoute({ method: 'PUT', path: '/projects/:pid/permissions/:mid', scope: 'base', body: ['permission_level'] }),
  memberRemove: defineRoute({ method: 'DELETE', path: '/projects/:pid/permissions/:mid', scope: 'base' }),
  // A project's access rules: the document every computer in it inherits. It holds the groups' passwords and
  // keys, so it is secret (never cached raw: data.ts keeps rulesFrom only) and framed pages never send it
  // (public/auth/shared.js FRAMED_SENSITIVE_ROUTES). Base host only: the server refuses it on a realm-scoped URL.
  projectRules: defineRoute({ method: 'GET', path: '/projects/:pid/proxy/permissions', scope: 'base', secret: true }),
  // Changed: the whole document (Only my IP, Private) or none at all (No project rules), each against the
  // version read (If-Match). Secret, framed-refused and base host only, like the read.
  projectRulesSet: defineRoute({ method: 'PUT', path: '/projects/:pid/proxy/permissions', scope: 'base', secret: true, ifMatch: true, body: ['project', 'groups', 'permissions', 'default', 'enable_proxy'] }),
  projectRulesClear: defineRoute({ method: 'DELETE', path: '/projects/:pid/proxy/permissions', scope: 'base', ifMatch: true }),
} as const;
