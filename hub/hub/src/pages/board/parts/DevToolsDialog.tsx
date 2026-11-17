// DevTools for a browser tile: the address a DevTools client connects to, for browser-N.
//
// Contract, in plain words:
//   - Opening reads browser-N's DevTools address (browserStart readDevtools: a read with start=false, it never starts
//     the browser). The address grants access to the browser, so it is never shown, not even in part:
//     the dialog offers Open DevTools (a new tab, noopener) and Copy address only, and the address goes in no notice
//     or log. It is the cdp-N base address the kit advises for connectOverCDP.
//   - Not running (404): says so (the tile starts it when opened). A failed read says so, with Try again. An answer
//     without an address (Firefox has none) says so.
//   - Every opening reads afresh: what an earlier opening read is dropped on close (or a move to another browser),
//     so Open and Copy show only once this opening's read answered. A read that answers after the dialog closed or
//     moved is dropped.
import { Button, CopyButton, Dialog, Row, openOutside } from '@kit';
import { useEffect, useState } from 'react';
import type { BoardComputer } from '../computers';
import { readDevtools } from './browserStart';
import { useT } from './text';

export interface DevToolsTarget {
  readonly computer: BoardComputer;
  readonly session: number;
  readonly name: string;
}

type Read = { k: string; r: string | 'down' | 'none' | 'failed' };

export function DevToolsDialog({ target, onClose }: { target: DevToolsTarget | null; onClose: () => void }) {
  const t = useT();
  const key = target ? target.computer.id + '\n' + target.session : '';
  const [read, setRead] = useState<Read | null>(null);
  const [gen, setGen] = useState(0);
  // Closing (key '') or another browser drops the last answer during render, before anything shows it.
  const [shownKey, setShownKey] = useState(key);
  if (shownKey !== key) { setShownKey(key); setRead(null); }
  useEffect(() => {
    if (!target) return;
    const ac = new AbortController();
    readDevtools(target.computer, target.session, ac.signal).then((r) => {
      if (!ac.signal.aborted) setRead({ k: key, r: r === null ? 'failed' : r });
    });
    return () => ac.abort();
    // The key names the target; the object changes with every list read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, gen]);

  if (!target) return <Dialog isOpen={false} onOpenChange={() => undefined} title="" />;
  const r = read && read.k === key ? read.r : null;
  const address = r !== null && r !== 'down' && r !== 'none' && r !== 'failed' ? r : null;
  const vars = { name: target.name };
  const body = r === null ? t('devtools.reading') : r === 'down' ? t('devtools.down', vars) : r === 'failed' ? t('devtools.failed') : r === 'none' ? t('devtools.none', vars) : t('devtools.body');
  return (
    <Dialog
      isOpen
      onOpenChange={(o) => { if (!o) onClose(); }}
      title={t('devtools.title', vars)}
      body={body}
      {...(address ? { primaryLabel: t('devtools.open'), onPrimary: () => { openOutside(address); } } : {})}
    >
      {(address || r === 'failed') && (
        <Row gap={2} wrap>
          {address && <CopyButton text={address} label={t('devtools.copy')} withLabel size="md" />}
          {r === 'failed' && <Button variant="secondary" onPress={() => { setRead(null); setGen((g) => g + 1); }}>{t('tile.tryAgain')}</Button>}
        </Row>
      )}
    </Dialog>
  );
}
