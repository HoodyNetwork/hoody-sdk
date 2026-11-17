// The restore predicate (recover.ts) as a page reads it: the draft's stored record (read again on every store change), the
// account's containers list, and the current attempt's stored prompt (read once per record binding and attempt). Check again
// reads all three again. Flow's start, its leave guards and Make it live all ask this one answer.
import { useComputersAll, type ComputersAll } from '@core';
import { useCallback, useEffect, useState } from 'react';
import { attemptPrompt } from '../data';
import { useDraftRecord } from './record';
import { promptToRead, recoverable, type PromptRead, type Recover } from './recover';

/** The containers answer as bindingOfDraft reads it: a list that came whole in one read proves a missing computer gone. */
export function containersOf(all: Pick<ComputersAll, 'rows' | 'complete'>): unknown {
  return all.rows ? { data: { computers: all.rows, pagination: { totalPages: all.complete ? 1 : 2 } } } : undefined;
}

export function useRecover(draftId: string): { r: Recover; recheck: () => void } {
  const all = useComputersAll();
  const containers = containersOf(all);
  const [tick, setTick] = useState(0);
  const record = useDraftRecord(draftId, tick);
  const want = promptToRead(record, containers);
  const key = want ? JSON.stringify([want.binding.target.project.id, want.binding.target.container.id, want.binding.realm, want.binding.owner, want.n]) : '';
  const [read, setRead] = useState<{ key: string; tick: number; p: PromptRead } | null>(null);
  useEffect(() => {
    if (!want) return;
    let live = true;
    const n = want.n;
    void attemptPrompt(want.binding, draftId, n).then(
      (a) => { if (live) setRead({ key, tick, p: a === 'unreadable' ? 'unreadable' : a === 'none' ? { n, none: true } : { n, text: a.text } }); },
      () => { if (live) setRead({ key, tick, p: 'unreadable' }); },
    );
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the binding and attempt's key, and Check again, are the triggers
  }, [key, tick, draftId]);
  // Only a read of this binding and attempt counts; one of an older key is never taken for this attempt's.
  const prompt = read && read.key === key ? read.p : undefined;
  const retryList = all.retry;
  // Check again: the record, the list and the prompt are all read again (the record also on every store change).
  const recheck = useCallback(() => { retryList(); setTick((x) => x + 1); }, [retryList]);
  return { r: recoverable(record, containers, prompt), recheck };
}
