// Public hrefs of the realms page: the only file other pages (and the shell's realm switcher) may import from here.
export const links = {
  /** New realm: a name, a colour and, if wanted, computers. */
  create: '/realms/new',
} as const;

/** The shell's realm-link key (shell/realmParam.tsx OPEN_REALM): a link carrying it makes the shell switch to that
 *  realm. Spelled out because pages cannot import the shell; shell/realmParam.test.tsx pins the two equal. ?realm= is
 *  the Computers page's own filter and never switches the realm. */
export const OPEN_REALM_KEY = 'open_realm';

/** The Computers page shown inside realm `id` (with `get`, its Get a computer drawer open there). */
export const computersIn = (id: string, get = false): string => `/computers?${get ? 'get=1&' : ''}${OPEN_REALM_KEY}=${encodeURIComponent(id)}`;
