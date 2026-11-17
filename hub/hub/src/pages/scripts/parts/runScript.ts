// Run a scheduled script once, now (exec's schedules/trigger): the one implementation, shared by the list's Run now and the
// Overview's Schedule card. One press sends one request under core's `exec.script.run` lock (keyed
// by the path; Schedules presses the same lock), never resent; the toast tells what became of it.
import { useGo, useStrings, showErrorToast, showToast } from '@kit';
import { chooseComputer, type Target } from '@core';
import { useScriptsTarget, useTrigger } from '../data';
import { heldRunRelease, runsHref, runToastFor } from '../logic';
import { ownHoldOf } from './ops';
import strings from '../strings.en.json';

export type RunScript = (i: { compId: string; compHandle: string; path: string }, bound?: Target) => void;

export function useRunScript(): RunScript {
  const t = useStrings(strings);
  const go = useGo();
  const trigger = useTrigger();
  const scriptsTarget = useScriptsTarget();
  return run;

  function run(i: { compId: string; compHandle: string; path: string }, bound?: Target): void {
    // The computer this run is for, bound at the first press (the list shows the selected computer's scripts): Try again
    // sends to it even after the person switched computers.
    const target = bound ?? (scriptsTarget?.container.id === i.compId ? scriptsTarget : undefined);
    // Only to the script's own computer: with no target, core sends to the computer the shell
    // shows now, so a script whose computer is not that one (the shell switched while its page was open) is refused unsent.
    if (!target) {
      showToast({ title: t('run.failed'), tone: 'info', body: t('run.notShown') });
      return;
    }
    void trigger.mutateAsync({ compId: i.compId, path: i.path, ...(target ? { target } : {}) }).then(async (r) => {
      const k = runToastFor(r.outcome, r.code);
      // A refused or unsent run started nothing: Try again sends one new run (the press the person makes), to the same computer.
      const again = { label: t('run.again'), onAction: () => run(i, target) };
      // No read proves a run: its runs are where its state shows (Logs, or the script's Overview for another folder), so a
      // run whose outcome is not known is read there. Logs names the run's computer in its own link. This page lists the
      // computer the shell shows, so another folder's script is opened on the run's computer (bound at the press): after a
      // switch the shell shows that computer again, and the script is found there, never read as gone from another list.
      const log = { label: t('run.seeRuns'), onAction: () => {
        const href = runsHref(i.compHandle, i.path);
        if (target && href.startsWith('/scripts')) chooseComputer({ id: target.container.id, project_id: target.project.id, ...(target.container.server_name !== undefined ? { server_name: target.container.server_name } : {}) });
        go(href);
      } };
      if (k.key === 'run.failed') {
        // The whole result goes to Details: core reads the decided outcome from it and the rejection's facts from its error.
        // A run is a change, so an answer that may have gone through still turns pending, and then reads its runs.
        if (k.tone === 'error') showErrorToast(t('run.failed'), r, { retry: again, check: log });
        // Not sent: nothing started, so there is nothing to read and Try again is the way on.
        else showToast({ title: t('run.failed'), tone: 'info', action: again });
        return;
      }
      if (k.key === 'run.started') { showToast({ title: t('run.started'), tone: 'ok' }); return; }
      if (k.key === 'run.pending') { showToast({ title: t('run.pending'), tone: 'unknown', body: t('run.pendingBody'), action: log /* noDetails: no answer decided this run; its runs show what became of it, and the action opens them */ }); return; }
      // Still checking an earlier run the kit holds: the one action is the warned Dismiss naming that hold (it frees it, so
      // the person can run again knowingly; the body sends them to its runs first). Without a hold it frees nothing, so the
      // action opens the runs instead.
      const release = heldRunRelease(trigger, { compId: i.compId, path: i.path }, ownHoldOf(trigger, i.path, i.compId, r.hold));
      showToast({ title: t('run.checking'), tone: 'unknown', body: t('run.checkingBody'), action: release ? { label: t('run.check'), onAction: release } : log /* noDetails: nothing was sent (the kit holds the earlier run); that run shows in the script's runs */ });
    });
  }
}
