// The TODOs list's reads, in the realm shown: the list (GET /todos, with its store poll cursor), the cursor
// alone (GET /todos/revision, polled), and one todo with its thread (GET /todos/{id}, in the same realm view: a realm's
// view holds its own todos and the global ones, and a realm-pinned agent refuses any other realm). When the
// polled cursor moves past the list's, the list and the open todo are read again. Read-only: TODO actions are actions.ts.
// "The realm shown" is the page's (aiRealm.ts): under All realms the computer's own, named on every read, since the
// context's is then 'all', which these one-realm routes refuse unsent.
import { coreSource, defineRoute, isRealmOrGlobal, type SourceError } from '@core';
import { useEffect, useRef } from 'react';
import { useAiRealm } from '../../aiRealm';
import { cursorOf, moved, threadOf, todoList, type Thread, type TodoList } from './logic';

export const todoRoutes = {
  list: defineRoute({ method: 'GET', path: '/todos', scope: 'agent', realm: 'realm' }),
  revision: defineRoute({ method: 'GET', path: '/todos/revision', scope: 'agent', realm: 'realm' }),
  todo: defineRoute({ method: 'GET', path: '/todos/:id', scope: 'agent', realm: 'realm' }),
} as const;

/** How often the store cursor is polled. */
export const POLL_MS = 10_000;

const source = coreSource('ai', {
  reads: {
    'auto.todos': { route: todoRoutes.list, input: (realm?: string) => (realm ? { realm } : {}), select: (raw) => todoList(raw, Date.now()) },
    'auto.todosRev': {
      route: todoRoutes.revision,
      input: (realm?: string) => (realm ? { realm } : {}),
      select: (raw) => cursorOf((raw as { revision?: unknown } | null)?.revision),
    },
    'auto.todo': {
      route: todoRoutes.todo,
      input: (p?: { id: string; realm?: string }) => (p ? { params: { id: p.id }, ...(p.realm ? { realm: p.realm } : {}) } : {}),
      select: (raw) => threadOf(raw, Date.now()),
    },
  },
});

export interface TodosRead {
  list: TodoList | undefined;
  isPending: boolean;
  /** The list's read error. */
  error: SourceError | null;
  /** The cursor poll failed or answered malformed: the list shown may be out of date. */
  pollError: SourceError | null;
  refetch: () => void;
  /** Checks the cursor again. */
  repoll: () => void;
}

/** The page's one realm, named on the call; none (the context's) when it has none to name. */
function useNamedRealm(): string | undefined {
  const { realm } = useAiRealm();
  return isRealmOrGlobal(realm) ? realm : undefined;
}

/** The list, read again whenever the polled store cursor moves past the one it was read at. */
export function useTodos(): TodosRead {
  const realm = useNamedRealm();
  const q = source.useQuery<TodoList, string | undefined>('auto.todos', realm);
  const rev = source.useQuery<number, string | undefined>('auto.todosRev', realm, { refetchInterval: POLL_MS, enabled: q.data !== undefined });
  const listRev = q.data?.revision;
  const polled = rev.data;
  // The polled cursor that last triggered a re-read: each polled value triggers at most one, even when the re-read
  // list answers at yet another cursor. Cleared when the poll has no value (a realm or account change drops it).
  const handled = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (polled === undefined) handled.current = undefined;
    else if (moved(listRev, polled) && handled.current !== polled) {
      handled.current = polled;
      void source.invalidate(['auto.todos', 'auto.todo']);
    }
  }, [listRev, polled]);
  return {
    list: q.data,
    isPending: q.isPending,
    error: q.error ?? null,
    pollError: rev.error ?? null,
    refetch: () => {
      void q.refetch();
      if (rev.error) void rev.refetch();
    },
    repoll: () => void rev.refetch(),
  };
}

export function useTodo(id: string | undefined) {
  const realm = useNamedRealm();
  return source.useQuery<Thread, { id: string; realm?: string } | undefined>('auto.todo', id ? { id, ...(realm ? { realm } : {}) } : undefined, { enabled: !!id });
}
