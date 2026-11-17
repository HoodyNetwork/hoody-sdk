// What every section reads: the read model, the Api, the Env and a few page-level actions.
import { createContext, useContext } from 'react';
import type { Api, Env } from '../api';
import type { AiModel } from './model';

export interface AiCtx {
  m: AiModel;
  api: Api;
  env: Env;
  /** Refetch everything the page reads. */
  reload: () => void;
  /** Opens the connect drawer, optionally at one provider, or at the endpoint form. */
  connect: (providerId?: string, o?: { endpoint?: boolean }) => void;
  /** Jumps to a section. */
  goto: (id: string) => void;
}

const Ctx = createContext<AiCtx | null>(null);
export const AiProvider = Ctx.Provider;

export function useAi(): AiCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAi outside the ai page');
  return c;
}
