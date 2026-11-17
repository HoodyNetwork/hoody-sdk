// "/fork" and "/trim" in the chat's "/" menu run the reply menu's OWN items (Fork from here, Fork this chat, Remove what follows),
// never a copy: the kit's TurnRun runs them (kit/agent/TurnRun.tsx). This file keeps the page's names for it.
import { TurnRun, type TurnAsk, type TurnProviders } from '@kit';

export { turnArg, type TurnAsk, type TurnAskOf, type TurnProviders } from '@kit';

/** Runs one typed ask with the chat's turn-menu providers (none: nothing). */
export function SlashTurns({ ask, providers }: { ask: TurnAsk | null; providers: TurnProviders }) {
  return <TurnRun ask={ask} items={providers} />;
}
