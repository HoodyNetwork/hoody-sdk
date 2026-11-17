// LocalPort: what Open on a local address shows. The
// address was written for the computer the chat runs on (`localhost:3000`), so the Hub reads that computer's listeners once, when
// the card opens (core computerRuntime: never polled), and says what port 3000 is there:
//   web     it has a web address: Open (a new tab on the real port's address, the written path and query kept) and, where the
//           host's Board can hold it, Put on Board.
//   local   the program listens only inside the computer (127.0.0.1 or ::1), so nothing outside reaches it: the card says so, and
//           Ask the agent to fix it puts a request in the chat's draft (never sent by itself) where the host has a draft.
//   other   not a web port (a database, mail); system: one of Hoody's own; none: nothing listens there now.
// A read that fails says so with Try again; Check again reads once more. Nothing opens before the card's own read answers: the
// card sends it when it opens (core refreshFresh, own: a request sent now, joining no read already out, and counted by the fetch's
// own answer, never a clock), so a cached answer or another page's earlier read never stands in for it.
import { useCallback, useEffect, useRef, useState } from 'react';
import { computerRuntime, portListening, refreshFresh } from '@core';
import { Button, LinkButton } from '../controls/Button';
import { Spinner } from '../states/States';
import { useStrings } from '../strings';
import { useLinkHost, type LocalOpen } from './linkHost';
import strings from './LinkMark.strings.en.json';
import s from './Conversation.module.css';

export function LocalPort({ open, name, label, close }: { open: LocalOpen; name: string; label: string; close: () => void }) {
  const t = useStrings(strings);
  const host = useLinkHost();
  const q = computerRuntime.use(open.computer);
  // 'reading' until the card's first own read answers; then the last one's outcome. `busy` while one is out.
  const [read, setRead] = useState<'reading' | 'fresh' | 'failed'>('reading');
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  const id = open.computer;
  const readNow = useCallback(() => {
    setBusy(true);
    const key = JSON.stringify(computerRuntime.key(id));
    void refreshFresh((k) => JSON.stringify(k) === key, { own: true }).then((r) => {
      if (!alive.current) return;
      setRead(r.state === 'fresh' ? 'fresh' : 'failed');
      setBusy(false);
    });
  }, [id]);
  const sent = useRef(false);
  useEffect(() => {
    alive.current = true;
    if (!sent.current) { sent.current = true; readNow(); }
    return () => { alive.current = false; };
  }, [readNow]);
  const n = String(open.port);
  const again = (
    <Button size="sm" variant="ghost" busy={busy} onPress={readNow}>
      {t('local.again')}
    </Button>
  );
  if (read === 'reading') {
    return (
      <div className={s.localCard}>
        <Spinner />
        <p className={s.localText} role="status">{t('local.checking', { n, name })}</p>
      </div>
    );
  }
  if (read === 'failed' || !q.data) {
    return (
      <div className={s.localCard}>
        <p className={s.localText}>{t('local.failed', { name })}</p>
        <div className={s.localActions}>
          <Button size="sm" busy={busy} onPress={readNow}>{t('mark.retry')}</Button>
        </div>
      </div>
    );
  }
  const now = portListening(q.data, open.port);
  if (now === 'web') {
    const board = open.board && host?.boardAdd ? host.boardAdd({ ...open.board, label }) : '';
    return (
      <div className={s.localCard}>
        <p className={s.localText}>{t('local.web', { n, name })}</p>
        <div className={s.localActions}>
          <LinkButton size="sm" variant="primary" href={open.href} iconEnd="external" aria-label={t('mark.open', { label })}>
            {t('local.open')}
          </LinkButton>
          {board && (
            <Button size="sm" icon="board" onPress={() => { close(); host?.openHub(board); }}>
              {t('mark.board')}
            </Button>
          )}
        </div>
      </div>
    );
  }
  if (now === 'local') {
    const ask = host?.ask;
    return (
      <div className={s.localCard}>
        <p className={s.localText}>{t('local.inside', { n, name })}</p>
        <div className={s.localActions}>
          {ask && (
            <Button size="sm" variant="primary" onPress={() => { ask(t('local.askText', { n })); close(); }}>
              {t('local.ask')}
            </Button>
          )}
          {again}
        </div>
      </div>
    );
  }
  return (
    <div className={s.localCard}>
      <p className={s.localText}>{t(now === 'other' ? 'local.other' : now === 'system' ? 'local.system' : 'local.none', { n, name })}</p>
      <div className={s.localActions}>{again}</div>
    </div>
  );
}
