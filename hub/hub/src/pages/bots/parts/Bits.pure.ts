// The bots page's status tones, the bridge from a Change to the kit's outcome shape and the computer's page links
// (split out of Bits.tsx so the terminal build shares them; Bits.tsx re-exports them).
import { followPageLink, useGo, usePageLink, type OutcomeLike, type Tone } from '@kit';
import { useCallback } from 'react';
import { computerHandle } from '@core';
import { links as computerLinks } from '../../computers/links';
import { logsLinkFor } from '../../logs/links';
import type { BotStatus, Change, Computer } from '../data';

/** "Waiting for you" is the only accent pill on the page. */
export const STATUS_TONE: Record<BotStatus, Tone> = { waiting: 'accent', working: 'info', queued: 'info', paused: 'warn', idle: 'neutral' };

/** A Change's outcome for a dialog: only what still needs the person (a done one is not repeated). */
export function dialogOutcome<T, V>(change: Change<T, V>): OutcomeLike | undefined {
  const o = outcomeOf(change);
  return o && o.kind !== 'done' ? o : undefined;
}

/** A Change as the kit's OutcomeLike; undefined while nothing has been sent. */
export function outcomeOf(change: Pick<Change<unknown, never>, 'outcome' | 'code'>): OutcomeLike | undefined {
  if (change.outcome === 'idle' || change.outcome === 'running' || change.outcome === 'done') return change.outcome === 'done' ? { kind: 'done' } : undefined;
  return { kind: change.outcome, code: change.code };
}

/**
 * Where a Bot's computer lives elsewhere in the Hub, through the shell's page links: Open computer (this computer on
 * Computers) and Logs (the computer's Bot logs). A Hub link goes by the router, and a page this load hides (a null
 * link) gives no function at all, so the menus show no entry for it (there is no classic Hub link).
 */
export function useComputerGoes(): (computer: Computer | undefined) => { openComputer?: () => void; openLogs?: () => void } {
  const computersLink = usePageLink('computers');
  const logsLink = usePageLink('logs');
  const go = useGo();
  return useCallback(
    (computer) => {
      if (!computer) return {};
      const handle = computerHandle(computer);
      return {
        ...(computersLink ? { openComputer: () => (computersLink.kind === 'hub' ? go(computerLinks.item(handle)) : followPageLink(computersLink, go)) } : {}),
        ...(logsLink ? { openLogs: () => (logsLink.kind === 'hub' ? go(logsLinkFor({ computer: handle, source: 'bots' })) : followPageLink(logsLink, go)) } : {}),
      };
    },
    [computersLink, logsLink, go],
  );
}
