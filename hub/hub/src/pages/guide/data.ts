// The guide page's data: the live facts that fill commands and addresses, read through @core
// (the computer list of the shown realm, the realm view, the proxy domain from the agent base
// address), and the topics other pages contribute through their manifests.
import { agentBaseFor, computersPage, computerState, containersRoute as coreContainersRoute, pickComputer, stringOrEmpty as str, useCurrentComputer, useRealms, type ComputerRow } from '@core';
import { countryFlag, useContributions } from '@kit';
import { currentPlatformHosts } from '@kit';
import { useCallback, useMemo } from 'react';
import type { GuideFacts } from './logic';

/** The documentation base: a fixed product URL (https only). */
const DOCS_BASE = 'https://docs.hoody.com';

interface RawComputer {
  id?: unknown;
  name?: unknown;
  status?: unknown;
  project_id?: unknown;
  realm_ids?: unknown;
  server_name?: unknown;
  ssh_hostname?: unknown;
  server?: { city?: unknown; country?: unknown } | null;
}

// The one containers route of core: the shell's own list read and this page's share it, so fixture states and the cache see one read.
export const containersRoute = coreContainersRoute;

// The countries a server's flag is shown for (the flag itself is kit countryFlag: the emoji on the web, the code in a
// terminal, where the emoji is two cells wide and font-dependent).
const FLAGGED: ReadonlySet<string> = new Set(['SG', 'DE', 'US', 'FR', 'GB', 'NL', 'FI', 'JP', 'CA', 'AU']);
const flagOf = (country: string): string | undefined => (FLAGGED.has(country) ? countryFlag(country) : undefined);

// The computers list is core's computersPage (the shell's read, one cache entry): a body without a list is a read error, never
// "no computers", and `complete` is the whole list (totalPages <= 1, else fewer than 100 rows).
const rowsOf = (wire: readonly unknown[]): RawComputer[] => wire.filter((x): x is RawComputer => !!x && typeof (x as RawComputer).id === 'string');

/**
 * The rows the shown realm holds. With realm host scoping off the list is the whole account's: core's one rule
 * (pickComputer answers a row asked for by its own id only when the realm holds it) filters it, as Home and the
 * shell's picker do.
 */
function inRealm(rows: readonly RawComputer[], realm: string): RawComputer[] {
  return rows.filter((r) => {
    const c: ComputerRow = { id: String(r.id), status: r.status, project_id: typeof r.project_id === 'string' ? r.project_id : '', realm_ids: Array.isArray(r.realm_ids) ? r.realm_ids.filter((x): x is string => typeof x === 'string') : [] };
    return pickComputer([c], { realm, remembered: c.id }) === c;
  });
}


export interface GuideFactsResult {
  data: GuideFacts | undefined;
  isPending: boolean;
  error: unknown;
  refetch: () => Promise<unknown>;
}

export function useGuideFacts(): GuideFactsResult {
  const list = computersPage.use(undefined);
  const realms = useRealms();
  const current = useCurrentComputer();
  // Whole is the page's own answer, before the realm filter: a realm whose other computers sit beyond page 1 is not whole.
  const rows = useMemo(() => (list.data ? inRealm(rowsOf(list.data.rows), realms.selected) : undefined), [list.data, realms.selected]);
  const whole = list.data?.complete === true;

  const data = useMemo<GuideFacts | undefined>(() => {
    if (!rows) return undefined;
    const row = realms.rows?.find((r) => r.id === realms.selected);
    const all = realms.selected === 'all';
    const name = row && 'text' in row.name ? row.name.text : '';
    // The one computer is the shown one only when the list is whole (another may sit on a later page).
    const pick = rows.find((c) => c.id === current?.container.id) ?? (rows.length === 1 && whole ? rows[0] : undefined);
    let domain = '';
    let computer: GuideFacts['computer'] = null;
    if (pick) {
      const id = str(pick.id);
      const project = str(pick.project_id);
      const node = str(pick.server_name);
      // The agent address is <project>-<computer>-agent-1.<node>.<domain>: the domain is what follows the node.
      const base = agentBaseFor({ id: project }, { id, server_name: node });
      try {
        domain = new URL(base).hostname.split('.').slice(2).join('.');
      } catch {
        domain = '';
      }
      const city = str(pick.server?.city);
      computer = {
        id,
        name: str(pick.name) || id.slice(0, 8),
        project,
        node,
        serverName: city ? `${node} ${city}` : node,
        flag: flagOf(str(pick.server?.country).toUpperCase()),
        running: computerState(pick.status) === 'running',
        ssh: str(pick.ssh_hostname) || undefined,
      };
    }
    // Bots are read by their own page; here "no Bot yet" is the safe reading (the line asks to make one).
    return { known: true, computer, domain, botLabel: null, docsBase: DOCS_BASE, realm: { name, all }, hosts: currentPlatformHosts() };
  }, [rows, whole, realms, current]);

  const refetch = useCallback(() => list.refetch(), [list]);
  // A failed refetch keeps the last rows: a computer they show stays, but "no computer" is never read from them, so the read
  // error shows with Try again instead.
  const error = !rows ? list.error : list.isError && !data?.computer ? list.error : null;
  return { data, isPending: list.isPending, error, refetch };
}

/** A topic a page contributes through its manifest (`guide: [...]`). */
export interface GuideTopic {
  pageId: string;
  pageTitle: string;
  id: string;
  title: string;
  body: string;
}

export function useGuideTopics(): { data: GuideTopic[]; isPending: false } {
  const { guideTopics } = useContributions();
  const data = useMemo(
    () => guideTopics.map((g) => ({ ...g })),
    [guideTopics],
  );
  return { data, isPending: false };
}
