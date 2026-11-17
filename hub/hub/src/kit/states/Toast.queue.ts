// The toast queue's class: React Aria's (react-stately) ToastQueue, so the web ToastRegion can read it. The one queue
// instance is made in Toast.store.ts. The terminal build has its own copy of this class (Toast.queue.term.ts), because
// react-stately is a web-only package there; the store logic itself is shared.
import { UNSTABLE_ToastQueue as ToastQueue } from 'react-aria-components';

export type { ToastQueue };

/** A new queue showing at most `maxVisibleToasts` (newest first). */
export function createToastQueue<T>(options: { maxVisibleToasts: number }): ToastQueue<T> {
  return new ToastQueue<T>(options);
}
