// The broadcast's Hoody API data: the computer's broadcast aliases (the viewer links), and their create and remove.
//
// Contract, in plain words:
//   - Source 'board-broadcast' over core: read `aliases` {computer} (the realm's alias list for that computer, cut to
//     broadcast aliases to show plus every alias id for the remove proof, link.ts), changes `aliasCreate` {computer, name, until},
//     `aliasRemove` {computer, alias} and `aliasRenew` {computer, alias, until} (the live link's expiry moved on).
//   - Every change takes core's shared alias lock (aliasLock, as Computers and Scripts do): a create is keyed by its
//     computer and pipe name, a remove and a renew by the alias id (so a renew whose outcome is unknown holds the
//     remove until it is read back), so an unknown outcome holds that one change everywhere and
//     nothing is sent twice. Their read-back is `aliases`: createProves / removeProves / renewProves (link.ts) are the only
//     verdicts; nothing else frees them.
//   - The live stream itself is not a Hoody API change (core upload() through the pipe's live route): never here.
import { aliasLock, aliasRoutes, coreSource, type SourceTable } from '@core';
import { aliasBody, aliasListOf, aliasOf, createProves, removeProves, renewProves, type AliasList, type BroadcastAlias } from './link';

export interface CreateVars { readonly computer: string; readonly name: string; readonly until: string }
export interface RemoveVars { readonly computer: string; readonly alias: string }
export interface RenewVars { readonly computer: string; readonly alias: string; readonly until: string }

const table: SourceTable = {
  reads: {
    aliases: {
      route: aliasRoutes.list,
      input: (p: { computer: string }) => ({ query: { computer_id: p.computer } }),
      select: (raw, p: { computer: string }) => aliasListOf(raw, p?.computer ?? ''),
    },
  },
  changes: {
    aliasCreate: {
      route: aliasRoutes.create,
      input: (v: CreateVars) => ({ body: aliasBody(v.computer, v.name, v.until) }),
      select: (raw) => aliasOf((raw as { data?: unknown } | null)?.data),
      reads: ['aliases'],
      lock: aliasLock.lock,
      lockKey: (v: CreateVars) => ({ computer: v.computer, name: v.name }),
      identity: (v: CreateVars) => ({ computer: v.computer, name: v.name, until: v.until }),
      proves: createProves,
    },
    aliasRemove: {
      route: aliasRoutes.remove,
      input: (v: RemoveVars) => ({ params: { id: v.alias } }),
      reads: ['aliases'],
      lock: aliasLock.lock,
      lockKey: (v: RemoveVars) => aliasLock.key(v.alias),
      identity: (v: RemoveVars) => ({ ...aliasLock.key(v.alias), computer: v.computer }),
      proves: removeProves,
    },
    aliasRenew: {
      route: aliasRoutes.edit,
      input: (v: RenewVars) => ({ params: { id: v.alias }, body: { expires_at: v.until } }),
      reads: ['aliases'],
      lock: aliasLock.lock,
      lockKey: (v: RenewVars) => aliasLock.key(v.alias),
      identity: (v: RenewVars) => ({ ...aliasLock.key(v.alias), computer: v.computer, until: v.until }),
      proves: renewProves,
    },
  },
};

export const source = coreSource('board-broadcast', table);

export const useBroadcastAliases = (computer: string | undefined) =>
  source.useQuery<AliasList | null, { computer: string }>('aliases', { computer: computer ?? '' }, { enabled: !!computer });
export const useCreateLink = () => source.useMutation<BroadcastAlias | null, CreateVars>('aliasCreate');
export const useRemoveLink = () => source.useMutation<unknown, RemoveVars>('aliasRemove');
export const useRenewLink = () => source.useMutation<unknown, RenewVars>('aliasRenew');
