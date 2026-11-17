// The server detail's data: a second core source of the computers page, under its own keys (it never shares a cache
// entry with data.ts). The list answers the rich rows (specs, rental end, capacity); the runtime read is the live
// usage, JWT-only and never realm-scoped. The one change is a server command (send once, C9): the commands read lists
// what may be run, the change runs one, and nothing proves a lost answer (no `proves`: only the person's warned Dismiss frees it).
import { coreSource, defineRoute, serversRoute, type SourceTable } from '@core';
import { commandsOf, identityOf, requestBody, resultOf, type CommandList, type RunResult, type RunVars } from './ServerDetail.commands.logic';
import { pickFacts, runtimeOf, type ServerFacts, type ServerRuntime, type Who } from './ServerDetail.logic';

const routes = {
  rows: serversRoute,
  runtime: defineRoute({ method: 'GET', path: '/rentals/:id/runtime', scope: 'base' }),
  commands: defineRoute({ method: 'GET', path: '/servers/:id/available-commands', scope: 'base' }),
  execute: defineRoute({ method: 'POST', path: '/servers/:id/execute-command', scope: 'base', body: ['command_id', 'parameters', 'wait'] }),
} as const;
export { routes as serverDetailRoutes };

const table: SourceTable = {
  reads: {
    serverFacts: { route: routes.rows, select: (raw, p: Who) => pickFacts(raw, p) },
    serverRuntime: { route: routes.runtime, input: (p: { id: string }) => ({ params: { id: p.id } }), select: (raw, p: { id: string }) => runtimeOf(raw, p.id) },
    serverCommands: { route: routes.commands, input: (p: { id: string }) => ({ params: { id: p.id } }), select: (raw) => commandsOf(raw) },
  },
  changes: {
    // One command at a time per server: a held run (its outcome unknown) holds every further run on that server. The
    // identity keeps the names, never the parameters. `reads` lets Check again refresh the usage shown; with no `proves`
    // no read ever frees the hold.
    runCommand: {
      route: routes.execute,
      input: (v: RunVars) => ({ params: { id: v.serverId }, body: requestBody({ id: v.commandId, readOnly: v.readOnly }, v.params) }),
      select: (raw, v: RunVars) => resultOf(raw, v.readOnly) ?? undefined,
      reads: ['serverRuntime'],
      lock: 'server.command',
      lockKey: (v: RunVars) => ({ server: v.serverId }),
      identity: (v: RunVars) => identityOf(v),
    },
  },
};

const source = coreSource('computers', table);

/** The rich row of one server; null while the list has no such row (the panel then shows what the Servers view has). */
export const useServerFacts = (who: Who, enabled: boolean) =>
  source.useQuery<ServerFacts | null, Who>('serverFacts', who, { enabled: enabled && !!who.serverId });
/** The server's live usage; fails (shown as "not available") for a shared host or a realm-scoped view. */
export const useServerRuntime = (rentalId: string, enabled: boolean) =>
  source.useQuery<ServerRuntime | null, { id: string }>('serverRuntime', { id: rentalId }, { enabled: enabled && !!rentalId });

/** What may be run on this server (never for a free or shared one: the API lists none there); null while unread. */
export const useServerCommands = (serverId: string, enabled: boolean) =>
  source.useQuery<CommandList | null, { id: string }>('serverCommands', { id: serverId }, { enabled: enabled && !!serverId });
/** The server command change (send once; a lost answer is held, never resent). */
export const useRunServerCommand = () => source.useMutation<RunResult | undefined, RunVars>('runCommand');
