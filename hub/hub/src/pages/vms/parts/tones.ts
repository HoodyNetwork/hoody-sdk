// The colour of each row kind's state word, shared by the list and a VM's own screen.
import type { Tone } from '@kit';
import type { RowKind } from '../logic';

export const KIND_TONE: Record<RowKind, Tone> = {
  stopped: 'neutral', runFailed: 'danger', running: 'ok', paused: 'warn', starting: 'info', stopping: 'info', creating: 'info', createFailed: 'danger',
  orphaned: 'warn', unknown: 'neutral',
};
