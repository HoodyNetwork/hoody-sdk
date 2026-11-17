// New chat's own reads: Claude Code on the computer (GET /acp/agents) and the realm's default backend
// (GET /acp/default, only on an agent that reports the capability), for Runs with; the folders chats ran in
// (GET /sessions/cwds), with whether that read answered. The agents and the tool catalogue come from the Agents screen's
// sources (agents/data.ts, agents/toolsData.ts). Read-only: nothing here sends.
import { coreSource, providers, type Target } from '@core';
import { useMemo } from 'react';
import { claudeOf } from '../logic';
import { acpWire, foldersOf, homeOf, parseAcpAgents } from './logic';
import { chatRoutes } from '../parts/data';
import { routes } from '../routes';
import type { ClaudeCode, Settled } from '../types';

const realmInput = (realm: string) => ({ realm });
type Cwds = { folders: string[]; home: string | null };

const source = coreSource('ai-new', {
  reads: {
    version: { route: routes.version },
    acp: { route: routes.acp, input: realmInput },
    acpDefault: { route: routes.acpDefault, input: realmInput },
    cwds: {
      route: chatRoutes.cwds,
      input: (p: { target: Target; realm: string }) => ({ target: p.target, realm: p.realm }),
      // An answer that is not a whole list of folders is a failed read, never "no folders". Its home is read beside it: an
      // unknown home leaves the folders as they are.
      select: (raw): Cwds | null => {
        const folders = foldersOf(raw);
        return folders ? { folders, home: homeOf(raw) } : null;
      },
    },
  },
});

export interface ClaudeRead {
  /** null until both reads settled (or with no realm to read in). */
  claude: ClaudeCode | null;
  /** The realm's default backend is Claude Code (getACPDefault), to preselect Runs with; null when not known. */
  preferClaude: boolean | null;
  failed: boolean;
  retry: () => void;
}

const settled = (q: { data?: unknown; error: unknown; isSuccess: boolean; isError: boolean }): Settled<unknown> | null =>
  q.isSuccess ? { ok: true, body: q.data } : q.isError ? { ok: false, err: errOf(q.error) } : null;

function errOf(e: unknown): providers.Outcome {
  const x = (e ?? {}) as { status?: unknown; code?: unknown };
  return { kind: 'failed', code: typeof x.code === 'string' ? x.code : '', status: typeof x.status === 'number' ? x.status : 0, retryAfter: null, details: {} };
}

/** Claude Code's state on the shown computer in `realm` (one realm; '' reads nothing). */
export function useClaude(realm: string): ClaudeRead {
  const on = realm !== '';
  const version = source.useQuery<unknown, undefined>('version', undefined, { enabled: on });
  const caps = providers.parseVersion(version.data);
  const defOn = on && version.isSuccess && providers.cap(caps, providers.CAPS.acpDefault);
  const acp = source.useQuery<unknown, string>('acp', realm, { enabled: on });
  const def = source.useQuery<unknown, string>('acpDefault', realm, { enabled: defOn });
  return useMemo(() => {
    // An answer the Hub cannot read says nothing about Claude Code: unknown (failed), never "not set up".
    // Parsed once at the boundary; claudeOf is handed only the body rebuilt from the parsed value, never the raw answer.
    const parsed = acp.isSuccess ? parseAcpAgents(acp.data) : null;
    const malformed = acp.isSuccess && parsed === null;
    const a = parsed ? { ok: true as const, body: acpWire(parsed) } : malformed ? null : settled(acp);
    // An agent without the capability has no default to read: Hoody's own agent is the default there.
    const d = defOn ? settled(def) : version.isSuccess ? null : undefined;
    const claude = a && d !== undefined && !(defOn && d === null) ? claudeOf(a, d) : null;
    return {
      claude,
      preferClaude: claude ? claude.selected : null,
      failed: acp.isError || version.isError || malformed,
      retry: () => {
        void version.refetch();
        void acp.refetch();
        if (defOn) void def.refetch();
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the queries' answers are the inputs
  }, [acp.data, acp.error, acp.isSuccess, acp.isError, def.data, def.error, def.isSuccess, def.isError, defOn, version.isSuccess, version.isError]);
}

export interface FoldersRead {
  folders: readonly string[];
  /** 'ok' only for an answer that is a whole list: "No folders yet" is said only then. 'off': nothing is read (no
   *  realm, or the computer is not readable), so nothing is said. */
  state: 'off' | 'loading' | 'failed' | 'ok';
  /** null while nothing may be read (a stopped computer): no Try again then. */
  retry: (() => void) | null;
  /** The agent's home folder (homeOf), only from an answered read; null when not known (an older agent, or not read yet). */
  home: string | null;
  /** The computer read (null while nothing is read): the folder field's type-or-browse reads go to it. Absent in a fixture
   *  that reads nothing. */
  target?: Target | null;
}

/** The folders chats ran in on `target` in `realm` (one realm; null target or '' realm reads nothing). */
export function useFolders(target: Target | null, realm: string): FoldersRead {
  const on = !!target && realm !== '';
  const q = source.useQuery<Cwds | null, { target: Target; realm: string }>('cwds', { target: target as Target, realm }, { enabled: on });
  const list = q.data?.folders ?? null;
  return {
    folders: list ?? [],
    // Only the latest read's: a home kept from an earlier answer is not offered while the read fails.
    home: on && !q.isError ? (q.data?.home ?? null) : null,
    state: !on ? 'off' : q.isError || q.data === null ? 'failed' : list ? 'ok' : 'loading',
    retry: on ? () => void q.refetch() : null,
    target: on ? target : null,
  };
}
