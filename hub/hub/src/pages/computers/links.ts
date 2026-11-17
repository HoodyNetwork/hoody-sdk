// Public hrefs of the computers page: the only file other pages may import from this folder.
// A computer is addressed by its handle (name.last4), never by its full id.
export const links = {
  list: '/computers',
  servers: '/computers/servers',
  /** The Projects view, where a project's Computers tab deletes its expired computers. */
  projects: '/computers/projects',
  /** That server's panel in Servers, by its name (a computer's Overview links here). The key is read once and dropped,
   *  so no server id stays in the URL (parts/ServersView.tsx). */
  server: (name: string) => `/computers/servers?server=${encodeURIComponent(name)}`,
  item: (handle: string) => `/computers?sel=${encodeURIComponent(handle)}`,
  /** That computer's Connect tab, where its SSH key is set (the Account page's key list links here). The same URL
   *  Overview's Connect link opens (parts/Overview.tsx, use 'ssh'). */
  connect: (handle: string) => `/computers?sel=${encodeURIComponent(handle)}&tab=connect`,
  /** That computer's Desktop tab (its desktop in the Hub). */
  desktop: (handle: string) => `/computers?sel=${encodeURIComponent(handle)}&tab=desktop`,
  /** That computer's Programs tab (the Tunnels page's "no tunnel program" state links here). */
  programs: (handle: string) => `/computers?sel=${encodeURIComponent(handle)}&tab=programs`,
  /** That computer's Ports & addresses tab, where its access rules and published ports live. */
  ports: (handle: string) => `/computers?sel=${encodeURIComponent(handle)}&tab=ports`,
  /** That computer's Permissions tab: who can open its programs, its project's people, its realms, the firewall reminder. */
  permissions: (handle: string) => `/computers?sel=${encodeURIComponent(handle)}&tab=permissions`,
  /** That computer's Network tab with its Firewall section in view and focused (the key `at` is dropped once read). */
  firewall: (handle: string) => `/computers?sel=${encodeURIComponent(handle)}&tab=network&at=firewall`,
  /** The Get a computer drawer, opened (the key is dropped once read). */
  create: '/computers?new=1',
  /** The same drawer from the shell's Get a computer link (the key is dropped once read). */
  get: '/computers?get=1',
  /** The alias drawer of a computer (the key is dropped once read): for one port (Programs' per-port Create alias), or with
   *  no port, where the person types any port (`alias=new`: Programs' Create alias on its Aliases and domains section). */
  alias: (handle: string, port?: number) => `/computers?sel=${encodeURIComponent(handle)}&alias=${port === undefined ? 'new' : encodeURIComponent(String(port))}`,
} as const;

/** A Hoody Kit program a computer offers a link to: its key (the program.* string), its slug in a program address
 *  (https://<project>-<computer>-<slug>-<n>.<server>.<domain>), and how it is used: 'open', a page to open in a
 *  browser; 'code', an API with no page of its own, offered to copy only. */
export interface KitProgram {
  readonly key: string;
  readonly slug: string;
  readonly use: 'open' | 'code';
}

/** Every Hoody Kit program a computer's Connect tab links to, in the order shown. The Guide's Every link reads the same
 *  list. Left out on purpose: the control plane (daemon), plumbing (run, tunnel, logs, egress, cdp, d-tcp) and the
 *  desktop alias (the Desktop tab opens desktops). */
export const KIT_PROGRAMS = [
  { key: 'agent', slug: 'agent', use: 'open' },
  { key: 'terminal', slug: 'terminal', use: 'open' },
  { key: 'screen', slug: 'display', use: 'open' },
  { key: 'files', slug: 'files', use: 'open' },
  { key: 'browser', slug: 'browser', use: 'open' },
  { key: 'code', slug: 'code', use: 'open' },
  { key: 'notes', slug: 'notes', use: 'open' },
  { key: 'workspaces', slug: 'workspaces', use: 'open' },
  { key: 'sqlite', slug: 'sqlite', use: 'open' },
  { key: 'pipe', slug: 'pipe', use: 'open' },
  { key: 'cron', slug: 'cron', use: 'open' },
  { key: 'notifications', slug: 'notifications', use: 'open' },
  { key: 'exec', slug: 'exec', use: 'code' },
  { key: 'curl', slug: 'curl', use: 'code' },
  { key: 'watch', slug: 'watch', use: 'code' },
] as const satisfies readonly KitProgram[];

export type KitProgramKey = (typeof KIT_PROGRAMS)[number]['key'];
