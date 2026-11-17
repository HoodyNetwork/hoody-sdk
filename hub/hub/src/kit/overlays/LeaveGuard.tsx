// LeaveGuard: a leave guard for a page that holds something running (a live broadcast). While `active`, every
// navigation that changes the path (a link, Back or Forward to another page) is held and calls
// `onBlock(proceed, reset)`, so the page asks in its own dialog, ends what runs, then calls proceed() (or reset()
// to stay); a reload gets the browser's own prompt. A navigation that keeps the path (a search change, a Drawer's
// own close stepping Back over its entry) passes. Unlike the Drawer's guard it never reads the deliberate-close
// token (allowNextNavigation): that token is single use and belongs to the Drawer's guard.
// Without a router (unit tests of a part) it renders nothing.
import { useEffect, useRef } from 'react';
import { useBlocker, useRouter } from '@tanstack/react-router';

export interface LeaveGuardProps {
  active: boolean;
  onBlock: (proceed: () => void, reset: () => void) => void;
}

export function LeaveGuard({ active, onBlock }: LeaveGuardProps) {
  const hasRouter = Boolean(useRouter({ warn: false }));
  return hasRouter && active ? <Blocker onBlock={onBlock} /> : null;
}

function Blocker({ onBlock }: Pick<LeaveGuardProps, 'onBlock'>) {
  const blocker = useBlocker({
    shouldBlockFn: ({ current, next }) => current.pathname !== next.pathname,
    enableBeforeUnload: true,
    withResolver: true,
  });
  const onBlockRef = useRef(onBlock);
  onBlockRef.current = onBlock;
  useEffect(() => {
    if (blocker.status === 'blocked') onBlockRef.current(blocker.proceed, blocker.reset);
  }, [blocker.status, blocker.proceed, blocker.reset]);
  return null;
}
