// Addresses of a computer's programs (https://<project>-<computer>-<program>-<n>.<server>.<proxy domain>).
// An address acts like a password: pages show it masked and copy it whole. Core's portAddress builds it (with the
// fixture-mode stand-in), the kit's AddressField shows it.
import { portAddress, routingNode } from '@core';
import { DESKTOP_ENV_ID, desktopDisplay, isDesktopNumber } from './desktop';
import { SLUG, type ProgramLink } from './logic';
import type { Computer } from './types';

/** The address of a program on a computer, or '' when the server or proxy domain is unknown (fixture builds: a stand-in). */
export function programUrl(c: Computer, program: ProgramLink): string {
  return portAddress({ id: c.project_id }, { id: c.id, server_name: routingNode(c) }, 1, SLUG[program]);
}

/** The address of instance 1 of a Hoody Kit program on a computer by its slug (links.ts KIT_PROGRAMS), or '' when the
 *  server or proxy domain is unknown (fixture builds: a stand-in). */
export function kitProgramUrl(c: Computer, slug: string): string {
  return portAddress({ id: c.project_id }, { id: c.id, server_name: routingNode(c) }, 1, slug);
}

/** A new temporary terminal of a computer: the `terminal-0` address with only `?ephemeral=true`, '' when the
 *  server or proxy domain is unknown (fixture builds: a stand-in). The proxy sets the terminal from the host
 *  (terminal-N forces terminal_id=N), so never terminal-1: `?ephemeral=true` there would make the shared terminal 1
 *  temporary. On terminal-0 the terminal kit starts a new session each time the page connects (a reload starts
 *  another) and, once no window shows it and it has been quiet for 60 s, closes it at its next 30 s sweep, killing
 *  only the shell (hoody-terminal's own idle sweep). */
export function temporaryTerminalUrl(c: Computer): string {
  const u = portAddress({ id: c.project_id }, { id: c.id, server_name: routingNode(c) }, 0, SLUG.terminal);
  if (!u) return '';
  try {
    const url = new URL(u);
    url.search = '';
    url.searchParams.set('ephemeral', 'true');
    return url.toString();
  } catch {
    return '';
  }
}

/** The address of desktop `n` of a computer (desktop.ts), built like every program address (core portAddress, the
 *  proxy's `desktop` service), from the computer's own ids and server only: never a server-given URL, no token. Its
 *  one query is `desktop_env`, only with an environment id the picker offered (DESKTOP_ENV_ID; anything else is left
 *  out): the environment a desktop that is not running starts with (a running one keeps its own). '' for a number
 *  out of range or when the server or proxy domain is unknown (fixture builds: a stand-in). */
export function desktopUrl(c: Computer, n: number, env?: string): string {
  if (!isDesktopNumber(n)) return '';
  const u = portAddress({ id: c.project_id }, { id: c.id, server_name: routingNode(c) }, n, 'desktop');
  if (!u || env === undefined || !DESKTOP_ENV_ID.test(env)) return u;
  try {
    const url = new URL(u);
    url.search = '';
    url.searchParams.set('desktop_env', env);
    return url.toString();
  } catch {
    return u;
  }
}

/** The display desktop `n` shows (1600 + n): the address the desktop address redirects to, where its viewer runs. */
export function desktopViewerUrl(c: Computer, n: number): string {
  if (!isDesktopNumber(n)) return '';
  return portAddress({ id: c.project_id }, { id: c.id, server_name: routingNode(c) }, desktopDisplay(n), 'display');
}

/** The address of an HTTP port on a computer ('' when the server or proxy domain is unknown; fixture builds: a stand-in). */
export function portUrl(c: Computer, port: number): string {
  return portAddress({ id: c.project_id }, { id: c.id, server_name: routingNode(c) }, port);
}
